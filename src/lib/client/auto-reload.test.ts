import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computePrayerState, type PrayerState } from "@/lib/time";
import type { DisplayPayload } from "@/lib/types";
import {
  RELOAD_CHECK_INTERVAL_MS,
  RELOAD_LOOP_GUARD_MS,
  RELOAD_STORAGE_KEY,
  SAFETY_RELOAD_END_MINUTE,
  SAFETY_RELOAD_MIN_UPTIME_MS,
  SAFETY_RELOAD_START_MINUTE,
  VERSION_RELOAD_MAX_DELAY_MS,
  VERSION_RELOAD_MIN_DELAY_MS,
  createAutoReloader,
  isQuietMoment,
  isReloadLoop,
  isSafetyReloadDue,
  readReloadRecord,
  safetyReloadStartMinute,
  versionReloadDelayMs,
  writeReloadRecord,
  type AutoReloadDeps,
  type AutoReloader,
} from "./auto-reload";
import { MemoryStorage, globalTimers, makePayload } from "./testing";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Midnight (UTC, which is London time in November) at the start of Wednesday 25 November 2026. */
const WEDNESDAY = Date.UTC(2026, 10, 25);
/** Midnight at the start of Friday 27 November 2026. */
const FRIDAY = Date.UTC(2026, 10, 27);

/** The prayer state at a time of day given as hours, minutes and seconds past a midnight. */
function stateAt(
  midnightMs: number,
  hours: number,
  minutes: number = 0,
  seconds: number = 0,
  payload: DisplayPayload = makePayload(),
): PrayerState {
  const nowMs = midnightMs + hours * HOUR + minutes * MINUTE + seconds * SECOND;
  return computePrayerState({ days: payload.days, settings: payload.settings, nowMs });
}

describe("isQuietMoment", () => {
  it("is never quiet while the time is not known", () => {
    expect(isQuietMoment(null)).toBe(false);
  });

  it("is quiet in the long gaps of the day", () => {
    expect(isQuietMoment(stateAt(WEDNESDAY, 3, 30))).toBe(true);
    expect(isQuietMoment(stateAt(WEDNESDAY, 9, 30))).toBe(true);
    expect(isQuietMoment(stateAt(WEDNESDAY, 22, 0))).toBe(true);
  });

  it("is not quiet in the fifteen minutes before the next time on the board", () => {
    // Dhuhr begins at 11:55.
    expect(isQuietMoment(stateAt(WEDNESDAY, 11, 39, 59))).toBe(true);
    expect(isQuietMoment(stateAt(WEDNESDAY, 11, 40))).toBe(false);
    expect(isQuietMoment(stateAt(WEDNESDAY, 11, 54, 59))).toBe(false);
  });

  it("is not quiet in the ten minutes after a time has passed", () => {
    // Sunrise is at 07:30 and nothing follows until 11:55.
    expect(isQuietMoment(stateAt(WEDNESDAY, 7, 30))).toBe(false);
    expect(isQuietMoment(stateAt(WEDNESDAY, 7, 39, 59))).toBe(false);
    expect(isQuietMoment(stateAt(WEDNESDAY, 7, 40))).toBe(true);
  });

  it("is not quiet while a congregation is in progress", () => {
    const state = stateAt(WEDNESDAY, 12, 33);
    expect(state.jamaatInProgress).not.toBeNull();
    expect(isQuietMoment(state)).toBe(false);
    // Not even when the caller asks for no margin at all.
    expect(isQuietMoment(state, { beforeMinutes: 0, afterMinutes: 0 })).toBe(false);
  });

  it("counts every Jumu'ah of a Friday, not only the first", () => {
    const payload = makePayload();
    payload.settings.jumuah = [
      { label: "1st Jumu'ah", time: "12:30" },
      { label: "2nd Jumu'ah", time: "13:30" },
    ];
    // Without the in-progress screen, only the list of times can tell.
    payload.settings.tv.jamaatInProgressMinutes = 0;

    const afterSecond = stateAt(FRIDAY, 13, 35, 0, payload);
    expect(afterSecond.jamaatInProgress).toBeNull();
    expect(isQuietMoment(afterSecond)).toBe(false);
    expect(isQuietMoment(stateAt(FRIDAY, 13, 41, 0, payload))).toBe(true);
  });

  it("takes its margins from the caller", () => {
    expect(isQuietMoment(stateAt(WEDNESDAY, 11, 0), { beforeMinutes: 60 })).toBe(false);
    expect(isQuietMoment(stateAt(WEDNESDAY, 11, 50), { beforeMinutes: 2 })).toBe(true);
    expect(isQuietMoment(stateAt(WEDNESDAY, 7, 45), { afterMinutes: 30 })).toBe(false);
    expect(isQuietMoment(stateAt(WEDNESDAY, 7, 31), { afterMinutes: 0 })).toBe(true);
  });

  it("is quiet when the timetable is empty", () => {
    expect(isQuietMoment(stateAt(WEDNESDAY, 12, 0, 0, makePayload({ days: [] })))).toBe(true);
  });
});

