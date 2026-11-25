/**
 * The display clock: the device clock, corrected against the server.
 *
 * A phone's clock is within a second of the truth, but the cheap TV boxes
 * that drive mosque wall screens are often minutes out, and a prayer
 * countdown is only as good as the clock behind it. The server's time arrives
 * with the page (`DisplayPayload.serverNow`) and from `GET /api/version`;
 * this module turns those readings into an offset and applies it only when
 * the device is noticeably wrong.
 *
 * How the offset is found
 * - Every exchange with the server brackets the true offset: the server read
 *   its clock somewhere between the moment the request left and the moment
 *   the answer arrived, so the offset lies within half a round trip of the
 *   midpoint estimate. Successive brackets are intersected, which narrows the
 *   estimate over time and keeps one slow request from moving the clock.
 * - The time embedded in the page is older than the page's first render by an
 *   unknown amount (download, parsing, or days in an offline cache). It can
 *   therefore prove that the device is BEHIND, never that it is ahead.
 *
 * How the offset is applied
 * - Only beyond a threshold, with hysteresis, so a healthy clock is left
 *   alone and a borderline one does not flip between corrected and not.
 * - Small changes are slewed (the clock runs a little fast or slow for a few
 *   seconds), so the displayed time never steps back by a second or two.
 *   Large errors are corrected at once: being right matters more.
 *
 * The first half of the file is pure arithmetic. `createClock` at the end is
 * the engine that drives it with timers and requests, all injected.
 */

import { MS_PER_MINUTE, MS_PER_SECOND } from "@/lib/time";
import {
  browserFetch,
  browserTimers,
  isDocumentVisible,
  onPageWake,
  onWindowEvent,
} from "./browser";
import { fetchJson, type JsonFetchDeps, type TimerHandle } from "./http";

/** Endpoint that reports the server clock and the running build. */
export const VERSION_ENDPOINT = "/api/version";

/** The device clock is corrected once it is further out than this. */
export const OFFSET_APPLY_THRESHOLD_MS = 2000;

/** A correction in force is dropped once the device is back within this. */
export const OFFSET_RELEASE_THRESHOLD_MS = 1000;

/** A reading whose request took longer than this says too little to be used. */
export const MAX_ROUND_TRIP_MS = 2000;

/** How often the server clock is read while the page is on screen. */
export const RESYNC_INTERVAL_MS = 10 * MS_PER_MINUTE;

/**
 * How often it is read while the page reports itself hidden. Not "never":
 * some signage players report a page as hidden while it is on the wall.
 */
export const HIDDEN_RESYNC_INTERVAL_MS = 60 * MS_PER_MINUTE;

/** How soon a failed reading is retried. */
export const RESYNC_RETRY_MS = MS_PER_MINUTE;

/** Readings prompted by the tab or the network coming back are at least this far apart. */
export const MIN_SYNC_GAP_MS = 15 * MS_PER_SECOND;

/**
 * How long the first display waits for a server reading when the page's own
 * timestamp cannot tell whether the device is ahead or the page is old.
 */
export const INITIAL_SYNC_DEADLINE_MS = 1500;

/** Fraction of real time by which the clock runs fast or slow while it slews. */
export const SLEW_RATE = 0.25;

/** Corrections up to this size are slewed; larger ones are applied at once. */
export const SLEW_LIMIT_MS = 5000;

/** A jump of the device clock, relative to the monotonic clock, larger than this is a step. */
export const CLOCK_STEP_THRESHOLD_MS = 1500;

/** Deadline of a clock reading: just past the longest round trip that would still be used. */
const SAMPLE_TIMEOUT_MS = MAX_ROUND_TRIP_MS + 500;

/**
 * How fast a device clock may drift between two readings (200 ppm, several
 * times worse than a poor quartz oscillator). Older brackets are widened by
 * this before they are intersected with a new one.
 */
const DRIFT_RATE = 2e-4;

/** A timer that fires this close before a second boundary is treated as having reached it. */
const EARLY_TICK_TOLERANCE_MS = 20;

/** Shortest wait between two ticks, so a misbehaving clock cannot spin the CPU. */
const MIN_TICK_DELAY_MS = 20;

/** Spread applied to the resync interval so a hall full of screens does not ask in unison. */
const RESYNC_JITTER = 0.1;

/** One request/response exchange in which the server reported its clock. */
export interface ClockExchange {
  /** Device clock when the request was sent. */
  requestStartMs: number;
  /** Device clock when the response arrived. */
  responseEndMs: number;
  /** The server clock reported in the response. */
  serverNowMs: number;
}

