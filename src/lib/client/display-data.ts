/**
 * The display's data: the payload the page was rendered with, kept fresh by
 * polling `GET /api/display`, and kept available when the network is not.
 *
 * The rules that make a wall screen trustworthy for weeks:
 * - The last good payload is never dropped. A failed request changes the
 *   connection status, not the data on screen.
 * - Whatever arrives is checked before it is believed. A captive portal
 *   answers every URL with a page of HTML and status 200.
 * - The last good payload is also kept in `localStorage`. A page that was
 *   itself loaded from an offline cache carries old data in its HTML, and
 *   upgrades itself from storage when storage holds something newer.
 * - Failures back off, successes poll gently, and every delay is jittered so
 *   a hall full of screens does not ask in unison.
 *
 * The first part of the file is pure (validation, selection, storage guards,
 * delays). `createDisplayStore` at the end is the poller, with the network,
 * the clock, the timers and the storage injected.
 */

import { MS_PER_MINUTE, MS_PER_SECOND, isValidDateString } from "@/lib/time";
import {
  TIME_FIELDS,
  type Announcement,
  type DisplayPayload,
  type JumuahSlot,
  type PrayerDay,
  type SiteSettings,
  type TimeField,
  type TimetableCoverage,
} from "@/lib/types";
import {
  browserFetch,
  browserStorage,
  browserTimers,
  isDocumentVisible,
  isNavigatorOnline,
  onPageWake,
  onWindowEvent,
  type StorageLike,
} from "./browser";
import { fetchJson, type JsonFetchDeps, type TimerHandle } from "./http";

/** Endpoint that serves the `DisplayPayload`. */
export const DISPLAY_ENDPOINT = "/api/display";

/** How often the payload is refreshed while all is well. */
export const POLL_INTERVAL_MS = 5 * MS_PER_MINUTE;

/**
 * How often it is refreshed while the page reports itself hidden. Not
 * "never": some signage players report a page as hidden while it is on the wall.
 */
export const HIDDEN_POLL_INTERVAL_MS = 30 * MS_PER_MINUTE;

/** Each delay is spread by this fraction either way. */
export const POLL_JITTER = 0.1;

/** Delay after the first failure; doubles with each further one. */
export const BACKOFF_BASE_MS = 5 * MS_PER_SECOND;

/** Longest delay between attempts while failing. */
export const BACKOFF_MAX_MS = POLL_INTERVAL_MS;

/** Deadline of one request. */
export const REQUEST_TIMEOUT_MS = 10 * MS_PER_SECOND;

/** Refreshes prompted by the network coming back are at least this far apart. */
export const ONLINE_THROTTLE_MS = 5 * MS_PER_SECOND;

/** Refreshes prompted by the page coming back on screen are at least this far apart. */
export const WAKE_THROTTLE_MS = MS_PER_MINUTE;

/**
 * A payload younger than this at first render came straight from the server
 * and needs no immediate refresh. Anything older (or from the future, by the
 * device clock) is refreshed at once.
 */
export const FRESH_PAYLOAD_MS = MS_PER_MINUTE;

/** `localStorage` key of the last good payload. The suffix is the format version. */
export const STORAGE_KEY = "uwais:display:v1";

/** Format version written into the stored record. */
export const STORAGE_VERSION = 1;

/**
 * Largest record written to or read from storage, in characters. A real
 * payload is a few tens of kilobytes; this leaves the origin's quota alone
 * and keeps a corrupted entry from being parsed at every page load.
 */
export const MAX_STORED_CHARS = 500_000;

/** Most timetable rows a believable payload carries (the server sends about 37). */
const MAX_PAYLOAD_DAYS = 1000;

/** Most announcements a believable payload carries. */
const MAX_PAYLOAD_ANNOUNCEMENTS = 500;

/** Most Jumu'ah times a believable day or settings object carries. */
const MAX_PAYLOAD_JUMUAH = 16;

/** Exponent cap of the backoff, so the doubling cannot overflow. */
const MAX_BACKOFF_DOUBLINGS = 16;

/**
 * Whether the data on screen is current.
 * - `live`: the last request reached the server.
 * - `stale`: the server could not be reached properly and saved data is
 *   shown (a cached answer from the service worker, an error status, a
 *   captive portal).
 * - `offline`: the device has no network, or the last request failed at the
 *   network level.
 */
export type ConnectionStatus = "live" | "stale" | "offline";

/** How one attempt to fetch the payload ended. */
export type DisplayFetchOutcome =
  | { kind: "live"; payload: DisplayPayload }
  /** A valid payload that the service worker served from its cache. */
  | { kind: "cached"; payload: DisplayPayload }
  | { kind: "network-error" }
  | { kind: "bad-response" };

