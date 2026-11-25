"use client";

import { useMemo } from "react";
import { useDisplay, usePrayerSchedule } from "@/lib/client";
import { staticDayFacts, type DayFacts } from "@/lib/site/home";

/**
 * The facts about the day that decide which blocks the home page shows: the
 * state of the timetable, tomorrow's changes and the upcoming Jumu'ah.
 *
 * Renderable on the server. Before the live clock is running they are worked
 * out from the payload alone, as of the moment it was produced, so the
 * server-rendered page already has the right blocks at the right size and
 * nothing appears or moves when the page comes alive. The live schedule
 * takes over after mount. Must be used inside `DisplayProvider`.
 */
export function useDayFacts(): DayFacts {
  const { payload } = useDisplay();
  const schedule = usePrayerSchedule();
  return useMemo(() => schedule ?? staticDayFacts(payload), [schedule, payload]);
}