/** An estimate of `server clock - device clock` from one exchange. */
export interface OffsetSample {
  /** Estimated offset; add it to the device clock to get the server's time. */
  offsetMs: number;
  /** Duration of the exchange; the estimate is accurate to half of it. */
  roundTripMs: number;
  /** Device clock when the response arrived. */
  atMs: number;
}

/** The range the true offset is known to lie in. */
export interface OffsetBounds {
  lowMs: number;
  highMs: number;
  /** Device clock when the range was last narrowed. */
  atMs: number;
}

/** What the timestamp embedded in the page says about the device clock. */
export interface InitialOffset {
  /** Offset to start with; zero unless the device is provably behind. */
  offsetMs: number;
  /**
   * True when the timestamp is older than the device clock by more than the
   * threshold: either the device runs ahead or the page is stale, and only a
   * live reading can tell. The clock should not be shown before one arrives.
   */
  awaitSample: boolean;
}

/** When to show which second. */
export interface TickPlan {
  /** The whole second to display, epoch milliseconds. */
  secondMs: number;
  /** Real milliseconds to wait before the next tick. */
  delayMs: number;
}

/** The answer of `GET /api/version` together with the timing of the request. */
export interface ServerReading extends ClockExchange {
  /** Build id of the server that answered. */
  version: string;
}

/** What the clock engine needs from its environment. */
export interface ClockDeps extends JsonFetchDeps {
  /** A clock that never jumps (`performance.now()`), milliseconds. */
  monotonicNow(): number;
  /** A number in [0, 1). */
  random(): number;
  /** Whether the page is on screen. */
  isVisible(): boolean;
  /** Subscribes to "the page is in front of the viewer again"; returns the unsubscribe function. */
  onWake(listener: () => void): () => void;
  /** Subscribes to "the device has a network again"; returns the unsubscribe function. */
  onOnline(listener: () => void): () => void;
}

/** Options of {@link createClock}. */
export interface ClockOptions {
  /** `DisplayPayload.serverNow` of the payload the page was rendered with. */
  serverNow: number;
}

/**
 * A running display clock. Shaped as an external store so React can read it
 * with `useSyncExternalStore`; it runs while it has at least one subscriber.
 */
export interface Clock {
  /** Subscribes to changes of the displayed second; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** The second to display, epoch milliseconds, or null while there is nothing to show yet. */
  getSnapshot(): number | null;
  /** The corrected time right now, to the millisecond. For timers and event handlers, not for rendering. */
  read(): number;
  /** The correction currently added to the device clock, in milliseconds. */
  offsetMs(): number;
}

/**
 * Turns one exchange with the server into an offset estimate, using the
 * midpoint of the request as the moment the server read its clock.
 * @returns null when the exchange cannot be trusted: a value is not a finite
 *          number, the device clock ran backwards during the request, or the
 *          round trip exceeded {@link MAX_ROUND_TRIP_MS}.
 */
export function measureOffset(exchange: ClockExchange): OffsetSample | null {
  const { requestStartMs, responseEndMs, serverNowMs } = exchange;
  if (
    !Number.isFinite(requestStartMs) ||
    !Number.isFinite(responseEndMs) ||
    !Number.isFinite(serverNowMs)
  ) {
    return null;
  }
  const roundTripMs = responseEndMs - requestStartMs;
  if (roundTripMs < 0 || roundTripMs > MAX_ROUND_TRIP_MS) return null;
  return {
    offsetMs: serverNowMs - (requestStartMs + roundTripMs / 2),
    roundTripMs,
    atMs: responseEndMs,
  };
}

/**
 * Narrows the range the offset is known to lie in with a new sample. The
 * earlier range is first widened for the drift the device clock may have
 * accumulated since. When the two do not overlap the device clock must have
 * been changed in between, and the new sample replaces the history.
 */
export function refineBounds(previous: OffsetBounds | null, sample: OffsetSample): OffsetBounds {
  const halfTrip = sample.roundTripMs / 2;
  const own: OffsetBounds = {
    lowMs: sample.offsetMs - halfTrip,
    highMs: sample.offsetMs + halfTrip,
    atMs: sample.atMs,
  };
  if (previous === null) return own;
  const drift = Math.abs(sample.atMs - previous.atMs) * DRIFT_RATE;
  const lowMs = Math.max(previous.lowMs - drift, own.lowMs);
  const highMs = Math.min(previous.highMs + drift, own.highMs);
  return lowMs <= highMs ? { lowMs, highMs, atMs: sample.atMs } : own;
}

/** The best single estimate of the offset within a range: its midpoint. */
export function estimateOffset(bounds: OffsetBounds): number {
  return (bounds.lowMs + bounds.highMs) / 2;
}

