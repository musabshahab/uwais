/**
 * Which day the TV timetable shows, and its rows.
 *
 * During the day the table is today's. Once the Isha congregation is over,
 * nobody in the hall needs today's times any more: people on their way out
 * want to know when Fajr is. From that moment until midnight the table shows
 * tomorrow's times under an unmissable "Tomorrow" heading, and at midnight
 * tomorrow becomes today.
 *
 * Pure functions over the prayer schedule; the instants come from the time
 * engine, so nothing here reads a clock or a timezone of its own.
 */

import type { PrayerSchedule, TimetableRow, TimetableView } from "@/lib/client/prayer-view";
import {
  MS_PER_MINUTE,
  isValidTimeString,
  prayerRowsForDay,
  zonedDateTimeToEpochMs,
  type PrayerEventKind,
} from "@/lib/time";
import {
  TIME_FIELDS,
  type DateString,
  type PrayerDay,
  type SiteSettings,
  type TimeString,
} from "@/lib/types";

/** The day a TV timetable is for. */
export type TimetableDay = "today" | "tomorrow";

/** Input of {@link timetableDayAt}. */
export interface TimetableDayInput {
  /** The current instant, epoch milliseconds (`state.nowMs`). */
  nowMs: number;
  schedule: Pick<
    PrayerSchedule,
    "today" | "rows" | "tomorrowRow" | "next" | "jamaatInProgress" | "timezone"
  >;
  /** `settings.tv.jamaatInProgressMinutes`: how long a congregation counts as in progress. */
  inProgressMinutes: number;
}

/** Input of {@link buildTvTimetable}. */
export interface TvTimetableInput {
  /** Today's rows from `useTimetable()`: without statuses before the clock is known. */
  timetable: TimetableView;
  /** The live schedule, or null before the clock is known (the table is then today's). */
  schedule: Pick<PrayerSchedule, "tomorrow" | "tomorrowRow" | "next" | "nextBegins"> | null;
  settings: Pick<SiteSettings, "jumuah"> & { tv: Pick<SiteSettings["tv"], "showSunrise"> };
  /** The day to show, from {@link timetableDayAt}. */
  day: TimetableDay;
}

/** A row of the TV timetable. */
export interface TvTimetableRow extends TimetableRow {
  /**
   * Which of the row's two times the countdown on screen is heading for, or
   * null when it is heading for another row. The screen picks that time out,
   * so the eye can go from the countdown to the time it means.
   */
  target: PrayerEventKind | null;
  /** The time being counted down to; on a Jumu'ah row it tells the slots apart. */
  targetTime: TimeString | null;
}

/** The timetable as the TV renders it. */
export interface TvTimetable {
  day: TimetableDay;
  /** The date the rows are for. */
  date: DateString;
  /** The rows to show, in the order of the day. */
  rows: TvTimetableRow[];
  /** False when no row has a beginning time, so the column would be all dashes. */
  showBegins: boolean;
  /** False when no row has a congregation time. */
  showJamaat: boolean;
}

/**
 * Whether a timetable row says anything about its day: a missing row and a
 * row of blanks are the same thing to a screen.
 */
export function dayHasTimes(day: PrayerDay | null | undefined): day is PrayerDay {
  return (
    day !== null && day !== undefined && TIME_FIELDS.some((field) => isValidTimeString(day[field]))
  );
}

/**
 * The instant today's Isha is over for the hall: its congregation time (or,
 * for a timetable without one, the start of Isha) plus the minutes a
 * congregation counts as in progress. Null when today has no Isha time.
 */
function ishaOverAtMs(
  schedule: Pick<PrayerSchedule, "today" | "rows" | "timezone">,
  inProgressMinutes: number,
): number | null {
  const isha = schedule.rows.filter((row) => row.key === "isha")[0];
  if (isha === undefined) return null;
  let latest: number | null = null;
  for (const time of [isha.begins, isha.jamaat]) {
    if (time === null) continue;
    const atMs = zonedDateTimeToEpochMs(schedule.today, time, schedule.timezone);
    if (latest === null || atMs > latest) latest = atMs;
  }
  if (latest === null) return null;
  const minutes = Number.isFinite(inProgressMinutes) ? Math.max(0, inProgressMinutes) : 0;
  return latest + minutes * MS_PER_MINUTE;
}

/**
 * Decides whether the table shows today or tomorrow at one instant.
 *
 * It is tomorrow's exactly when all of these hold:
 * - today's Isha is over (see `ishaOverAtMs`) and no congregation is in progress;
 * - nothing else is left of today: the next event, if any, is tomorrow's
 *   (guards a timetable whose last time of the day is not Isha's);
 * - the timetable has times for tomorrow, since an empty table helps nobody.
 *
 * At midnight today's rows are the new day's, its Isha lies ahead, and the
 * answer is "today" again.
 */
export function timetableDayAt({
  nowMs,
  schedule,
  inProgressMinutes,
}: TimetableDayInput): TimetableDay {
  if (schedule.jamaatInProgress !== null) return "today";
  if (!dayHasTimes(schedule.tomorrowRow)) return "today";
  if (schedule.next !== null && schedule.next.date === schedule.today) return "today";
  const overAtMs = ishaOverAtMs(schedule, inProgressMinutes);
  return overAtMs !== null && nowMs >= overAtMs ? "tomorrow" : "today";
}

/**
 * The rows of tomorrow's table. None of them has happened; the first prayer
 * to begin (normally Fajr) is marked as next, so the row the countdown is
 * heading for stands out the same way it does during the day.
 */
function tomorrowRows(
  schedule: Pick<PrayerSchedule, "tomorrow" | "tomorrowRow" | "nextBegins">,
  settings: Pick<SiteSettings, "jumuah">,
): TimetableRow[] {
  const { nextBegins, tomorrow } = schedule;
  const nextKey = nextBegins !== null && nextBegins.date === tomorrow ? nextBegins.key : null;
  return prayerRowsForDay(schedule.tomorrowRow, settings, tomorrow).map((row) => ({
    ...row,
    status: row.key === nextKey ? "next" : "upcoming",
  }));
}

/**
 * Builds the table for the chosen day: tomorrow's rows when asked for and
 * known, otherwise today's. The sunrise row is left out when the settings
 * say so or the timetable has no sunrise, and a column that would hold
 * nothing but dashes is switched off.
 */
export function buildTvTimetable({
  timetable,
  schedule,
  settings,
  day,
}: TvTimetableInput): TvTimetable {
  const showTomorrow = day === "tomorrow" && schedule !== null;
  const date = showTomorrow ? schedule.tomorrow : timetable.date;
  const allRows = showTomorrow ? tomorrowRows(schedule, settings) : timetable.rows;
  const next = schedule === null ? null : schedule.next;
  const rows = allRows
    .filter((row) => row.key !== "sunrise" || (settings.tv.showSunrise && row.begins !== null))
    .map((row): TvTimetableRow => {
      const targeted = next !== null && next.date === date && next.key === row.key;
      return {
        ...row,
        target: targeted ? next.kind : null,
        targetTime: targeted ? next.time : null,
      };
    });
  const showBegins = rows.some((row) => row.begins !== null);
  const showJamaat = rows.some((row) => row.jamaat !== null);
  return {
    day: showTomorrow ? "tomorrow" : "today",
    date,
    rows,
    // A day without any time keeps both columns, so the table holds its shape.
    showBegins: showBegins || !showJamaat,
    showJamaat: showJamaat || !showBegins,
  };
}
