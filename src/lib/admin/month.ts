/**
 * One month of the stored timetable as the admin editor shows it: a row for
 * every calendar day whether or not it is stored, the months worth jumping
 * to, and the export addresses.
 */

import {
  addMonths,
  firstDayOfMonth,
  isFriday,
  isValidDateString,
  isValidMonthString,
  lastDayOfMonth,
  listDates,
  monthOf,
  yearOf,
  type MonthString,
} from "@/lib/time";
import { TIME_FIELDS, type DateString, type PrayerDay, type TimetableCoverage } from "@/lib/types";
import { firstQueryValue, type QueryValue } from "./session";

/** Most months the "jump to" list offers: a little over four years. */
export const MAX_MONTH_CHOICES = 50;

/** The `?month=` parameter as a month, or null when it is absent or not a real `YYYY-MM`. */
export function readMonthParam(value: QueryValue): MonthString | null {
  const text = firstQueryValue(value)?.trim();
  return isValidMonthString(text) ? text : null;
}

/**
 * The `?edit=` parameter: the day whose form should be open when the page
 * arrives. Null unless it is a real date inside the month on show.
 */
export function readEditParam(value: QueryValue, month: MonthString): DateString | null {
  const text = firstQueryValue(value)?.trim();
  return isValidDateString(text) && monthOf(text) === month ? text : null;
}

/** The address of the editor for a month. */
export function timetableHref(month: MonthString): string {
  return `/admin/timetable?month=${month}`;
}

/** Whether a stored day carries at least one prayer time. */
export function hasAnyTime(day: PrayerDay): boolean {
  return TIME_FIELDS.some((field) => day[field] !== null);
}

/** One calendar day of the month being edited. */
export interface MonthRow {
  date: DateString;
  /** The stored day, or null when nothing is stored for the date. */
  day: PrayerDay | null;
  /** True when the date has no prayer times: not stored, or stored with a note only. */
  missing: boolean;
  friday: boolean;
  today: boolean;
}

/**
 * A row for every day of `month`, in order, with the stored day where there
 * is one. Stored days outside the month are ignored.
 */
export function monthRows(month: MonthString, days: readonly PrayerDay[], today: DateString): MonthRow[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return listDates(firstDayOfMonth(month), lastDayOfMonth(month)).map((date) => {
    const day = byDate.get(date) ?? null;
    return {
      date,
      day,
      missing: day === null || !hasAnyTime(day),
      friday: isFriday(date),
      today: date === today,
    };
  });
}

/**
 * Days changed on this screen that the rows from the server may not show
 * yet: the day as it was saved, or null once it has been deleted.
 */
export type LocalDayChanges = ReadonlyMap<DateString, PrayerDay | null>;

/** {@link LocalDayChanges} with one saved day added. */
export function withSavedDay(changes: LocalDayChanges, day: PrayerDay): LocalDayChanges {
  return new Map(changes).set(day.date, day);
}

/** {@link LocalDayChanges} with every date from `from` to `to` marked as deleted. */
export function withDeletedDays(changes: LocalDayChanges, from: DateString, to: DateString): LocalDayChanges {
  const next = new Map(changes);
  for (const date of listDates(from, to)) next.set(date, null);
  return next;
}

/**
 * The rows with the changes made on this screen laid over them, so the grid
 * shows a save the moment it has happened instead of a beat later, when the
 * refreshed rows arrive. Rows without a change are returned as they are.
 */
export function applyLocalChanges(rows: readonly MonthRow[], changes: LocalDayChanges): readonly MonthRow[] {
  if (changes.size === 0) return rows;
  return rows.map((row) => {
    const day = changes.get(row.date);
    if (day === undefined) return row;
    return { ...row, day, missing: day === null || !hasAnyTime(day) };
  });
}

/** How complete a month is. */
export interface MonthSummary {
  /** Days in the month. */
  total: number;
  /** Days without prayer times. */
  missing: number;
}

/** Counts the days of a month and how many of them have no prayer times. */
export function summariseMonth(rows: readonly MonthRow[]): MonthSummary {
  return { total: rows.length, missing: rows.filter((row) => row.missing).length };
}

/**
 * The months offered in the "jump to" list: every month the timetable
 * covers plus one either side (the natural place to add the next days),
 * and always the current month and the month on show. Ascending.
 */
export function monthChoices(
  coverage: TimetableCoverage,
  currentMonth: MonthString,
  viewedMonth: MonthString,
): MonthString[] {
  const months = new Set<MonthString>([currentMonth, viewedMonth]);
  if (coverage.firstDate !== null && coverage.lastDate !== null) {
    const end = addMonths(coverage.lastDate, 1);
    let month = addMonths(coverage.firstDate, -1);
    for (let count = 0; month <= end && count < MAX_MONTH_CHOICES; count++) {
      months.add(month);
      month = addMonths(month, 1);
    }
  }
  return Array.from(months).sort();
}

/** The formats the timetable can be downloaded in. */
export type ExportFormat = "csv" | "xlsx";

/** The address that downloads one month of the stored timetable. */
export function exportMonthHref(format: ExportFormat, month: MonthString): string {
  return `/api/timetable/export?format=${format}&month=${month}`;
}

/** The address that downloads one year of the stored timetable. */
export function exportYearHref(format: ExportFormat, year: number): string {
  return `/api/timetable/export?format=${format}&year=${year}`;
}

/**
 * The years the stored timetable touches, ascending: what the import screen
 * offers as "export the current timetable" starting points.
 */
export function coveredYears(coverage: TimetableCoverage): number[] {
  if (coverage.firstDate === null || coverage.lastDate === null) return [];
  const years: number[] = [];
  for (let year = yearOf(coverage.firstDate); year <= yearOf(coverage.lastDate); year++) years.push(year);
  return years;
}

/** The stored day for a date, or null. */
export function findDay(days: readonly PrayerDay[], date: DateString): PrayerDay | null {
  return days.find((day) => day.date === date) ?? null;
}