/**
 * Decides which correction to apply for an estimated offset: none while the
 * device is within the threshold, the whole estimate beyond it.
 * @param correcting Whether a correction is in force already. It then stays
 *        in force down to the lower release threshold, so a clock that hovers
 *        around the limit does not switch back and forth.
 */
export function chooseAppliedOffset(estimateMs: number, correcting: boolean): number {
  if (!Number.isFinite(estimateMs)) return 0;
  const threshold = correcting ? OFFSET_RELEASE_THRESHOLD_MS : OFFSET_APPLY_THRESHOLD_MS;
  return Math.abs(estimateMs) > threshold ? Math.round(estimateMs) : 0;
}

/**
 * Reads the timestamp embedded in the page against the device clock at first
 * render. The timestamp is older than "now" by the time the page took to
 * arrive, or by days when the page came from an offline cache, so:
 * - a device clock clearly BEHIND it is certainly wrong, and the difference
 *   is a safe (if slightly low) correction to start with;
 * - a device clock clearly AHEAD of it proves nothing, and the caller should
 *   wait for a live reading (`awaitSample`).
 */
export function initialOffset(serverNowMs: number, deviceNowMs: number): InitialOffset {
  const estimate = serverNowMs - deviceNowMs;
  if (!Number.isFinite(estimate)) return { offsetMs: 0, awaitSample: false };
  if (estimate > OFFSET_APPLY_THRESHOLD_MS) {
    return { offsetMs: Math.round(estimate), awaitSample: false };
  }
  return { offsetMs: 0, awaitSample: estimate < -OFFSET_APPLY_THRESHOLD_MS };
}

/**
 * Moves the applied offset toward its target without letting the displayed
 * clock run backwards: over `elapsedMs` of real time it changes by at most
 * `elapsedMs * SLEW_RATE`, so the clock keeps advancing at 75% to 125% of
 * real speed. A gap larger than {@link SLEW_LIMIT_MS} is closed at once.
 */
export function slewOffset(appliedMs: number, targetMs: number, elapsedMs: number): number {
  const gap = targetMs - appliedMs;
  if (Math.abs(gap) > SLEW_LIMIT_MS) return targetMs;
  const step = Math.max(0, elapsedMs) * SLEW_RATE;
  return Math.abs(gap) <= step ? targetMs : appliedMs + Math.sign(gap) * step;
}

/**
 * Plans a tick of a seconds display: which second to show now and how long to
 * wait for the next boundary. Each tick is planned from the clock itself, so
 * late timers never accumulate into drift the way a fixed interval does.
 * @param nowMs         The corrected time.
 * @param pendingSlewMs What is left of a correction being slewed (target minus
 *                      applied offset). Until it is used up the corrected
 *                      clock runs fast (positive) or slow (negative), so the
 *                      boundary arrives sooner or later than in real time.
 */
export function planTick(nowMs: number, pendingSlewMs: number = 0): TickPlan {
  const secondMs =
    Math.floor((nowMs + EARLY_TICK_TOLERANCE_MS) / MS_PER_SECOND) * MS_PER_SECOND;
  const remainingMs = secondMs + MS_PER_SECOND - nowMs;
  const pendingMs = Number.isFinite(pendingSlewMs) ? pendingSlewMs : 0;
  const speed = 1 + Math.sign(pendingMs) * SLEW_RATE;
  // The slew may end before the boundary: from then on the clock runs at real speed.
  const slewLastsMs = Math.abs(pendingMs) / SLEW_RATE;
  const slewCoversMs = slewLastsMs * speed;
  const waitMs =
    remainingMs <= slewCoversMs
      ? remainingMs / speed
      : slewLastsMs + (remainingMs - slewCoversMs);
  return { secondMs, delayMs: Math.max(MIN_TICK_DELAY_MS, Math.ceil(waitMs)) };
}

/**
 * Keeps the displayed second from stepping back a little: when the next
 * second to show lies up to {@link SLEW_LIMIT_MS} before the one on screen
 * (the device clock was nudged back), the screen holds its value until time
 * catches up. A larger step back is a real correction and is shown.
 */
export function holdDisplay(shownMs: number | null, candidateMs: number): number {
  if (shownMs === null || candidateMs >= shownMs) return candidateMs;
  return shownMs - candidateMs <= SLEW_LIMIT_MS ? shownMs : candidateMs;
}

