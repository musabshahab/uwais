import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOCK_STEP_THRESHOLD_MS,
  HIDDEN_RESYNC_INTERVAL_MS,
  INITIAL_SYNC_DEADLINE_MS,
  MAX_ROUND_TRIP_MS,
  MIN_SYNC_GAP_MS,
  OFFSET_APPLY_THRESHOLD_MS,
  OFFSET_RELEASE_THRESHOLD_MS,
  RESYNC_INTERVAL_MS,
  RESYNC_RETRY_MS,
  SLEW_LIMIT_MS,
  SLEW_RATE,
  VERSION_ENDPOINT,
  absorbClockStep,
  chooseAppliedOffset,
  createClock,
  estimateOffset,
  holdDisplay,
  initialOffset,
  measureOffset,
  parseVersionResponse,
  planTick,
  readServerClock,
  refineBounds,
  slewOffset,
  type Clock,
  type ClockDeps,
  type OffsetBounds,
} from "./clock";
import type { ResponseLike } from "./http";
import { createSignal, globalTimers, htmlResponse, jsonResponse } from "./testing";

/** True time at the start of each test: 12:00:00.300 UTC, deliberately off the second. */
const START = Date.UTC(2026, 10, 25, 12, 0, 0) + 300;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe("measureOffset", () => {
  it("places the server reading at the midpoint of the request", () => {
    const sample = measureOffset({ requestStartMs: 10_000, responseEndMs: 10_200, serverNowMs: 70_100 });
    expect(sample).toEqual({ offsetMs: 60_000, roundTripMs: 200, atMs: 10_200 });
  });

  it("is negative when the device clock is ahead of the server", () => {
    const sample = measureOffset({ requestStartMs: 500_000, responseEndMs: 500_100, serverNowMs: 200_050 });
    expect(sample?.offsetMs).toBe(-300_000);
  });

  it("accepts a round trip of exactly the limit and rejects a longer one", () => {
    const atLimit = { requestStartMs: 0, responseEndMs: MAX_ROUND_TRIP_MS, serverNowMs: 1000 };
    expect(measureOffset(atLimit)).not.toBeNull();
    expect(measureOffset({ ...atLimit, responseEndMs: MAX_ROUND_TRIP_MS + 1 })).toBeNull();
  });

  it("rejects an exchange during which the device clock ran backwards", () => {
    expect(measureOffset({ requestStartMs: 2000, responseEndMs: 1999, serverNowMs: 2000 })).toBeNull();
  });

  it("rejects values that are not finite numbers", () => {
    expect(measureOffset({ requestStartMs: NaN, responseEndMs: 10, serverNowMs: 5 })).toBeNull();
    expect(measureOffset({ requestStartMs: 0, responseEndMs: Infinity, serverNowMs: 5 })).toBeNull();
    expect(measureOffset({ requestStartMs: 0, responseEndMs: 10, serverNowMs: NaN })).toBeNull();
  });
});

describe("refineBounds", () => {
  const sample = (offsetMs: number, roundTripMs: number, atMs: number) => ({ offsetMs, roundTripMs, atMs });

  it("starts with the sample's own uncertainty: half the round trip either way", () => {
    expect(refineBounds(null, sample(1000, 200, 50))).toEqual({ lowMs: 900, highMs: 1100, atMs: 50 });
  });

  it("narrows to the overlap of two readings", () => {
    const first = refineBounds(null, sample(1000, 400, 0));
    const second = refineBounds(first, sample(1100, 100, 1000));
    // [800, 1200] widened by 0.2 ms of drift, intersected with [1050, 1150].
    expect(second.lowMs).toBe(1050);
    expect(second.highMs).toBe(1150);
    expect(estimateOffset(second)).toBe(1100);
  });

  it("is not moved by a slow reading that agrees with a precise one", () => {
    const precise = refineBounds(null, sample(1000, 20, 0));
    const afterSlow = refineBounds(precise, sample(1400, 1900, 1000));
    expect(estimateOffset(afterSlow)).toBeCloseTo(1000, 0);
    expect(afterSlow.highMs - afterSlow.lowMs).toBeLessThan(25);
  });

  it("widens the earlier range for the drift a device clock may accumulate", () => {
    const first: OffsetBounds = { lowMs: 990, highMs: 1010, atMs: 0 };
    // Ten minutes later a 200 ppm allowance has opened the range by 120 ms either way.
    const second = refineBounds(first, sample(1100, 20, 10 * MINUTE));
    expect(second.lowMs).toBe(1090);
    expect(second.highMs).toBe(1110);
  });

  it("starts over from the new reading when it contradicts the history", () => {
    const first = refineBounds(null, sample(1000, 20, 0));
    const stepped = refineBounds(first, sample(301_000, 40, 5000));
    expect(stepped).toEqual({ lowMs: 300_980, highMs: 301_020, atMs: 5000 });
  });
});

