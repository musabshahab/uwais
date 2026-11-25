/**
 * The next-event panel of the TV display: what the congregation is waiting
 * for, in words, and whether it is close enough to call for attention.
 */

import { describeEvent } from "@/lib/client/prayer-view";
import type { PrayerEvent, PrayerState } from "@/lib/time";

/** What the panel shows. */
export interface NextEventView {
  /** The event being counted down to. */
  event: PrayerEvent;
  /** The line above the countdown: `Asr jamaat in`, `Maghrib begins in`, `2nd Jumu'ah in`. */
  label: string;
  /** What a screen reader says the countdown is for: `Time until Asr jamaat`. */
  timerLabel: string;
  /** True in the final minutes before a congregation, when the panel turns brass. */
  urgent: boolean;
}

/** A congregation this many seconds away or fewer is urgent: the final five minutes. */
export const URGENT_SECONDS = 5 * 60;

/**
 * Describes the next event of a prayer state, or null when the timetable has
 * nothing ahead. Only a congregation becomes urgent: the start of a prayer
 * time is not something to hurry for.
 */
export function nextEventView(state: Pick<PrayerState, "next">): NextEventView | null {
  const event = state.next;
  if (event === null) return null;
  const description = describeEvent(event);
  return {
    event,
    label: `${description} in`,
    timerLabel: `Time until ${description}`,
    urgent: event.kind === "jamaat" && event.secondsUntil <= URGENT_SECONDS,
  };
}