/**
 * Reacts to a jump of the device clock while a correction is in force. When
 * the jump leaves less than the apply threshold to correct, the device has
 * just been set right (typically its first time sync after boot) and the
 * correction is reduced by the jump, so the displayed time carries on
 * undisturbed. Any other jump (the device woke from sleep, somebody changed
 * the clock) leaves the correction alone; the next server reading decides.
 * @param appliedMs The correction in force.
 * @param stepMs    How far the device clock jumped (positive = forwards).
 * @returns The correction to apply from now on.
 */
export function absorbClockStep(appliedMs: number, stepMs: number): number {
  if (appliedMs === 0 || !Number.isFinite(stepMs)) return appliedMs;
  const remainder = appliedMs - stepMs;
  return Math.abs(remainder) <= OFFSET_APPLY_THRESHOLD_MS ? remainder : appliedMs;
}

/**
 * Validates the body of `GET /api/version`.
 * @returns The build id and the server clock, or null for anything else.
 */
export function parseVersionResponse(body: unknown): { version: string; serverNow: number } | null {
  if (typeof body !== "object" || body === null) return null;
  const { version, serverNow } = body as { version?: unknown; serverNow?: unknown };
  if (typeof version !== "string" || version === "") return null;
  if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return null;
  return { version, serverNow };
}

/**
 * Asks the server for its clock and build id.
 * @returns null when the server could not be reached, answered with an error
 *          or something that is not a version response, or when the answer
 *          came out of the service worker's cache (a cached clock is poison).
 */
export async function readServerClock(
  deps: JsonFetchDeps,
  timeoutMs: number = SAMPLE_TIMEOUT_MS,
): Promise<ServerReading | null> {
  const result = await fetchJson(VERSION_ENDPOINT, timeoutMs, deps);
  if (result.kind !== "ok" || result.cached) return null;
  const body = parseVersionResponse(result.body);
  if (body === null) return null;
  return {
    version: body.version,
    serverNowMs: body.serverNow,
    requestStartMs: result.startedAtMs,
    responseEndMs: result.receivedAtMs,
  };
}

/** The dependencies of {@link createClock} in a browser. */
export function browserClockDeps(): ClockDeps {
  return {
    fetch: browserFetch,
    now: () => Date.now(),
    monotonicNow: () => performance.now(),
    random: () => Math.random(),
    timers: browserTimers,
    isVisible: isDocumentVisible,
    onWake: onPageWake,
    onOnline: (listener) => onWindowEvent("online", listener),
  };
}

/**
 * Creates the display clock. Creating it has no side effects, so it is safe
 * during server rendering; it starts with its first subscriber (reading the
 * server clock at once, then every ten minutes, and whenever the page or the
 * network comes back) and stops with its last.
 *
 * The clock publishes whole seconds, each at its own boundary. It publishes
 * nothing until it knows what to show: at once on most devices, and after the
 * first server reading (or {@link INITIAL_SYNC_DEADLINE_MS}) when the page's
 * timestamp suggests the device clock may be ahead.
 *
 * @param resolveDeps Supplies the environment at start; replaceable in tests.
 */