describe("chooseAppliedOffset", () => {
  it("leaves a device within the threshold alone", () => {
    expect(chooseAppliedOffset(OFFSET_APPLY_THRESHOLD_MS, false)).toBe(0);
    expect(chooseAppliedOffset(-OFFSET_APPLY_THRESHOLD_MS, false)).toBe(0);
    expect(chooseAppliedOffset(350, false)).toBe(0);
  });

  it("applies the whole estimate beyond the threshold, in either direction", () => {
    expect(chooseAppliedOffset(OFFSET_APPLY_THRESHOLD_MS + 1, false)).toBe(2001);
    expect(chooseAppliedOffset(-183_456.4, false)).toBe(-183_456);
  });

  it("keeps a correction in force down to the release threshold", () => {
    expect(chooseAppliedOffset(1500, true)).toBe(1500);
    expect(chooseAppliedOffset(-1500, true)).toBe(-1500);
    expect(chooseAppliedOffset(OFFSET_RELEASE_THRESHOLD_MS, true)).toBe(0);
    expect(chooseAppliedOffset(-999, true)).toBe(0);
  });

  it("applies nothing for an estimate that is not a number", () => {
    expect(chooseAppliedOffset(NaN, false)).toBe(0);
    expect(chooseAppliedOffset(Infinity, true)).toBe(0);
  });
});

describe("initialOffset", () => {
  it("applies nothing when the page timestamp and the device agree", () => {
    expect(initialOffset(START, START + 400)).toEqual({ offsetMs: 0, awaitSample: false });
    expect(initialOffset(START, START - OFFSET_APPLY_THRESHOLD_MS)).toEqual({ offsetMs: 0, awaitSample: false });
  });

  it("corrects at once a device that is provably behind", () => {
    expect(initialOffset(START, START - 5 * MINUTE)).toEqual({ offsetMs: 5 * MINUTE, awaitSample: false });
  });

  it("does not trust a timestamp older than the device clock: the page may be stale", () => {
    // Two days old: an offline copy of the page, not a device two days ahead.
    expect(initialOffset(START - 2 * 24 * 60 * MINUTE, START)).toEqual({ offsetMs: 0, awaitSample: true });
    expect(initialOffset(START, START + OFFSET_APPLY_THRESHOLD_MS + 1)).toEqual({ offsetMs: 0, awaitSample: true });
    expect(initialOffset(START, START + OFFSET_APPLY_THRESHOLD_MS)).toEqual({ offsetMs: 0, awaitSample: false });
  });

  it("applies nothing for a timestamp that is not a number", () => {
    expect(initialOffset(NaN, START)).toEqual({ offsetMs: 0, awaitSample: false });
  });
});

describe("slewOffset", () => {
  it("moves toward the target by a quarter of the elapsed time", () => {
    expect(slewOffset(0, -2000, 1000)).toBe(-250);
    expect(slewOffset(0, 2000, 1000)).toBe(250);
  });

  it("never lets the corrected clock run backwards", () => {
    // Device time advances by `elapsed`, the offset falls by a quarter of it.
    for (const elapsed of [1, 16, 250, 1000, 60_000]) {
      const applied = slewOffset(0, -SLEW_LIMIT_MS, elapsed);
      expect(elapsed + applied).toBeGreaterThanOrEqual(elapsed * (1 - SLEW_RATE) - 1e-9);
    }
  });

  it("stops exactly on the target", () => {
    expect(slewOffset(-1900, -2000, 1000)).toBe(-2000);
    expect(slewOffset(-2000, -2000, 5000)).toBe(-2000);
  });

  it("closes a gap beyond the limit at once", () => {
    expect(slewOffset(0, SLEW_LIMIT_MS + 1, 0)).toBe(SLEW_LIMIT_MS + 1);
    expect(slewOffset(0, -300_000, 16)).toBe(-300_000);
    expect(slewOffset(0, SLEW_LIMIT_MS, 0)).toBe(0);
  });

  it("does not move when the device clock went backwards between two looks", () => {
    expect(slewOffset(0, 2000, -500)).toBe(0);
  });
});