describe("versionReloadDelayMs", () => {
  it("spreads the screens between the shortest and the longest wait", () => {
    expect(versionReloadDelayMs(0)).toBe(VERSION_RELOAD_MIN_DELAY_MS);
    expect(versionReloadDelayMs(0.5)).toBe((VERSION_RELOAD_MIN_DELAY_MS + VERSION_RELOAD_MAX_DELAY_MS) / 2);
    expect(versionReloadDelayMs(0.999)).toBeLessThan(VERSION_RELOAD_MAX_DELAY_MS);
    expect(versionReloadDelayMs(0.999)).toBeGreaterThan(VERSION_RELOAD_MAX_DELAY_MS - SECOND);
  });
});

describe("safetyReloadStartMinute", () => {
  it("picks a minute between 03:00 and 03:59", () => {
    expect(safetyReloadStartMinute(0)).toBe(180);
    expect(safetyReloadStartMinute(0.5)).toBe(210);
    expect(safetyReloadStartMinute(0.9999)).toBe(239);
  });
});

describe("isSafetyReloadDue", () => {
  const longUptime = 20 * HOUR;

  it("is due from the screen's own minute until five o'clock", () => {
    expect(isSafetyReloadDue(209, 210, longUptime)).toBe(false);
    expect(isSafetyReloadDue(210, 210, longUptime)).toBe(true);
    expect(isSafetyReloadDue(SAFETY_RELOAD_END_MINUTE - 1, 210, longUptime)).toBe(true);
    expect(isSafetyReloadDue(SAFETY_RELOAD_END_MINUTE, 210, longUptime)).toBe(false);
  });

  it("is not due at any other time of day", () => {
    expect(isSafetyReloadDue(SAFETY_RELOAD_START_MINUTE - 1, SAFETY_RELOAD_START_MINUTE, longUptime)).toBe(false);
    expect(isSafetyReloadDue(12 * 60, 210, longUptime)).toBe(false);
    expect(isSafetyReloadDue(0, 210, longUptime)).toBe(false);
  });

  it("is not due for a page that has not been running long", () => {
    expect(isSafetyReloadDue(210, 210, SAFETY_RELOAD_MIN_UPTIME_MS - 1)).toBe(false);
    expect(isSafetyReloadDue(210, 210, SAFETY_RELOAD_MIN_UPTIME_MS)).toBe(true);
  });
});

describe("isReloadLoop", () => {
  const nowMs = WEDNESDAY + 12 * HOUR;

  it("sees no loop without a record or for another build", () => {
    expect(isReloadLoop(null, "build-2", nowMs)).toBe(false);
    expect(isReloadLoop({ version: "build-1", atMs: nowMs - MINUTE }, "build-2", nowMs)).toBe(false);
  });

  it("sees a loop for the same build within the guard time", () => {
    expect(isReloadLoop({ version: "build-2", atMs: nowMs }, "build-2", nowMs)).toBe(true);
    expect(isReloadLoop({ version: "build-2", atMs: nowMs - RELOAD_LOOP_GUARD_MS + 1 }, "build-2", nowMs)).toBe(
      true,
    );
    expect(isReloadLoop({ version: "build-2", atMs: nowMs - RELOAD_LOOP_GUARD_MS }, "build-2", nowMs)).toBe(
      false,
    );
  });

  it("does not let a record from the future block reloads", () => {
    expect(isReloadLoop({ version: "build-2", atMs: nowMs + DAY }, "build-2", nowMs)).toBe(false);
  });
});

