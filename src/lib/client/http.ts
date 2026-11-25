/**
 * The one way the live display talks to the server: a JSON GET that always
 * settles. A wall screen runs for weeks on a mosque's Wi-Fi, so every request
 * has a deadline, no failure is thrown at the caller, and a page of HTML
 * answering with status 200 (a captive portal) is reported as a bad response
 * rather than parsed.
 *
 * Nothing here touches browser globals directly: the network, the clock and
 * the timers are arguments, so the callers can be tested without a browser.
 */

/** Header the service worker sets on a response it served from its cache. */
export const CACHE_HEADER = "X-Uwais-Cache";

/** Value of {@link CACHE_HEADER} that marks a cached copy. */
export const CACHE_HEADER_STALE = "stale";

/** An opaque timer id; browsers and Node disagree on its type. */
export type TimerHandle = unknown;

/** The timer functions a module needs, replaceable in tests. */
export interface Timers {
  /** Runs `callback` once after `delayMs`. */
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  /** Cancels a timer that has not run yet. */
  clearTimeout(handle: TimerHandle): void;
}

/** The part of a `Response` this module reads. */
export interface ResponseLike {
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** The request options every display request is sent with. */
export interface FetchInit {
  cache: "no-store";
  credentials: "same-origin";
  headers: Record<string, string>;
  signal?: AbortSignal;
}

/** The part of `fetch` this module uses; the global `fetch` satisfies it. */
export type FetchLike = (url: string, init: FetchInit) => Promise<ResponseLike>;

/** What {@link fetchJson} needs from its environment. */
export interface JsonFetchDeps {
  fetch: FetchLike;
  /** The device clock, epoch milliseconds. */
  now(): number;
  timers: Timers;
}

/**
 * How a request ended.
 * - `ok`: a 2xx response whose body parsed as JSON.
 * - `network-error`: no usable response (offline, DNS, timeout, connection dropped).
 * - `bad-response`: the server answered, but not with what was asked for
 *   (an error status, or a body that is not JSON).
 */
export type JsonFetchResult =
  | {
      kind: "ok";
      body: unknown;
      /** True when the service worker answered from its cache. */
      cached: boolean;
      /** Device clock when the request was sent. */
      startedAtMs: number;
      /** Device clock when the response headers arrived. */
      receivedAtMs: number;
    }
  | { kind: "network-error" }
  | { kind: "bad-response" };

/** Rejects the race in {@link fetchJson} when the deadline passes. */
class DeadlineError extends Error {}

/**
 * Sends a GET for JSON and reports how it went; never throws and never hangs.
 * The deadline covers the whole exchange including the download of the body,
 * and holds even where the request itself cannot be aborted.
 * @param url       Same-origin URL to fetch.
 * @param timeoutMs Deadline for the whole exchange.
 */
export async function fetchJson(
  url: string,
  timeoutMs: number,
  deps: JsonFetchDeps,
): Promise<JsonFetchResult> {
  // Very old embedded browsers have fetch but no AbortController.
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer: TimerHandle = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = deps.timers.setTimeout(() => {
      if (controller) controller.abort();
      reject(new DeadlineError());
    }, timeoutMs);
  });
  // The deadline may pass after the race is over; that rejection concerns nobody.
  deadline.catch(() => undefined);

  const startedAtMs = deps.now();
  try {
    const request = deps.fetch(url, {
      // A cached answer would carry an old server clock and old prayer times.
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const response = await Promise.race([request, deadline]);
    const receivedAtMs = deps.now();
    if (!response.ok) return { kind: "bad-response" };
    const cached = response.headers.get(CACHE_HEADER) === CACHE_HEADER_STALE;
    const body = await Promise.race([response.json(), deadline]);
    return { kind: "ok", body, cached, startedAtMs, receivedAtMs };
  } catch (error) {
    // Only a body that is not JSON raises SyntaxError; everything else means
    // the exchange never completed.
    return { kind: error instanceof SyntaxError ? "bad-response" : "network-error" };
  } finally {
    deps.timers.clearTimeout(timer);
  }
}