describe("planTick", () => {
  it("shows the current second and waits for the next boundary", () => {
    expect(planTick(START)).toEqual({ secondMs: START - 300, delayMs: 700 });
  });

  it("waits a full second when called exactly on a boundary", () => {
    expect(planTick(START - 300)).toEqual({ secondMs: START - 300, delayMs: 1000 });
  });

  it("counts a timer that fired a few milliseconds early as the coming second", () => {
    const boundary = START + 700;
    expect(planTick(boundary - 5)).toEqual({ secondMs: boundary, delayMs: 1005 });
  });

  it("stretches or shortens the wait while a correction is being slewed", () => {
    // 700 ms of clock time, covered at three quarters of real speed or at one and a quarter.
    expect(planTick(START, -2000).delayMs).toBe(Math.ceil(700 / (1 - SLEW_RATE)));
    expect(planTick(START, 2000).delayMs).toBe(700 / (1 + SLEW_RATE));
  });

  it("accounts for a slew that ends before the boundary", () => {
    // Shedding 50 ms takes 200 ms in which the clock covers 150 ms; the other 550 ms pass in real time.
    expect(planTick(START, -50).delayMs).toBe(750);
    // Gaining 50 ms takes 200 ms in which the clock covers 250 ms; then 450 ms in real time.
    expect(planTick(START, 50).delayMs).toBe(650);
  });

  it("never plans a wait short enough to spin, whatever it is given", () => {
    expect(planTick(START + 679, 2000).delayMs).toBe(20);
    expect(planTick(START, Number.NaN).delayMs).toBe(700);
  });
});

describe("holdDisplay", () => {
  it("shows the first second and every later one", () => {
    expect(holdDisplay(null, 5000)).toBe(5000);
    expect(holdDisplay(5000, 6000)).toBe(6000);
    expect(holdDisplay(5000, 5000)).toBe(5000);
  });

  it("holds the screen instead of stepping back a second or two", () => {
    expect(holdDisplay(10_000, 9000)).toBe(10_000);
    expect(holdDisplay(10_000, 10_000 - SLEW_LIMIT_MS)).toBe(10_000);
  });

  it("shows a large step back, which is a real correction", () => {
    expect(holdDisplay(10_000_000, 10_000_000 - SLEW_LIMIT_MS - 1000)).toBe(9_994_000);
  });
});

describe("absorbClockStep", () => {
  it("drops the correction when the device clock jumps by the amount being corrected", () => {
    expect(absorbClockStep(300_000, 300_000)).toBe(0);
    expect(absorbClockStep(-300_000, -299_200)).toBe(-800);
  });

  it("keeps the correction when the jump is unrelated to it", () => {
    // An hour of sleep on a device that is five minutes behind.
    expect(absorbClockStep(300_000, 3_600_000)).toBe(300_000);
    expect(absorbClockStep(300_000, -300_000)).toBe(300_000);
  });

  it("has nothing to absorb when no correction is in force", () => {
    expect(absorbClockStep(0, 3_600_000)).toBe(0);
    expect(absorbClockStep(0, 1800)).toBe(0);
  });

  it("ignores a step that is not a number", () => {
    expect(absorbClockStep(5000, NaN)).toBe(5000);
  });
});

describe("parseVersionResponse", () => {
  it("accepts a version response", () => {
    expect(parseVersionResponse({ version: "abc", serverNow: 123 })).toEqual({ version: "abc", serverNow: 123 });
  });

  it("rejects anything else", () => {
    expect(parseVersionResponse(null)).toBeNull();
    expect(parseVersionResponse("<html>")).toBeNull();
    expect(parseVersionResponse({ version: "", serverNow: 1 })).toBeNull();
    expect(parseVersionResponse({ version: "abc", serverNow: "1" })).toBeNull();
    expect(parseVersionResponse({ version: "abc", serverNow: Infinity })).toBeNull();
    expect(parseVersionResponse({ serverNow: 1 })).toBeNull();
  });
});