/** What the display knows at one moment. Replaced, never mutated. */
export interface DisplaySnapshot {
  /** The newest good payload. */
  payload: DisplayPayload;
  status: ConnectionStatus;
  /** Server clock at which `payload` was produced, epoch milliseconds. */
  lastUpdatedMs: number;
  /**
   * Build id reported by the last live response; equals the version the page
   * was rendered with until the server says otherwise.
   */
  latestVersion: string;
}

/** What the display store needs from its environment. */
export interface DisplayStoreDeps extends JsonFetchDeps {
  /** A number in [0, 1). */
  random(): number;
  /** Where the last good payload is kept, or null when storage is unavailable. */
  storage: StorageLike | null;
  /** Whether the browser believes it has a network. */
  isOnline(): boolean;
  /** Whether the page is on screen. */
  isVisible(): boolean;
  /** Subscribes to "the device has a network again"; returns the unsubscribe function. */
  onOnline(listener: () => void): () => void;
  /** Subscribes to "the device lost its network"; returns the unsubscribe function. */
  onOffline(listener: () => void): () => void;
  /** Subscribes to "the page is in front of the viewer again"; returns the unsubscribe function. */
  onWake(listener: () => void): () => void;
}

/**
 * The display's data as an external store, readable by React with
 * `useSyncExternalStore`. It polls while it has at least one subscriber.
 */
export interface DisplayStore {
  /** Subscribes to snapshot changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** The current snapshot; the same object until something changes. */
  getSnapshot(): DisplaySnapshot;
  /** The snapshot the server rendered with, for hydration. */
  getServerSnapshot(): DisplaySnapshot;
  /** Fetches now, ignoring the throttles; resolves when the attempt has settled. */
  refresh(): Promise<void>;
  /** Hands over a payload from a newer server render; adopted when it is newer than the current one. */
  offer(payload: DisplayPayload): void;
  /**
   * Subscribes to deployments: called once for each new build id a live
   * response reports that differs from the one the page was rendered with.
   * Returns the unsubscribe function.
   */
  onVersionChange(listener: (version: string) => void): () => void;
}

type Check = (value: unknown) => boolean;

const isString: Check = (value) => typeof value === "string";
const isNonEmptyString: Check = (value) => typeof value === "string" && value !== "";
const isStringOrNull: Check = (value) => value === null || typeof value === "string";
const isBoolean: Check = (value) => typeof value === "boolean";
const isFiniteNumber: Check = (value) => typeof value === "number" && Number.isFinite(value);

function isOneOf(...allowed: readonly string[]): Check {
  return (value) => typeof value === "string" && allowed.indexOf(value) !== -1;
}

function isArrayOf(check: Check, maxLength: number): Check {
  return (value) => Array.isArray(value) && value.length <= maxLength && value.every(check);
}

/**
 * A check for an object with at least the given keys. Typing the shape by the
 * keys of `T` makes the compiler insist on a check for every field of the
 * shared contract, including ones added later.
 */
function hasShape<T>(shape: { [K in keyof T]-?: Check }): Check {
  const keys = Object.keys(shape) as Array<keyof T & string>;
  return (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return keys.every((key) => shape[key](record[key]));
  };
}

const timeChecks = TIME_FIELDS.reduce(
  (checks, field) => {
    checks[field] = isStringOrNull;
    return checks;
  },
  {} as Record<TimeField, Check>,
);

const isPrayerDay = hasShape<PrayerDay>({
  ...timeChecks,
  date: isValidDateString,
  jumuah: isArrayOf(isString, MAX_PAYLOAD_JUMUAH),
  note: isStringOrNull,
});

const isJumuahSlot = hasShape<JumuahSlot>({ label: isString, time: isString });

const isSettings = hasShape<SiteSettings>({
  mosqueName: isString,
  shortName: isString,
  tagline: isString,
  address: isString,
  phone: isString,
  email: isString,
  mapUrl: isString,
  donateUrl: isString,
  timezone: isNonEmptyString,
  timeFormat: isOneOf("12h", "24h"),
  hijriAdjustment: isFiniteNumber,
  hijriRollAtMaghrib: isBoolean,
  jumuah: isArrayOf(isJumuahSlot, MAX_PAYLOAD_JUMUAH),
  tv: hasShape<SiteSettings["tv"]>({
    theme: isOneOf("night", "day"),
    showSeconds: isBoolean,
    showSunrise: isBoolean,
    jamaatInProgressMinutes: isFiniteNumber,
    announcementSeconds: isFiniteNumber,
  }),
});