describe("readReloadRecord and writeReloadRecord", () => {
  it("remember a reload", () => {
    const storage = new MemoryStorage();
    writeReloadRecord(storage, { version: "build-2", atMs: 1234 });
    expect(readReloadRecord(storage)).toEqual({ version: "build-2", atMs: 1234 });
  });

  it("have nothing to say without storage or without a record", () => {
    writeReloadRecord(null, { version: "build-2", atMs: 1234 });
    expect(readReloadRecord(null)).toBeNull();
    expect(readReloadRecord(new MemoryStorage())).toBeNull();
  });

  it("ignore a record that is not one", () => {
    const storage = new MemoryStorage();
    for (const raw of ["{broken", "null", "7", '{"version":"build-2"}', '{"version":2,"atMs":5}', '{"version":"b","atMs":"5"}']) {
      storage.items.set(RELOAD_STORAGE_KEY, raw);
      expect(readReloadRecord(storage)).toBeNull();
    }
  });

  it("survive storage that throws", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    expect(() => writeReloadRecord(storage, { version: "build-2", atMs: 1 })).not.toThrow();
    storage.failReads = true;
    expect(readReloadRecord(storage)).toBeNull();
  });
});

describe("createAutoReloader", () => {
  /** A simulated screen. Time is the faked system time; the mosque is on UTC. */
  interface World {
    online: boolean;
    quiet: boolean;
    /** What the server answers when asked for its build; null means unreachable. */
    liveVersion: string | null;
    latencyMs: number;
    randomValue: number;
    probes: number;
    reloads: number;
    storage: MemoryStorage | null;
    deps: AutoReloadDeps;
  }

  function createWorld(startMs: number): World {
    vi.setSystemTime(startMs);
    const world: World = {
      online: true,
      quiet: true,
      liveVersion: "build-1",
      latencyMs: 40,
      randomValue: 0.5,
      probes: 0,
      reloads: 0,
      storage: new MemoryStorage(),
      deps: undefined as unknown as AutoReloadDeps,
    };
    world.deps = {
      timers: globalTimers,
      random: () => world.randomValue,
      now: () => Date.now(),
      uptimeMs: () => Date.now() - startMs,
      isOnline: () => world.online,
      probeVersion: () => {
        world.probes += 1;
        const answer = world.liveVersion;
        return new Promise((resolve) => setTimeout(() => resolve(answer), world.latencyMs));
      },
      get storage() {
        return world.storage;
      },
      reload: () => {
        world.reloads += 1;
      },
      canReloadNow: () => world.quiet,
      mosqueMinutesOfDay: () => Math.floor((Date.now() % DAY) / MINUTE),
    };
    return world;
  }

  /** Midday: far from the daily reload window. */
  const MIDDAY = WEDNESDAY + 12 * HOUR;
  /** With `randomValue` 0.5 a deployment is reloaded for after this long. */
  const DELAY_MS = versionReloadDelayMs(0.5);
  /** The first check at or after that delay. */
  const FIRST_DUE_CHECK_MS = Math.ceil(DELAY_MS / RELOAD_CHECK_INTERVAL_MS) * RELOAD_CHECK_INTERVAL_MS;

  function startWith(world: World, options: { dailyReload?: boolean } = {}): AutoReloader {
    const reloader = createAutoReloader({ renderedVersion: "build-1", ...options }, world.deps);
    reloader.start();
    return reloader;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("leaves the page alone while the server runs the build it was rendered with", async () => {
    const world = createWorld(MIDDAY);
    const reloader = startWith(world);
    reloader.setLatestVersion("build-1");

    await vi.advanceTimersByTimeAsync(2 * HOUR);

    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);
  });

  it("reloads for a deployment once its own delay has passed and the server has answered", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-2";
    const reloader = startWith(world);
    reloader.setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS - 1);
    expect(world.probes).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.probes).toBe(1);
    expect(world.reloads).toBe(0);
    await vi.advanceTimersByTimeAsync(world.latencyMs);

    expect(world.reloads).toBe(1);
    expect(readReloadRecord(world.storage)).toEqual({ version: "build-2", atMs: Date.now() });
  });

  it("gives each screen its own delay", async () => {
    const early = createWorld(MIDDAY);
    early.randomValue = 0;
    early.liveVersion = "build-2";
    startWith(early).setLatestVersion("build-2");
    await vi.advanceTimersByTimeAsync(VERSION_RELOAD_MIN_DELAY_MS + early.latencyMs);
    expect(early.reloads).toBe(1);

    const late = createWorld(MIDDAY);
    late.randomValue = 0.999;
    late.liveVersion = "build-2";
    startWith(late).setLatestVersion("build-2");
    await vi.advanceTimersByTimeAsync(VERSION_RELOAD_MAX_DELAY_MS - RELOAD_CHECK_INTERVAL_MS);
    expect(late.reloads).toBe(0);
    await vi.advanceTimersByTimeAsync(RELOAD_CHECK_INTERVAL_MS + late.latencyMs);
    expect(late.reloads).toBe(1);
  });

  it("waits for a quiet moment", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-2";
    world.quiet = false;
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(40 * MINUTE);
    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);

    world.quiet = true;
    await vi.advanceTimersByTimeAsync(RELOAD_CHECK_INTERVAL_MS + world.latencyMs);
    expect(world.reloads).toBe(1);
  });

  it("waits for the network", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-2";
    world.online = false;
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(40 * MINUTE);
    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);

    world.online = true;
    await vi.advanceTimersByTimeAsync(RELOAD_CHECK_INTERVAL_MS + world.latencyMs);
    expect(world.reloads).toBe(1);
  });

  it("does not reload into an error page: it waits until the server answers", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = null;
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS + 5 * RELOAD_CHECK_INTERVAL_MS + world.latencyMs);
    expect(world.probes).toBe(6);
    expect(world.reloads).toBe(0);

    world.liveVersion = "build-2";
    await vi.advanceTimersByTimeAsync(RELOAD_CHECK_INTERVAL_MS);
    expect(world.reloads).toBe(1);
  });

  it("does not reload when the quiet moment ends while the server is being asked", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-2";
    world.latencyMs = 2 * SECOND;
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS + SECOND);
    expect(world.probes).toBe(1);
    world.quiet = false;
    await vi.advanceTimersByTimeAsync(SECOND);

    expect(world.reloads).toBe(0);
    expect(readReloadRecord(world.storage)).toBeNull();
  });

  it("forgets a deployment that was rolled back before the reload", async () => {
    const world = createWorld(MIDDAY);
    const reloader = startWith(world);
    reloader.setLatestVersion("build-2");
    reloader.setLatestVersion("build-1");

    await vi.advanceTimersByTimeAsync(HOUR);

    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);
  });

  it("forgets a deployment when the server turns out to run the page's own build", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-1";
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(HOUR);

    expect(world.probes).toBe(1);
    expect(world.reloads).toBe(0);
  });

  it("restarts the delay for each further deployment", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-3";
    const reloader = startWith(world);
    reloader.setLatestVersion("build-2");
    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS - RELOAD_CHECK_INTERVAL_MS);
    reloader.setLatestVersion("build-3");

    await vi.advanceTimersByTimeAsync(RELOAD_CHECK_INTERVAL_MS + world.latencyMs);
    expect(world.reloads).toBe(0);

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS);
    expect(world.reloads).toBe(1);
    expect(readReloadRecord(world.storage)?.version).toBe("build-3");
  });

  it("does not reload twice for the same build within the guard time", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-2";
    // The page reloaded for build-2 five minutes ago and still carries build-1: a stale cache.
    writeReloadRecord(world.storage, { version: "build-2", atMs: MIDDAY - 5 * MINUTE });
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(RELOAD_LOOP_GUARD_MS - 5 * MINUTE - SECOND);
    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);

    await vi.advanceTimersByTimeAsync(RELOAD_CHECK_INTERVAL_MS + world.latencyMs);
    expect(world.reloads).toBe(1);
  });

  it("is not held back by the guard when the server runs yet another build", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-3";
    writeReloadRecord(world.storage, { version: "build-2", atMs: MIDDAY - 5 * MINUTE });
    startWith(world).setLatestVersion("build-3");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS + world.latencyMs);
    expect(world.reloads).toBe(1);
  });

  it("applies the guard to the build the server reports, when that differs from the one announced", async () => {
    const world = createWorld(MIDDAY);
    // Announced build-3, but the server answers build-2, which was reloaded for a moment ago.
    world.liveVersion = "build-2";
    writeReloadRecord(world.storage, { version: "build-2", atMs: MIDDAY - MINUTE });
    startWith(world).setLatestVersion("build-3");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS + world.latencyMs);
    expect(world.probes).toBe(1);
    expect(world.reloads).toBe(0);
  });

  it("works without storage", async () => {
    const world = createWorld(MIDDAY);
    world.storage = null;
    world.liveVersion = "build-2";
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS + world.latencyMs);
    expect(world.reloads).toBe(1);
  });

  it("reloads once in the small hours at the screen's own minute", async () => {
    // Started at 20:00; with `randomValue` 0.5 its minute is 03:30.
    const world = createWorld(WEDNESDAY + 20 * HOUR);
    startWith(world);

    await vi.advanceTimersByTimeAsync(7 * HOUR + 30 * MINUTE - SECOND);
    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);

    await vi.advanceTimersByTimeAsync(SECOND + world.latencyMs);
    expect(world.reloads).toBe(1);
    // The server runs the same build; the reload is recorded under it.
    expect(readReloadRecord(world.storage)?.version).toBe("build-1");
  });

  it("does not do the daily reload on a page that was loaded recently", async () => {
    const world = createWorld(WEDNESDAY + HOUR);
    startWith(world);

    await vi.advanceTimersByTimeAsync(5 * HOUR);

    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);
  });

  it("postpones the daily reload while the screen is being watched, and skips it after five", async () => {
    const world = createWorld(WEDNESDAY + 20 * HOUR);
    world.quiet = false;
    startWith(world);

    // 04:10: still inside the window, and now quiet.
    await vi.advanceTimersByTimeAsync(8 * HOUR + 10 * MINUTE);
    expect(world.reloads).toBe(0);
    world.quiet = true;
    await vi.advanceTimersByTimeAsync(RELOAD_CHECK_INTERVAL_MS + world.latencyMs);
    expect(world.reloads).toBe(1);

    const busy = createWorld(WEDNESDAY + 20 * HOUR);
    busy.quiet = false;
    startWith(busy);
    // 05:00: the window is over.
    await vi.advanceTimersByTimeAsync(9 * HOUR);
    busy.quiet = true;
    await vi.advanceTimersByTimeAsync(10 * HOUR);
    expect(busy.reloads).toBe(0);
  });

  it("does not do the daily reload when the server cannot be reached", async () => {
    const world = createWorld(WEDNESDAY + 20 * HOUR);
    world.liveVersion = null;
    startWith(world);

    await vi.advanceTimersByTimeAsync(10 * HOUR);

    expect(world.probes).toBeGreaterThan(0);
    expect(world.reloads).toBe(0);
  });

  it("can have the daily reload turned off", async () => {
    const world = createWorld(WEDNESDAY + 20 * HOUR);
    startWith(world, { dailyReload: false });

    await vi.advanceTimersByTimeAsync(2 * DAY);

    expect(world.probes).toBe(0);
    expect(world.reloads).toBe(0);
  });

  it("asks the server one question at a time, however slow the answer", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-2";
    world.latencyMs = 3 * RELOAD_CHECK_INTERVAL_MS + SECOND;
    startWith(world).setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS + 3 * RELOAD_CHECK_INTERVAL_MS);
    expect(world.probes).toBe(1);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(world.reloads).toBe(1);
  });

  it("does not reload after it was stopped, even with an answer on its way", async () => {
    const world = createWorld(MIDDAY);
    world.liveVersion = "build-2";
    const reloader = startWith(world);
    reloader.setLatestVersion("build-2");

    await vi.advanceTimersByTimeAsync(FIRST_DUE_CHECK_MS);
    expect(world.probes).toBe(1);
    reloader.stop();
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(world.reloads).toBe(0);
    expect(world.probes).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts only once", () => {
    const world = createWorld(MIDDAY);
    const reloader = startWith(world);
    reloader.start();
    expect(vi.getTimerCount()).toBe(1);
    reloader.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