export function createClock(
  options: ClockOptions,
  resolveDeps: () => ClockDeps = browserClockDeps,
): Clock {
  const listeners = new Set<() => void>();
  let deps: ClockDeps | null = null;
  let running = false;
  let initialised = false;
  /** Bumped on every stop, so work begun in an earlier run can recognise itself as stale. */
  let run = 0;

  /** The correction added to the device clock right now. */
  let appliedMs = 0;
  /** The correction it is moving toward. */
  let targetMs = 0;
  let correcting = false;
  let bounds: OffsetBounds | null = null;
  /** Device clock when `appliedMs` was last brought up to date. */
  let advancedAtMs = 0;
  /** Device clock minus monotonic clock at the last look; a change means the device clock was set. */
  let skewMs = 0;
  /** Counts device clock steps, so a reading taken across one can be discarded. */
  let steps = 0;

  let shownMs: number | null = null;
  let awaitingSample = false;

  let tickTimer: TimerHandle = null;
  let syncTimer: TimerHandle = null;
  let deadlineTimer: TimerHandle = null;
  let syncing = false;
  let lastSyncAt = -Infinity;
  let unlisten: Array<() => void> = [];

  function emit(): void {
    listeners.forEach((listener) => listener());
  }

  /** Follows the device clock: detects a step, otherwise lets the slew progress. */
  function advance(env: ClockDeps): number {
    const wallMs = env.now();
    const skewNow = wallMs - env.monotonicNow();
    const stepMs = skewNow - skewMs;
    skewMs = skewNow;
    if (Math.abs(stepMs) > CLOCK_STEP_THRESHOLD_MS) {
      steps += 1;
      const absorbed = absorbClockStep(appliedMs, stepMs);
      if (absorbed !== appliedMs) {
        appliedMs = absorbed;
        targetMs = absorbed;
        correcting = absorbed !== 0;
      }
      // Readings taken before the step describe a clock that no longer exists.
      bounds = null;
      void sync(true);
    } else {
      appliedMs = slewOffset(appliedMs, targetMs, wallMs - advancedAtMs);
    }
    advancedAtMs = wallMs;
    return wallMs;
  }

  function tick(): void {
    const env = deps;
    if (!running || env === null || awaitingSample) return;
    env.timers.clearTimeout(tickTimer);
    const wallMs = advance(env);
    const plan = planTick(wallMs + appliedMs, targetMs - appliedMs);
    const nextShownMs = holdDisplay(shownMs, plan.secondMs);
    if (nextShownMs !== shownMs) {
      shownMs = nextShownMs;
      emit();
    }
    tickTimer = env.timers.setTimeout(tick, plan.delayMs);
  }

  /** Ends the wait for a first reading and starts the display. */
  function beginDisplay(): void {
    if (deps !== null) deps.timers.clearTimeout(deadlineTimer);
    awaitingSample = false;
    tick();
  }

  function scheduleSync(env: ClockDeps, succeeded: boolean): void {
    let interval = RESYNC_RETRY_MS;
    if (succeeded) interval = env.isVisible() ? RESYNC_INTERVAL_MS : HIDDEN_RESYNC_INTERVAL_MS;
    const jitter = 1 + (env.random() * 2 - 1) * RESYNC_JITTER;
    env.timers.clearTimeout(syncTimer);
    syncTimer = env.timers.setTimeout(() => void sync(true), interval * jitter);
  }

  /**
   * Reads the server clock and retargets the correction.
   * @param force Skip the minimum gap between readings (timer-driven and
   *        step-driven readings; wake and online events are throttled).
   */
  async function sync(force: boolean): Promise<void> {
    const env = deps;
    if (!running || env === null || syncing) return;
    const startedAt = env.monotonicNow();
    if (!force && startedAt - lastSyncAt < MIN_SYNC_GAP_MS) return;
    lastSyncAt = startedAt;
    syncing = true;
    env.timers.clearTimeout(syncTimer);
    const startedInRun = run;
    const startedAtStep = steps;

    const reading = await readServerClock(env);
    if (startedInRun !== run) return;
    syncing = false;

    advance(env);
    if (steps !== startedAtStep) {
      // The device clock was set while the request was in flight: its two
      // timestamps belong to different clocks. Ask again.
      void sync(true);
      return;
    }
    const sample = reading === null ? null : measureOffset(reading);
    if (sample !== null) {
      bounds = refineBounds(bounds, sample);
      targetMs = chooseAppliedOffset(estimateOffset(bounds), correcting);
      correcting = targetMs !== 0;
      // With nothing on screen yet there is no continuity to preserve.
      if (shownMs === null) appliedMs = targetMs;
    }
    scheduleSync(env, sample !== null);
    if (awaitingSample) beginDisplay();
    else tick();
  }

  function start(): void {
    const env = resolveDeps();
    deps = env;
    running = true;
    const wallMs = env.now();
    skewMs = wallMs - env.monotonicNow();
    advancedAtMs = wallMs;
    if (!initialised) {
      initialised = true;
      const initial = initialOffset(options.serverNow, wallMs);
      appliedMs = initial.offsetMs;
      targetMs = initial.offsetMs;
      correcting = initial.offsetMs !== 0;
      awaitingSample = initial.awaitSample;
    }
    unlisten = [
      env.onWake(() => {
        // Timers were throttled or frozen while the page was away.
        tick();
        void sync(false);
      }),
      env.onOnline(() => void sync(false)),
    ];
    if (awaitingSample) {
      deadlineTimer = env.timers.setTimeout(beginDisplay, INITIAL_SYNC_DEADLINE_MS);
    } else {
      tick();
    }
    void sync(true);
  }

  function stop(): void {
    running = false;
    run += 1;
    syncing = false;
    if (deps !== null) {
      deps.timers.clearTimeout(tickTimer);
      deps.timers.clearTimeout(syncTimer);
      deps.timers.clearTimeout(deadlineTimer);
    }
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
    getSnapshot: () => shownMs,
    read() {
      const wallMs = deps === null ? Date.now() : deps.now();
      if (!running) return wallMs + appliedMs;
      return wallMs + slewOffset(appliedMs, targetMs, wallMs - advancedAtMs);
    },
    offsetMs: () => appliedMs,
  };
}
