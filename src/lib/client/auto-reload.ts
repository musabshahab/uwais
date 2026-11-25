/**
 * When a wall screen may reload itself. A TV page runs unattended for months,
 * so it has to pick up deployments on its own and shed whatever its browser
 * leaks, but a reload is a blank screen for a moment and must never happen
 * while people are looking at it for a prayer time, or while the server
 * cannot be reached (the screen would come back as an error page).
 *
 * Two reasons to reload:
 * - A deployment: the server reports a build other than the one the page was
 *   rendered with. Each screen waits a random delay first, so a hall full of
 *   screens does not go blank at once and hit the server together.
 * - Once a day in the small hours, to start from a clean slate.
 *
 * In both cases the screen reloads only when it is online, the caller says
 * the moment is quiet, and the server has just answered.
 *
 * The rules are pure functions; `createAutoReloader` drives them with
 * injected timers, clocks, storage and the reload itself.
 */

import {
  MS_PER_MINUTE,
  MS_PER_SECOND,
  isValidTimeString,
  parseTimeToMinutes,
  type PrayerState,
} from "@/lib/time";
import {
  browserFetch,
  browserStorage,
  browserTimers,
  isNavigatorOnline,
  type StorageLike,
} from "./browser";
import { readServerClock } from "./clock";
import type { TimerHandle, Timers } from "./http";

/** How often the reloader looks whether a reload is wanted and possible. */
export const RELOAD_CHECK_INTERVAL_MS = 30 * MS_PER_SECOND;

/** Shortest wait between noticing a deployment and reloading for it. */
export const VERSION_RELOAD_MIN_DELAY_MS = 30 * MS_PER_SECOND;

/** Longest such wait; each screen picks its own between the two. */
export const VERSION_RELOAD_MAX_DELAY_MS = 5 * MS_PER_MINUTE;

/**
 * After reloading for a build, the screen does not reload for the same build
 * again within this time. Guards against a loop when the reloaded page still
 * carries the old build id (a stale cache in between).
 */
export const RELOAD_LOOP_GUARD_MS = 30 * MS_PER_MINUTE;

/** The daily reload happens from this minute of the mosque's day (03:00) ... */
export const SAFETY_RELOAD_START_MINUTE = 3 * 60;

/** ... each screen starting at its own minute within this many ... */
export const SAFETY_RELOAD_SPREAD_MINUTES = 60;

/** ... and no later than this minute (05:00), so a busy Fajr only postpones it. */
export const SAFETY_RELOAD_END_MINUTE = 5 * 60;

/**
 * The daily reload is for pages that have been running a while. This also
 * makes it happen once: after it, the page is new.
 */
export const SAFETY_RELOAD_MIN_UPTIME_MS = 6 * 60 * MS_PER_MINUTE;

/** `sessionStorage` key of the last automatic reload. The suffix is the format version. */
export const RELOAD_STORAGE_KEY = "uwais:tv-reload:v1";

/** Minutes before a prayer event during which the screen is being watched. */
const DEFAULT_QUIET_BEFORE_MINUTES = 15;

/** Minutes after a prayer event during which the screen is being watched. */
const DEFAULT_QUIET_AFTER_MINUTES = 10;

/** How close to a prayer event a moment may be and still count as quiet. */
export interface QuietOptions {
  /** Minutes before the next event that are not quiet. Defaults to 15. */
  beforeMinutes?: number;
  /** Minutes after an event that are not quiet. Defaults to 10. */
  afterMinutes?: number;
}

/** The last automatic reload, remembered across it. */
export interface ReloadRecord {
  /** The build id the screen reloaded for. */
  version: string;
  /** Device clock at the reload, epoch milliseconds. */
  atMs: number;
}

/** What the reloader needs from its environment. */
export interface AutoReloadDeps {
  timers: Timers;
  /** A number in [0, 1). */
  random(): number;
  /** The device clock, epoch milliseconds; only used to time-stamp reloads. */
  now(): number;
  /** Milliseconds since the page loaded, on a clock that never jumps. */
  uptimeMs(): number;
  /** Whether the browser believes it has a network. */
  isOnline(): boolean;
  /** Asks the server for its build id; null when it cannot be reached right now. */
  probeVersion(): Promise<string | null>;
  /** Where the last reload is remembered, or null when storage is unavailable. */
  storage: StorageLike | null;
  /** Reloads the page. */
  reload(): void;
  /** Whether nobody would mind the screen going blank for a moment. */
  canReloadNow(): boolean;
  /** The mosque's wall clock in minutes since midnight, on the corrected clock. */
  mosqueMinutesOfDay(): number;
}