const isAnnouncement = hasShape<Announcement>({
  id: isFiniteNumber,
  title: isString,
  body: isString,
  startsOn: isStringOrNull,
  endsOn: isStringOrNull,
  showOnSite: isBoolean,
  showOnTv: isBoolean,
  pinned: isBoolean,
  createdAt: isString,
  updatedAt: isString,
});

const isCoverage = hasShape<TimetableCoverage>({
  firstDate: isStringOrNull,
  lastDate: isStringOrNull,
  totalDays: isFiniteNumber,
});

const isPayload = hasShape<DisplayPayload>({
  version: isNonEmptyString,
  serverNow: (value) => isFiniteNumber(value) && (value as number) > 0,
  settings: isSettings,
  days: isArrayOf(isPrayerDay, MAX_PAYLOAD_DAYS),
  announcements: isArrayOf(isAnnouncement, MAX_PAYLOAD_ANNOUNCEMENTS),
  coverage: isCoverage,
});

/**
 * Whether a value received from the network or read from storage has the
 * shape of a `DisplayPayload`: every field of the contract present with the
 * right type, dates that are real dates, lists of believable length. Unknown
 * extra fields are allowed, so an older page keeps working against a newer
 * server. Individual times are not format-checked here; the time engine
 * treats a malformed time as missing.
 */
export function isDisplayPayload(value: unknown): value is DisplayPayload {
  return isPayload(value);
}

/**
 * Chooses between the payload embedded in the page and the one found in
 * storage: whichever the server produced later. The stored one wins only when
 * it is strictly newer, which happens when the page itself came out of an
 * offline cache.
 */
export function newerPayload(initial: DisplayPayload, stored: DisplayPayload | null): DisplayPayload {
  return stored !== null && stored.serverNow > initial.serverNow ? stored : initial;
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Carries the unchanged parts of the previous payload over into the next one.
 * Every poll brings a new object graph even when nothing was edited; reusing
 * the previous `settings`, `days`, `announcements` and `coverage` objects when
 * their content is identical keeps React memoisation and effects keyed on
 * them (an announcement carousel, say) from restarting every five minutes.
 */
export function reconcilePayload(previous: DisplayPayload, next: DisplayPayload): DisplayPayload {
  return {
    ...next,
    settings: sameJson(previous.settings, next.settings) ? previous.settings : next.settings,
    days: sameJson(previous.days, next.days) ? previous.days : next.days,
    announcements: sameJson(previous.announcements, next.announcements)
      ? previous.announcements
      : next.announcements,
    coverage: sameJson(previous.coverage, next.coverage) ? previous.coverage : next.coverage,
  };
}

function removeStored(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage that cannot be written to is as good as empty.
  }
}

/**
 * Reads the last good payload from storage.
 * @returns null when storage is unavailable or empty, or when the entry is
 *          oversized, unreadable, of another format version or not a valid
 *          payload. An entry that fails these checks is removed.
 */
export function readStoredPayload(storage: StorageLike | null): DisplayPayload | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  if (raw.length <= MAX_STORED_CHARS) {
    try {
      const record: unknown = JSON.parse(raw);
      if (typeof record === "object" && record !== null) {
        const { v, payload } = record as { v?: unknown; payload?: unknown };
        if (v === STORAGE_VERSION && isDisplayPayload(payload)) return payload;
      }
    } catch {
      // Not JSON: fall through to the clean-up.
    }
  }
  removeStored(storage);
  return null;
}

/**
 * Saves a payload as the last good one. Never throws: storage may be
 * unavailable, read-only or full.
 * @returns Whether the payload was written.
 */
export function writeStoredPayload(storage: StorageLike | null, payload: DisplayPayload): boolean {
  if (storage === null) return false;
  try {
    const raw = JSON.stringify({ v: STORAGE_VERSION, payload });
    if (raw.length > MAX_STORED_CHARS) return false;
    storage.setItem(STORAGE_KEY, raw);
    return true;
  } catch {
    // Over quota or blocked. The previous entry, if any, is still a good fallback.
    return false;
  }
}

/**
 * How long to wait before the next attempt.
 * @param failures Consecutive failed attempts; 0 after a success.
 * @param visible  Whether the page is on screen.
 * @param random   A number in [0, 1) that spreads the delay by {@link POLL_JITTER}.
 * @returns After a success the poll interval; after failures an exponential
 *          backoff from {@link BACKOFF_BASE_MS} up to {@link BACKOFF_MAX_MS};
 *          for a hidden page always the slow hidden interval.
 */
