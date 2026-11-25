import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson, type FetchInit, type FetchLike, type JsonFetchDeps } from "./http";
import { globalTimers, htmlResponse, jsonResponse } from "./testing";

const TIMEOUT_MS = 10_000;

function depsWith(fetch: FetchLike): JsonFetchDeps {
  return { fetch, now: () => Date.now(), timers: globalTimers };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchJson", () => {
  it("returns the parsed body and the device times that bracket the exchange", async () => {
    const fetch: FetchLike = () =>
      new Promise((resolve) => setTimeout(() => resolve(jsonResponse({ hello: "world" })), 120));

    const pending = fetchJson("/api/version", TIMEOUT_MS, depsWith(fetch));
    await vi.advanceTimersByTimeAsync(120);

    expect(await pending).toEqual({
      kind: "ok",
      body: { hello: "world" },
      cached: false,
      startedAtMs: 1_000_000,
      receivedAtMs: 1_000_120,
    });
  });

  it("asks for an uncached, same-origin JSON response and passes an abort signal", async () => {
    const calls: Array<{ url: string; init: FetchInit }> = [];
    const fetch: FetchLike = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse({}));
    };

    await fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/display");
    expect(calls[0].init.cache).toBe("no-store");
    expect(calls[0].init.credentials).toBe("same-origin");
    expect(calls[0].init.headers).toEqual({ Accept: "application/json" });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("flags a response the service worker served from its cache", async () => {
    const fetch: FetchLike = () => Promise.resolve(jsonResponse({ a: 1 }, { cached: true }));
    const result = await fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch));
    expect(result).toMatchObject({ kind: "ok", cached: true });
  });

  it("reports an error status as a bad response without reading the body", async () => {
    const json = vi.fn(() => Promise.resolve({}));
    const fetch: FetchLike = () =>
      Promise.resolve({ ok: false, headers: { get: () => null }, json });

    expect(await fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch))).toEqual({
      kind: "bad-response",
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("reports a captive portal's HTML with status 200 as a bad response", async () => {
    const fetch: FetchLike = () => Promise.resolve(htmlResponse());
    expect(await fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch))).toEqual({
      kind: "bad-response",
    });
  });

  it("reports a rejected request as a network error", async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch))).toEqual({
      kind: "network-error",
    });
  });

  it("reports a connection that drops while the body downloads as a network error", async () => {
    const fetch: FetchLike = () =>
      Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () => Promise.reject(new TypeError("network error")),
      });
    expect(await fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch))).toEqual({
      kind: "network-error",
    });
  });

  it("gives up at the deadline, aborts the request and reports a network error", async () => {
    let signal: AbortSignal | undefined;
    const fetch: FetchLike = (_url, init) => {
      signal = init.signal;
      return new Promise(() => undefined);
    };

    const pending = fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch));
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ kind: "network-error" });
    expect(signal?.aborted).toBe(true);
  });

  it("applies the deadline to a body that never finishes downloading", async () => {
    const fetch: FetchLike = () =>
      Promise.resolve({
        ok: true,
        headers: { get: () => null },
        json: () => new Promise(() => undefined),
      });

    const pending = fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch));
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(await pending).toEqual({ kind: "network-error" });
  });

  it("leaves no timer behind once the exchange is over", async () => {
    const fetch: FetchLike = () => Promise.resolve(jsonResponse({}));
    await fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still honours the deadline where the browser has no AbortController", async () => {
    vi.stubGlobal("AbortController", undefined);
    try {
      let init: FetchInit | undefined;
      const fetch: FetchLike = (_url, received) => {
        init = received;
        return new Promise(() => undefined);
      };

      const pending = fetchJson("/api/display", TIMEOUT_MS, depsWith(fetch));
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

      expect(await pending).toEqual({ kind: "network-error" });
      expect(init && "signal" in init).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