/** Options of {@link createAutoReloader}. */
export interface AutoReloadOptions {
  /** Build id the page was rendered with. */
  renderedVersion: string;
  /** Reload once a day in the small hours. Defaults to true. */
  dailyReload?: boolean;
}

/** A running reloader. */
export interface AutoReloader {
  /** Starts checking. */
  start(): void;
  /** Stops checking; a reload that has not happened yet will not happen. */
  stop(): void;
  /** Tells the reloader which build the server reported last. */
  setLatestVersion(version: string): void;
}

/**
 * Whether a moment is quiet enough to reload a wall screen: the clock is
 * known, no congregation is in progress, nothing is due within
 * `beforeMinutes`, and none of today's times passed within `afterMinutes`
 * (people are still looking at the screen then).
 * @param state The current prayer state; null (not known yet) is never quiet.
 */
export function isQuietMoment(state: PrayerState | null, options: QuietOptions = {}): boolean {
  if (state === null || state.jamaatInProgress !== null) return false;
  const beforeMinutes = options.beforeMinutes ?? DEFAULT_QUIET_BEFORE_MINUTES;
  const afterMinutes = options.afterMinutes ?? DEFAULT_QUIET_AFTER_MINUTES;
  if (state.next !== null && state.next.secondsUntil <= beforeMinutes * 60) return false;

  const nowMinutes = state.clock.minutesOfDay;
  for (const row of state.rows) {
    const times = [row.begins, row.jamaat].concat(row.jumuahTimes.map((slot) => slot.time));
    for (const time of times) {
      if (!isValidTimeString(time)) continue;
      const minutesSince = nowMinutes - parseTimeToMinutes(time);
      if (minutesSince >= 0 && minutesSince < afterMinutes) return false;
    }
  }
  return true;
}

/** The random wait between noticing a deployment and reloading for it. */
export function versionReloadDelayMs(random: number): number {
  const spread = VERSION_RELOAD_MAX_DELAY_MS - VERSION_RELOAD_MIN_DELAY_MS;
  return Math.round(VERSION_RELOAD_MIN_DELAY_MS + random * spread);
}

/** The minute of the mosque's day from which one screen does its daily reload (03:00 to 03:59). */
export function safetyReloadStartMinute(random: number): number {
  return SAFETY_RELOAD_START_MINUTE + Math.floor(random * SAFETY_RELOAD_SPREAD_MINUTES);
}

/**
 * Whether the daily reload is due.
 * @param minutesOfDay The mosque's wall clock, minutes since midnight.
 * @param startMinute  This screen's own start minute (`safetyReloadStartMinute`).
 * @param uptimeMs     How long the page has been running.
 */
export function isSafetyReloadDue(
  minutesOfDay: number,
  startMinute: number,
  uptimeMs: number,
): boolean {
  return (
    uptimeMs >= SAFETY_RELOAD_MIN_UPTIME_MS &&
    minutesOfDay >= startMinute &&
    minutesOfDay < SAFETY_RELOAD_END_MINUTE
  );
}

/**
 * Whether reloading for `version` now would repeat a recent reload for the
 * same build. A record from the future (the device clock was set back) does
 * not count: it must not block reloads indefinitely.
 */
export function isReloadLoop(record: ReloadRecord | null, version: string, nowMs: number): boolean {
  if (record === null || record.version !== version) return false;
  const sinceMs = nowMs - record.atMs;
  return sinceMs >= 0 && sinceMs < RELOAD_LOOP_GUARD_MS;
}

/** Reads the last automatic reload; null when there is none or it cannot be read. */
export function readReloadRecord(storage: StorageLike | null): ReloadRecord | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(RELOAD_STORAGE_KEY);
    if (raw === null) return null;
    const record: unknown = JSON.parse(raw);
    if (typeof record !== "object" || record === null) return null;
    const { version, atMs } = record as { version?: unknown; atMs?: unknown };
    if (typeof version !== "string" || typeof atMs !== "number" || !Number.isFinite(atMs)) {
      return null;
    }
    return { version, atMs };
  } catch {
    return null;
  }
}

