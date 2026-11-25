/**
 * Pure logic behind the home page: what can be said about the day before the
 * live clock is running, the days a visitor can step through, and the wording
 * of the small labels.
 */

import { payloadDate, type ScheduledEvent, type TimetableRow } from "@/lib/client/prayer-view";
import {
  addDays,
  computePrayerState,
  diffDays,
  getDayRow,
  prayerRowsForDay,
  type DataStatus,
  type JamaatChange,
  type UpcomingJumuah,
} from "@/lib/time";
import {
  DISPLAY_WINDOW_DAYS_AHEAD,
  DISPLAY_WINDOW_DAYS_BEHIND,
  PRAYERS,
  type DateString,
  type DisplayPayload,
} from "@/lib/types";

/**
 * The parts of the prayer state that decide which blocks the home page shows
 * and how tall they are. They depend on the date (and on a Friday on whether
 * Jumu'ah is over), not on the second, so they can be rendered on the server.
 */
export interface DayFacts {
  /** The mosque's date these facts are for. */
  today: DateString;
  /** Whether the timetable can serve that day. */
  dataStatus: DataStatus;
  /** Congregation times that differ the day after. */
  tomorrowChanges: JamaatChange[];
  /** The Jumu'ah to advertise. */
  jumuah: UpcomingJumuah;
}

/**
 * The day facts as of the moment the payload was produced. The server and
 * the browser both derive them from the payload alone, never from a clock of
 * their own, so the server-rendered page and its hydration always agree; the
 * live schedule takes over once the clock is running.
 */
export function staticDayFacts(payload: DisplayPayload): DayFacts {
  const state = computePrayerState({
    days: payload.days,
    settings: payload.settings,
    nowMs: payload.serverNow,
  });
  return {
    today: state.today,
    dataStatus: state.dataStatus,
    tomorrowChanges: state.tomorrowChanges,
    jumuah: state.jumuah,
  };
}

/** The first and last day a visitor can step to on the home page. */
export interface BrowseWindow {
  first: DateString;
  last: DateString;
}

/**
 * The days the day browser offers: the days the payload carries (yesterday
 * to five weeks ahead of the day it was produced on), cut back to what the
 * timetable actually covers, and always including today.
 * @param today The mosque's current date.
 */
export function browseWindow(payload: DisplayPayload, today: DateString): BrowseWindow {
  const produced = payloadDate(payload);
  let first = addDays(produced, -DISPLAY_WINDOW_DAYS_BEHIND);
  let last = addDays(produced, DISPLAY_WINDOW_DAYS_AHEAD);
  const { firstDate, lastDate } = payload.coverage;
  if (firstDate !== null && firstDate > first) first = firstDate;
  if (lastDate !== null && lastDate < last) last = lastDate;
  return { first: first < today ? first : today, last: last > today ? last : today };
}

/**
 * The day browser's state after asking for a date: the date itself, pulled
 * back inside the window, or null when that is today. Null means "follow
 * today", so a page left open overnight moves on to the new day by itself.
 */
export function selectDay(
  candidate: DateString,
  today: DateString,
  window: BrowseWindow,
): DateString | null {
  const bounded = candidate < window.first ? window.first : candidate > window.last ? window.last : candidate;
  return bounded === today ? null : bounded;
}

/** Whether the browser can move `delta` days from the date it is showing. */
export function canStepDay(viewing: DateString, delta: number, window: BrowseWindow): boolean {
  const target = addDays(viewing, delta);
  return target >= window.first && target <= window.last;
}

/**
 * How far a date is from today, in words: `Today`, `Tomorrow`, `Yesterday`,
 * `In 5 days`, `5 days ago`.
 */
export function relativeDayLabel(date: DateString, today: DateString): string {
  const offset = diffDays(today, date);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return offset > 0 ? `In ${offset} days` : `${-offset} days ago`;
}

/**
 * The timetable rows of any day in the payload, without live statuses. A day
 * the payload has no row for gives the six rows with empty times.
 */
export function rowsForDate(payload: DisplayPayload, date: DateString): TimetableRow[] {
  const rows = prayerRowsForDay(getDayRow(payload.days, date), payload.settings, date);
  return rows.map((row) => ({ ...row, status: null }));
}

/** The note of a day in the payload (`Clocks go back`), or null when it has none. */
export function noteForDate(payload: DisplayPayload, date: DateString): string | null {
  const note = getDayRow(payload.days, date)?.note?.trim();
  return note ? note : null;
}

/**
 * The Arabic name that belongs with an event's English description. On a
 * Friday the Dhuhr row is presented as Jumu'ah, but the start of its time is
 * still described as `Dhuhr begins`, so that event takes the Arabic for
 * Dhuhr rather than for Jumu'ah.
 */
export function eventArabic(event: Pick<ScheduledEvent, "key" | "kind" | "arabic">): string {
  if (event.kind === "jamaat") return event.arabic;
  const prayer = PRAYERS.find((candidate) => candidate.key === event.key);
  return prayer === undefined ? event.arabic : prayer.arabic;
}