describe("readServerClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const depsFor = (response: () => Promise<ResponseLike>) => {
    const urls: string[] = [];
    const deps = {
      fetch: (url: string) => {
        urls.push(url);
        return response();
      },
      now: () => Date.now(),
      timers: globalTimers,
    };
    return { deps, urls };
  };

  it("returns the build id, the server clock and the timing of the request", async () => {
    const { deps, urls } = depsFor(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(jsonResponse({ version: "b7", serverNow: START + 40 })), 80);
        }),
    );
    const pending = readServerClock(deps);
    await vi.advanceTimersByTimeAsync(80);

    expect(await pending).toEqual({
      version: "b7",
      serverNowMs: START + 40,
      requestStartMs: START,
      responseEndMs: START + 80,
    });
    expect(urls).toEqual([VERSION_ENDPOINT]);
  });

  it("refuses a reading out of the service worker's cache", async () => {
    const { deps } = depsFor(() =>
      Promise.resolve(jsonResponse({ version: "b7", serverNow: START - 86_400_000 }, { cached: true })),
    );
    expect(await readServerClock(deps)).toBeNull();
  });

  it("returns null for an error, a captive portal, a malformed body or no network", async () => {
    const answers = [
      () => Promise.resolve(jsonResponse({}, { status: 503 })),
      () => Promise.resolve(htmlResponse()),
      () => Promise.resolve(jsonResponse({ version: 7, serverNow: START })),
      () => Promise.reject<ResponseLike>(new TypeError("Failed to fetch")),
    ];
    for (const answer of answers) {
      expect(await readServerClock(depsFor(answer).deps)).toBeNull();
    }
  });

  it("gives up once the answer can no longer be precise enough to use", async () => {
    const { deps } = depsFor(() => new Promise(() => undefined));
    const pending = readServerClock(deps);
    await vi.advanceTimersByTimeAsync(MAX_ROUND_TRIP_MS + 500);
    expect(await pending).toBeNull();
  });
});