/** Remembers an automatic reload. Never throws. */
export function writeReloadRecord(storage: StorageLike | null, record: ReloadRecord): void {
  if (storage === null) return;
  try {
    storage.setItem(RELOAD_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Without the record the loop guard is off, which only matters behind a stale cache.
  }
}

/**
 * The parts of {@link AutoReloadDeps} that are the same on every page. The
 * caller adds `canReloadNow` and `mosqueMinutesOfDay`, which depend on the
 * live display.
 */
export function browserAutoReloadDeps(): Omit<AutoReloadDeps, "canReloadNow" | "mosqueMinutesOfDay"> {
  return {
    timers: browserTimers,
    random: () => Math.random(),
    now: () => Date.now(),
    uptimeMs: () => performance.now(),
    isOnline: isNavigatorOnline,
    probeVersion: async () => {
      const reading = await readServerClock({
        fetch: browserFetch,
        now: () => Date.now(),
        timers: browserTimers,
      });
      return reading === null ? null : reading.version;
    },
    storage: browserStorage("sessionStorage"),
    reload: () => window.location.reload(),
  };
}

/**
 * Creates the reloader for a page rendered with `renderedVersion`. It checks
 * every {@link RELOAD_CHECK_INTERVAL_MS} whether a reload is wanted (a
 * deployment whose random delay has passed, or the daily one) and possible
 * (online, quiet, server reachable), and reloads when both hold.
 */
export function createAutoReloader(options: AutoReloadOptions, deps: AutoReloadDeps): AutoReloader {
  const { renderedVersion } = options;
  const dailyReload = options.dailyReload ?? true;
  let latestVersion = renderedVersion;
  /** Uptime at which the pending deployment may be reloaded for; null when none is pending. */
  let versionDueAtMs: number | null = null;
  let safetyStartMinute = SAFETY_RELOAD_START_MINUTE;
  let running = false;
  let probing = false;
  let timer: TimerHandle = null;

  async function check(): Promise<void> {
    // Rescheduled first, so nothing that goes wrong below can end the checking.
    timer = deps.timers.setTimeout(() => void check(), RELOAD_CHECK_INTERVAL_MS);
    if (probing) return;

    const uptimeMs = deps.uptimeMs();
    const record = readReloadRecord(deps.storage);
    const forVersion =
      versionDueAtMs !== null &&
      uptimeMs >= versionDueAtMs &&
      !isReloadLoop(record, latestVersion, deps.now());
    const forSafety =
      dailyReload && isSafetyReloadDue(deps.mosqueMinutesOfDay(), safetyStartMinute, uptimeMs);
    if (!forVersion && !forSafety) return;
    if (!deps.isOnline() || !deps.canReloadNow()) return;

    probing = true;
    let liveVersion: string | null;
    try {
      liveVersion = await deps.probeVersion();
    } finally {
      probing = false;
    }
    if (!running || liveVersion === null) return;
    if (!forSafety) {
      if (liveVersion === renderedVersion) {
        // The deployment was rolled back; there is nothing to reload for.
        latestVersion = renderedVersion;
        versionDueAtMs = null;
        return;
      }
      if (isReloadLoop(record, liveVersion, deps.now())) return;
    }
    // The quiet moment may have ended while the server was being asked.
    if (!deps.canReloadNow()) return;
    writeReloadRecord(deps.storage, { version: liveVersion, atMs: deps.now() });
    deps.reload();
  }

  return {
    start() {
      if (running) return;
      running = true;
      safetyStartMinute = safetyReloadStartMinute(deps.random());
      timer = deps.timers.setTimeout(() => void check(), RELOAD_CHECK_INTERVAL_MS);
    },
    stop() {
      running = false;
      deps.timers.clearTimeout(timer);
    },
    setLatestVersion(version) {
      if (version === latestVersion) return;
      latestVersion = version;
      versionDueAtMs =
        version === renderedVersion ? null : deps.uptimeMs() + versionReloadDelayMs(deps.random());
    },
  };
}
