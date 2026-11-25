"use client";

import { useDisplay, usePrayerState } from "@/lib/client";
import { timetableDayAt, type TimetableDay } from "@/lib/tv/timetable";

/**
 * Which day the TV timetable shows right now: today's, or tomorrow's once
 * the Isha congregation is over (see `timetableDayAt`). `today` before the
 * page has mounted.
 *
 * Reads the per-second prayer state, so a component that calls it re-renders
 * every second; keep such components thin and hand the result to memoised
 * children. Must be used inside `DisplayProvider`.
 */
export function useTimetableDay(): TimetableDay {
  const state = usePrayerState();
  const { settings } = useDisplay();
  if (state === null) return "today";
  return timetableDayAt({
    nowMs: state.nowMs,
    schedule: state,
    inProgressMinutes: settings.tv.jamaatInProgressMinutes,
  });
}