export function pollDelayMs(failures: number, visible: boolean, random: number): number {
  let interval = POLL_INTERVAL_MS;
  if (!visible) {
    interval = HIDDEN_POLL_INTERVAL_MS;
  } else if (failures > 0) {
    const doublings = Math.min(Math.floor(failures) - 1, MAX_BACKOFF_DOUBLINGS);
    interval = Math.min(BACKOFF_BASE_MS * 2 ** doublings, BACKOFF_MAX_MS);
  }
  return Math.round(interval * (1 + (random * 2 - 1) * POLL_JITTER));
}

/**
 * The connection status that follows from an attempt.
 * @param online Whether the browser believes it has a network. A live answer
 *        overrules it; every other outcome is `offline` without a network.
 */
export function statusAfter(
  outcome: DisplayFetchOutcome["kind"],
  online: boolean,
): ConnectionStatus {
  if (outcome === "live") return "live";
  if (outcome === "network-error" || !online) return "offline";
  return "stale";
}

/**
 * Fetches and validates the display payload. Never throws.
 * @returns `live` or `cached` with the payload; `bad-response` when the server
 *          answered with an error or with something that is not a payload;
 *          `network-error` when no answer arrived within the deadline.
 */
export async function fetchDisplayPayload(
  deps: JsonFetchDeps,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<DisplayFetchOutcome> {
  const result = await fetchJson(DISPLAY_ENDPOINT, timeoutMs, deps);
  if (result.kind !== "ok") return { kind: result.kind };
  if (!isDisplayPayload(result.body)) return { kind: "bad-response" };
  return { kind: result.cached ? "cached" : "live", payload: result.body };
}

/** The dependencies of {@link createDisplayStore} in a browser. */
export function browserDisplayDeps(): DisplayStoreDeps {
  return {
    fetch: browserFetch,
    now: () => Date.now(),
    random: () => Math.random(),
    timers: browserTimers,
    storage: browserStorage("localStorage"),
    isOnline: isNavigatorOnline,
    isVisible: isDocumentVisible,
    onOnline: (listener) => onWindowEvent("online", listener),
    onOffline: (listener) => onWindowEvent("offline", listener),
    onWake: onPageWake,
  };
}

/**
 * Creates the display store for a page rendered with `initial`. Creating it
 * has no side effects, so it is safe during server rendering. With its first
 * subscriber it consults storage, then polls: every five minutes while all is
 * well, with backoff while failing, and promptly when the network or the page
 * comes back.
 *
 * Which payload is shown
 * - A live response always replaces the current payload: the server is the
 *   authority, even if its clock has been set back since.
 * - A stored payload or a cached response replaces it only when newer.
 * - Nothing else ever does. Failed attempts change `status` only.
 *
 * @param resolveDeps Supplies the environment at start; replaceable in tests.
 */
export function createDisplayStore(
  initial: DisplayPayload,
  resolveDeps: () => DisplayStoreDeps = browserDisplayDeps,
): DisplayStore {
  const renderedVersion = initial.version;
  const serverSnapshot: DisplaySnapshot = {
    payload: initial,
    status: "live",
    lastUpdatedMs: initial.serverNow,
    latestVersion: renderedVersion,
  };
  const listeners = new Set<() => void>();
  const versionListeners = new Set<(version: string) => void>();

  let snapshot = serverSnapshot;
  let deps: DisplayStoreDeps | null = null;
  let running = false;
  /** Bumped on every stop, so a request begun in an earlier run can recognise itself as stale. */
  let run = 0;
  let restored = false;
  /** True while the payload on screen came out of storage and no live answer has confirmed it. */
  let fromStorage = false;
  let failures = 0;
  let announcedVersion = renderedVersion;

  let timer: TimerHandle = null;
  /** Device clock at which `timer` fires. */
  let timerDueAtMs = Infinity;
  let lastAttemptAtMs = -Infinity;
  let inFlight: Promise<void> | null = null;
  let unlisten: Array<() => void> = [];

  function publish(next: DisplaySnapshot): void {
    const unchanged =
      next.payload === snapshot.payload &&
      next.status === snapshot.status &&
      next.latestVersion === snapshot.latestVersion;
    if (unchanged) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function adopt(payload: DisplayPayload, status: ConnectionStatus, latestVersion: string): void {
    const reconciled = reconcilePayload(snapshot.payload, payload);
    publish({ payload: reconciled, status, lastUpdatedMs: reconciled.serverNow, latestVersion });
  }

  function schedule(env: DisplayStoreDeps, delayMs: number): void {
    env.timers.clearTimeout(timer);
    timerDueAtMs = env.now() + delayMs;
    timer = env.timers.setTimeout(() => void attempt(), delayMs);
  }

  function settle(env: DisplayStoreDeps, outcome: DisplayFetchOutcome): void {
    const status = statusAfter(outcome.kind, env.isOnline());
    failures = outcome.kind === "live" ? 0 : failures + 1;
    // Scheduled before anyone is told, so a listener that throws cannot end the polling.
    schedule(env, pollDelayMs(failures, env.isVisible(), env.random()));

    if (outcome.kind === "live") {
      fromStorage = false;
      writeStoredPayload(env.storage, outcome.payload);
      adopt(outcome.payload, status, outcome.payload.version);
    } else if (outcome.kind === "cached" && outcome.payload.serverNow > snapshot.payload.serverNow) {
      writeStoredPayload(env.storage, outcome.payload);
      adopt(outcome.payload, status, snapshot.latestVersion);
    } else {
      publish({ ...snapshot, status });
    }

    const { latestVersion } = snapshot;
    if (latestVersion !== announcedVersion) {
      announcedVersion = latestVersion;
      if (latestVersion !== renderedVersion) {
        versionListeners.forEach((listener) => listener(latestVersion));
      }
    }
  }

  function attempt(): Promise<void> {
    if (inFlight !== null) return inFlight;
    const env = deps;
    if (!running || env === null) return Promise.resolve();
    env.timers.clearTimeout(timer);
    timerDueAtMs = Infinity;
    lastAttemptAtMs = env.now();
    const startedInRun = run;
    const work = fetchDisplayPayload(env).then((outcome) => {
      if (startedInRun !== run) return;
      inFlight = null;
      settle(env, outcome);
    });
    inFlight = work;
    return work;
  }

  /** Fetches now unless an attempt was made within `throttleMs`; then as soon as that has passed. */
  function trigger(env: DisplayStoreDeps, throttleMs: number): void {
    if (inFlight !== null) return;
    const nowMs = env.now();
    const sinceAttemptMs = nowMs - lastAttemptAtMs;
    // A negative gap means the device clock was set back; do not let that block a refresh.
    if (sinceAttemptMs < 0 || sinceAttemptMs >= throttleMs) {
      void attempt();
      return;
    }
    const waitMs = throttleMs - sinceAttemptMs;
    if (nowMs + waitMs < timerDueAtMs) schedule(env, waitMs);
  }

  /** Upgrades from storage when it holds something newer than the page; otherwise seeds it. */
  function restore(env: DisplayStoreDeps): void {
    const stored = readStoredPayload(env.storage);
    const current = snapshot.payload;
    const chosen = newerPayload(current, stored);
    if (chosen !== current) {
      fromStorage = true;
      adopt(chosen, "stale", snapshot.latestVersion);
    } else if (stored === null || current.serverNow > stored.serverNow) {
      writeStoredPayload(env.storage, current);
    }
  }

  function start(): void {
    const env = resolveDeps();
    deps = env;
    running = true;
    if (!restored) {
      restored = true;
      restore(env);
    }
    unlisten = [
      env.onOnline(() => trigger(env, ONLINE_THROTTLE_MS)),
      env.onOffline(() => publish({ ...snapshot, status: "offline" })),
      env.onWake(() => trigger(env, WAKE_THROTTLE_MS)),
    ];
    if (!env.isOnline()) publish({ ...snapshot, status: "offline" });

    const ageMs = env.now() - snapshot.payload.serverNow;
    const fresh = !fromStorage && ageMs >= 0 && ageMs <= FRESH_PAYLOAD_MS;
    if (fresh) {
      // Loading the page was the latest fetch: an event in its first moments need not repeat it.
      lastAttemptAtMs = env.now();
      schedule(env, pollDelayMs(0, env.isVisible(), env.random()));
    } else {
      void attempt();
    }
  }

  function stop(): void {
    running = false;
    run += 1;
    inFlight = null;
    if (deps !== null) deps.timers.clearTimeout(timer);
    timerDueAtMs = Infinity;
    unlisten.forEach((off) => off());
    unlisten = [];
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (listeners.delete(listener) && listeners.size === 0) stop();
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    refresh: () => attempt(),
    offer(payload) {
      if (payload.serverNow <= snapshot.payload.serverNow) return;
      if (deps !== null) writeStoredPayload(deps.storage, payload);
      adopt(payload, snapshot.status, snapshot.latestVersion);
    },
    onVersionChange(listener) {
      versionListeners.add(listener);
      return () => {
        versionListeners.delete(listener);
      };
    },
  };
}
