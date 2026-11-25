"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createClock, type ClockOptions } from "./clock";

/** The display clock as a component sees it. */
export interface LiveClock {
  /**
   * The corrected time as a whole second, epoch milliseconds, updated at each
   * second boundary. Null on the server, during hydration and until the
   * clock knows what to show; render a placeholder for that case.
   */
  nowMs: number | null;
  /**
   * The corrected time right now, to the millisecond. For timers and event
   * handlers; calling it while rendering would make the output impure.
   */
  read(): number;
}

/** The clock has no value the server could know, so the server and hydration render "not yet". */
const getServerSnapshot = (): null => null;

/**
 * Runs the display clock for the lifetime of the component: ticks once per
 * second on the second, and corrects a device clock that is more than two
 * seconds out against the server (see `./clock`).
 *
 * Hydration: the value is null on the server and stays null through
 * hydration, so markup that depends on it cannot mismatch; the first real
 * value arrives in an update right after mount.
 *
 * @param options `serverNow` of the payload the page was rendered with. Read
 *        once; later changes are ignored.
 */
export function useLiveClock(options: ClockOptions): LiveClock {
  const [clock] = useState(() => createClock({ serverNow: options.serverNow }));
  const nowMs = useSyncExternalStore(clock.subscribe, clock.getSnapshot, getServerSnapshot);
  return useMemo(() => ({ nowMs, read: clock.read }), [nowMs, clock]);
}

/**
 * The corrected current time as a whole second (epoch milliseconds), or null
 * until the component has mounted. See {@link useLiveClock}.
 */
export function useClock(options: ClockOptions): number | null {
  return useLiveClock(options).nowMs;
}