describe("createClock", () => {
  /** A simulated device and server. "True" time is the (faked) system time. */
  interface World {
    /** How far the device clock is from the truth; positive means ahead. */
    deviceErrorMs: number;
    /** Correction of the monotonic clock, to simulate it standing still during sleep. */
    monotonicShiftMs: number;
    /** Round trip of a request. */
    latencyMs: number;
    /** `ok` answers, `down` fails fast, `hang` never answers, `cached` answers from the service worker. */
    server: "ok" | "down" | "hang" | "cached";
    visible: boolean;
    requests: number;
    wake: ReturnType<typeof createSignal>;
    online: ReturnType<typeof createSignal>;
    deps: ClockDeps;
  }

  function createWorld(initial: Partial<Pick<World, "deviceErrorMs" | "latencyMs" | "server">> = {}): World {
    const world: World = {
      deviceErrorMs: 0,
      monotonicShiftMs: 0,
      latencyMs: 40,
      server: "ok",
      visible: true,
      requests: 0,
      wake: createSignal(),
      online: createSignal(),
      ...initial,
      deps: undefined as unknown as ClockDeps,
    };
    world.deps = {
      now: () => Date.now() + world.deviceErrorMs,
      monotonicNow: () => Date.now() - START + world.monotonicShiftMs,
      random: () => 0.5,
      timers: globalTimers,
      isVisible: () => world.visible,
      onWake: world.wake.listen,
      onOnline: world.online.listen,
      fetch: () => {
        world.requests += 1;
        const mode = world.server;
        if (mode === "hang") return new Promise(() => undefined);
        return new Promise((resolve, reject) => {
          const half = world.latencyMs / 2;
          setTimeout(() => {
            if (mode === "down") {
              reject(new TypeError("Failed to fetch"));
              return;
            }
            const body = { version: "build-1", serverNow: Date.now() };
            setTimeout(() => resolve(jsonResponse(body, { cached: mode === "cached" })), half);
          }, half);
        });
      },
    };
    return world;
  }

  /** Subscribes to a clock and records every second it publishes with the true time it did so. */
  function watch(clock: Clock) {
    const shown: Array<{ secondMs: number; trueMs: number }> = [];
    const unsubscribe = clock.subscribe(() => {
      const secondMs = clock.getSnapshot();
      if (secondMs !== null) shown.push({ secondMs, trueMs: Date.now() });
    });
    return { shown, unsubscribe };
  }

  const trueSecond = () => Math.floor(Date.now() / SECOND) * SECOND;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has nothing to show before it is subscribed to, and creating it starts nothing", () => {
    const world = createWorld();
    const clock = createClock({ serverNow: START }, () => world.deps);
    expect(clock.getSnapshot()).toBeNull();
    expect(world.requests).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the current second at once on a device that agrees with the server", () => {
    const world = createWorld();
    const clock = createClock({ serverNow: START - 150 }, () => world.deps);
    const { shown } = watch(clock);
    expect(clock.getSnapshot()).toBe(START - 300);
    expect(shown).toEqual([{ secondMs: START - 300, trueMs: START }]);
    expect(clock.offsetMs()).toBe(0);
  });

  it("ticks exactly on each second boundary without drifting", async () => {
    const world = createWorld();
    const clock = createClock({ serverNow: START }, () => world.deps);
    const { shown } = watch(clock);

    await vi.advanceTimersByTimeAsync(90 * SECOND);

    expect(shown).toHaveLength(91);
    for (let index = 1; index < shown.length; index += 1) {
      expect(shown[index].secondMs - shown[index - 1].secondMs).toBe(SECOND);
      // Published at the boundary itself: the shown second is the true time.
      expect(shown[index].trueMs).toBe(shown[index].secondMs);
    }
  });

  it("does not correct a device that is less than two seconds out", async () => {
    const world = createWorld({ deviceErrorMs: 1500 });
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);

    await vi.advanceTimersByTimeAsync(5 * SECOND);

    expect(clock.offsetMs()).toBe(0);
    expect(clock.getSnapshot()).toBe(Math.floor((Date.now() + 1500) / SECOND) * SECOND);
  });

  it("corrects at once a device that is behind the page's own timestamp", async () => {
    const world = createWorld({ deviceErrorMs: -5 * MINUTE });
    const clock = createClock({ serverNow: START - 200 }, () => world.deps);
    const { shown } = watch(clock);

    // Before any request has been answered the clock is already within the page's age of the truth.
    expect(clock.getSnapshot()).toBe(trueSecond());
    expect(world.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(clock.offsetMs()).toBe(5 * MINUTE);
    expect(clock.getSnapshot()).toBe(trueSecond());
    for (let index = 1; index < shown.length; index += 1) {
      expect(shown[index].secondMs).toBeGreaterThan(shown[index - 1].secondMs);
    }
  });

  it("waits for a live reading before showing a device that may be ahead, then shows the right time", async () => {
    const world = createWorld({ deviceErrorMs: 5 * MINUTE });
    const clock = createClock({ serverNow: START - 200 }, () => world.deps);
    const { shown } = watch(clock);

    expect(clock.getSnapshot()).toBeNull();
    await vi.advanceTimersByTimeAsync(world.latencyMs);

    expect(clock.offsetMs()).toBe(-5 * MINUTE);
    expect(clock.getSnapshot()).toBe(trueSecond());
    // The wrong time was never on screen.
    expect(shown.every((entry) => Math.abs(entry.secondMs - entry.trueMs) < SECOND)).toBe(true);
  });

  it("shows the device time when a stale page cannot reach the server", async () => {
    const world = createWorld({ server: "down" });
    // The page was saved two days ago; the device clock is right.
    const clock = createClock({ serverNow: START - 2 * 24 * 60 * MINUTE }, () => world.deps);
    watch(clock);

    expect(clock.getSnapshot()).toBeNull();
    await vi.advanceTimersByTimeAsync(world.latencyMs);

    expect(clock.offsetMs()).toBe(0);
    expect(clock.getSnapshot()).toBe(trueSecond());
  });

  it("stops waiting for a first reading at the deadline", async () => {
    const world = createWorld({ server: "hang" });
    const clock = createClock({ serverNow: START - 60 * MINUTE }, () => world.deps);
    watch(clock);

    await vi.advanceTimersByTimeAsync(INITIAL_SYNC_DEADLINE_MS - 1);
    expect(clock.getSnapshot()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(clock.getSnapshot()).toBe(trueSecond());
  });

  it("corrects a large error at once when the server becomes reachable later", async () => {
    const world = createWorld({ deviceErrorMs: 5 * MINUTE, server: "down" });
    const clock = createClock({ serverNow: START }, () => world.deps);
    const { shown } = watch(clock);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(clock.getSnapshot()).toBe(trueSecond() + 5 * MINUTE);

    world.server = "ok";
    await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS);

    expect(clock.offsetMs()).toBe(-5 * MINUTE);
    expect(clock.getSnapshot()).toBe(trueSecond());
    const last = shown[shown.length - 1];
    expect(last.secondMs).toBe(last.trueMs);
  });

  it("reads the server clock again every ten minutes, and hourly while hidden", async () => {
    const world = createWorld();
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);
    expect(world.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(RESYNC_INTERVAL_MS + world.latencyMs - 1);
    expect(world.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(2);

    // The page is hidden by the time the second answer arrives.
    world.visible = false;
    await vi.advanceTimersByTimeAsync(world.latencyMs + HIDDEN_RESYNC_INTERVAL_MS - 1);
    expect(world.requests).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(3);
  });

  it("retries a failed reading after a minute", async () => {
    const world = createWorld({ server: "down" });
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);

    await vi.advanceTimersByTimeAsync(world.latencyMs / 2 + RESYNC_RETRY_MS - 1);
    expect(world.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(2);
  });

  it("ignores a reading served from the service worker's cache", async () => {
    const world = createWorld({ deviceErrorMs: -5000, server: "cached" });
    // The page looks fresh, so only a live reading could reveal the five seconds.
    const clock = createClock({ serverNow: START - 5000 }, () => world.deps);
    watch(clock);

    await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + world.latencyMs);

    expect(clock.offsetMs()).toBe(0);
    expect(world.requests).toBe(2);
  });

  it("reads again when the page or the network comes back, but not in quick succession", async () => {
    const world = createWorld();
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);
    await vi.advanceTimersByTimeAsync(5 * SECOND);

    world.wake.fire();
    world.online.fire();
    expect(world.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(MIN_SYNC_GAP_MS);
    world.online.fire();
    expect(world.requests).toBe(2);
    await vi.advanceTimersByTimeAsync(MIN_SYNC_GAP_MS);
    world.wake.fire();
    expect(world.requests).toBe(3);
  });

  it("catches up immediately when the page wakes after its timers were frozen", async () => {
    const world = createWorld();
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);
    await vi.advanceTimersByTimeAsync(2 * SECOND);

    // A frozen tab: time passes, no timer runs.
    vi.setSystemTime(Date.now() + 37 * SECOND + 450);
    world.wake.fire();

    expect(clock.getSnapshot()).toBe(trueSecond());
  });

  it("slews a small correction: the shown time never steps back and never stalls", async () => {
    const world = createWorld({ deviceErrorMs: 1800 });
    const clock = createClock({ serverNow: START }, () => world.deps);
    const { shown } = watch(clock);
    await vi.advanceTimersByTimeAsync(RESYNC_INTERVAL_MS - 30 * SECOND);
    expect(clock.offsetMs()).toBe(0);

    // The device has drifted past the threshold by the next reading.
    world.deviceErrorMs = 2600;
    const before = shown.length;
    await vi.advanceTimersByTimeAsync(30 * SECOND + world.latencyMs + 20 * SECOND);

    expect(clock.offsetMs()).toBe(-2600);
    expect(clock.getSnapshot()).toBe(trueSecond());
    for (let index = before; index < shown.length; index += 1) {
      const stepMs = shown[index].secondMs - shown[index - 1].secondMs;
      const waitMs = shown[index].trueMs - shown[index - 1].trueMs;
      expect(stepMs).toBe(SECOND);
      // While slewing, a displayed second lasts 1 / (1 - rate) real seconds; the
      // one on screen when the answer arrives may have begun a few milliseconds early.
      expect(waitMs).toBeLessThanOrEqual(1400);
    }
    // Once the slew is over the display is back on the true second boundaries.
    const last = shown[shown.length - 1];
    expect(last.secondMs).toBe(last.trueMs);
  });

  it("carries on undisturbed when the device clock is set right, and confirms with the server", async () => {
    const world = createWorld({ deviceErrorMs: -5 * MINUTE });
    const clock = createClock({ serverNow: START }, () => world.deps);
    const { shown } = watch(clock);
    await vi.advanceTimersByTimeAsync(20 * SECOND);
    expect(clock.offsetMs()).toBe(5 * MINUTE);
    const requestsBefore = world.requests;

    // The box finally synchronises its clock: the device time jumps five minutes.
    world.deviceErrorMs = 0;
    await vi.advanceTimersByTimeAsync(20 * SECOND);

    expect(clock.offsetMs()).toBe(0);
    expect(world.requests).toBe(requestsBefore + 1);
    for (let index = 1; index < shown.length; index += 1) {
      expect(shown[index].secondMs - shown[index - 1].secondMs).toBe(SECOND);
    }
    expect(clock.getSnapshot()).toBe(trueSecond());
  });

  it("follows the device clock across a sleep and re-reads the server at once", async () => {
    const world = createWorld();
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);
    await vi.advanceTimersByTimeAsync(30 * SECOND);
    const requestsBefore = world.requests;

    // An hour of sleep: wall time moves on, the monotonic clock and the timers do not.
    vi.setSystemTime(Date.now() + 60 * MINUTE);
    world.monotonicShiftMs -= 60 * MINUTE;
    await vi.advanceTimersByTimeAsync(SECOND);

    expect(clock.getSnapshot()).toBe(trueSecond());
    expect(world.requests).toBe(requestsBefore + 1);
    expect(clock.offsetMs()).toBe(0);
  });

  it("discards a reading taken across a change of the device clock and asks again", async () => {
    const world = createWorld({ latencyMs: 1600 });
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);
    await vi.advanceTimersByTimeAsync(100);

    // Mid-request the device clock is set ten seconds forward.
    world.deviceErrorMs = 10 * SECOND;
    await vi.advanceTimersByTimeAsync(1500);
    // The straddling answer would have said "minus ten seconds, give or take"; it must not be used.
    expect(world.requests).toBe(2);
    expect(Math.abs(clock.offsetMs())).toBeLessThan(CLOCK_STEP_THRESHOLD_MS);

    await vi.advanceTimersByTimeAsync(1600 + 5 * SECOND);
    expect(clock.offsetMs()).toBe(-10 * SECOND);
    expect(clock.getSnapshot()).toBe(trueSecond());
  });

  it("reads the corrected time to the millisecond between ticks", async () => {
    const world = createWorld({ deviceErrorMs: -5 * MINUTE });
    const clock = createClock({ serverNow: START }, () => world.deps);
    watch(clock);
    await vi.advanceTimersByTimeAsync(10 * SECOND + 123);
    expect(clock.read()).toBe(Date.now());
  });

  it("stops every timer and listener with its last subscriber, and resumes with the next", async () => {
    const world = createWorld({ deviceErrorMs: -5 * MINUTE });
    const clock = createClock({ serverNow: START }, () => world.deps);
    const first = watch(clock);
    const second = watch(clock);
    await vi.advanceTimersByTimeAsync(3 * SECOND);

    first.unsubscribe();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    second.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    expect(world.wake.count()).toBe(0);
    expect(world.online.count()).toBe(0);

    await vi.advanceTimersByTimeAsync(10 * SECOND);
    const again = watch(clock);
    expect(clock.getSnapshot()).toBe(trueSecond());
    // The correction learned earlier is still in force.
    expect(clock.offsetMs()).toBe(5 * MINUTE);
    again.unsubscribe();
  });

  it("ignores an answer that arrives after it was stopped", async () => {
    const world = createWorld({ deviceErrorMs: 5 * MINUTE, latencyMs: 400 });
    const clock = createClock({ serverNow: START }, () => world.deps);
    const { shown, unsubscribe } = watch(clock);
    await vi.advanceTimersByTimeAsync(100);
    unsubscribe();

    await vi.advanceTimersByTimeAsync(SECOND);

    expect(shown).toEqual([]);
    expect(clock.getSnapshot()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
