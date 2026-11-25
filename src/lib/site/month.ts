/**
 * Pure logic behind the monthly timetable page: which month a request asks
 * for, which months can be opened, what each row of the month shows, and the
 * Hijri months the page heading names.
 */

import {
  addMonths,
  firstDayOfMonth,
  formatWeekdayShort,
  hijriFromDate,
  isFriday,
  isValidMonthString,
  isValidTimeString,
  lastDayOfMonth,
  listDates,
  monthOf,
  parseDateParts,
  prayerRowsForDay,
  type DayPrayerRow,
  type MonthString,
} from "@/lib/time";
import {
  TIME_FIELDS,
  type DateString,
  type JumuahSlot,
  type PrayerDay,
  type SiteSettings,
  type TimeString,
  type TimetableCoverage,
} from "@/lib/types";

/** An inclusive run of calendar months. */
export interface MonthRange {
  first: MonthString;
  last: MonthString;
}

/** The longest list of months offered in the month picker. */
export const MAX_LISTED_MONTHS = 240;

/** File formats of `GET /api/timetable/export`. */
export type DownloadFormat = "csv" | "xlsx";

/** The period a download covers: one month or one calendar year. */
export type DownloadPeriod = { month: MonthString } | { year: number };

/** A month as a single number, so that months can be compared and counted. */
function monthIndex(month: MonthString): number {
  const { year, month: monthOfYear } = parseDateParts(firstDayOfMonth(month));
  return year * 12 + (monthOfYear - 1);
}

/**
 * The month `count` months away, or null when that would leave the calendar
 * the app supports (years 0001 to 9999).
 */
export function shiftMonth(month: MonthString, count: number): MonthString | null {
  try {
    return addMonths(month, count);
  } catch {
    return null;
  }
}

/**
 * Reads the `month` query parameter. Anything but one well-formed `YYYY-MM`
 * value (missing, repeated, mistyped) gives null.
 */
export function readMonthParam(value: string | string[] | undefined): MonthString | null {
  return typeof value === "string" && isValidMonthString(value) ? value : null;
}

/**
 * The months a visitor may open: everything the timetable covers plus one
 * month either side (so the edge of the timetable is visible as such), and
 * always the current month, even when the timetable has run out or has not
 * started. The range is continuous, so months between the timetable and
 * today can be stepped through as well.
 */
export function navigableMonths(coverage: TimetableCoverage, currentMonth: MonthString): MonthRange {
  if (coverage.firstDate === null || coverage.lastDate === null) {
    return { first: currentMonth, last: currentMonth };
  }
  const firstCovered = monthOf(coverage.firstDate);
  const lastCovered = monthOf(coverage.lastDate);
  const first = shiftMonth(firstCovered, -1) ?? firstCovered;
  const last = shiftMonth(lastCovered, 1) ?? lastCovered;
  return {
    first: first < currentMonth ? first : currentMonth,
    last: last > currentMonth ? last : currentMonth,
  };
}

/** Whether a month lies inside a range. */
export function isMonthInRange(month: MonthString, range: MonthRange): boolean {
  return month >= range.first && month <= range.last;
}

/**
 * The month to show for a request: the one asked for when it is a real month
 * inside the navigable range, otherwise the current month.
 */
export function resolveMonth(
  requested: MonthString | null,
  range: MonthRange,
  currentMonth: MonthString,
): MonthString {
  return requested !== null && isMonthInRange(requested, range) ? requested : currentMonth;
}

/** The months before and after `month` that can be opened; null at either end of the range. */
export function adjacentMonths(
  month: MonthString,
  range: MonthRange,
): { previous: MonthString | null; next: MonthString | null } {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return {
    previous: previous !== null && isMonthInRange(previous, range) ? previous : null,
    next: next !== null && isMonthInRange(next, range) ? next : null,
  };
}

/**
 * Every month of a range in order, for the month picker. A range longer than
 * `limit` months (only possible with a stray date decades away) is cut down
 * to the `limit` months around `around`, so the picker stays usable.
 */
export function listMonths(
  range: MonthRange,
  around: MonthString,
  limit: number = MAX_LISTED_MONTHS,
): MonthString[] {
  const firstIndex = monthIndex(range.first);
  const lastIndex = monthIndex(range.last);
  const total = lastIndex - firstIndex + 1;
  if (total <= 0) return [];
  let start = 0;
  let count = total;
  if (total > limit) {
    count = limit;
    const centred = monthIndex(around) - firstIndex - Math.floor(limit / 2);
    start = Math.min(Math.max(centred, 0), total - limit);
  }
  const months: MonthString[] = [];
  for (let offset = start; offset < start + count; offset += 1) {
    const month = shiftMonth(range.first, offset);
    if (month !== null) months.push(month);
  }
  return months;
}

/** Address of the timetable page for a month. */
export function timetableHref(month: MonthString): string {
  return `/timetable?month=${month}`;
}

/** Address of the timetable download for a month or a year in one format. */
export function downloadHref(period: DownloadPeriod, format: DownloadFormat): string {
  const query = "month" in period ? `month=${period.month}` : `year=${String(period.year).padStart(4, "0")}`;
  return `/api/timetable/export?${query}&format=${format}`;
}

/**
 * Whether the timetable's extent touches a calendar year. Used to decide
 * whether a download of that year is worth offering.
 */
export function coverageTouchesYear(coverage: TimetableCoverage, year: number): boolean {
  if (coverage.firstDate === null || coverage.lastDate === null) return false;
  const prefix = String(year).padStart(4, "0");
  return coverage.firstDate <= `${prefix}-12-31` && coverage.lastDate >= `${prefix}-01-01`;
}

/** A Hijri month in a given year. */
export interface HijriMonthSpan {
  /** 1 = Muharram .. 12 = Dhu al-Hijjah. */
  month: number;
  year: number;
  /** English transliteration of the month. */
  monthName: string;
}

/**
 * The Hijri months a calendar month touches, in order. Usually two; one when
 * the months happen to coincide, and three when a 29-day Hijri month falls
 * wholly inside a longer calendar month.
 * @param adjustmentDays The mosque's moon-sighting adjustment (`hijriAdjustment`).
 */
export function hijriMonthsSpanned(month: MonthString, adjustmentDays: number = 0): HijriMonthSpan[] {
  const spans: HijriMonthSpan[] = [];
  for (const date of listDates(firstDayOfMonth(month), lastDayOfMonth(month))) {
    const hijri = hijriFromDate(date, adjustmentDays);
    const last = spans[spans.length - 1];
    if (last === undefined || last.month !== hijri.month || last.year !== hijri.year) {
      spans.push({ month: hijri.month, year: hijri.year, monthName: hijri.monthName });
    }
  }
  return spans;
}

/**
 * Names Hijri months in a heading: `Jumada al-Awwal and Jumada al-Thani 1448 AH`,
 * or `Dhu al-Hijjah 1448 and Muharram 1449 AH` across a new year. A year is
 * written once, after the last month that belongs to it.
 */
export function formatHijriMonths(spans: readonly HijriMonthSpan[]): string {
  if (spans.length === 0) return "";
  const names = spans.map((span, index) => {
    const next = spans[index + 1];
    return next !== undefined && next.year === span.year ? span.monthName : `${span.monthName} ${span.year}`;
  });
  const last = names[names.length - 1];
  const list = names.length === 1 ? last : `${names.slice(0, -1).join(", ")} and ${last}`;
  return `${list} AH`;
}

/** The begins and jamaat times of one prayer on one day of the month table. */
export interface MonthPrayerCell {
  begins: TimeString | null;
  jamaat: TimeString | null;
}

/** One row of the month table. */
export interface MonthDayRow {
  date: DateString;
  /** `Mon`, `Tue`, ... */
  weekday: string;
  /** Day of the month, 1 to 31. */
  dayOfMonth: number;
  isFriday: boolean;
  isToday: boolean;
  /**
   * False when the timetable says nothing about the day: no row, or a row
   * without a single time. Such a day is shown as an explicit gap.
   */
  hasTimes: boolean;
  fajr: MonthPrayerCell;
  sunrise: TimeString | null;
  dhuhr: MonthPrayerCell;
  asr: MonthPrayerCell;
  maghrib: MonthPrayerCell;
  isha: MonthPrayerCell;
  /** The day's Jumu'ah times, earliest first; empty unless it is a Friday with times. */
  jumuah: JumuahSlot[];
  /** The day's note, e.g. `Clocks go back`; null when there is none. */
  note: string | null;
}

const EMPTY_CELL: MonthPrayerCell = { begins: null, jamaat: null };

function cellOf(rows: readonly DayPrayerRow[], key: DayPrayerRow["key"]): MonthPrayerCell {
  const row = rows.find((candidate) => candidate.key === key);
  return row === undefined ? EMPTY_CELL : { begins: row.begins, jamaat: row.jamaat };
}

/**
 * The rows of the month table: one per calendar day, whether or not the
 * timetable has it, so that gaps are visible instead of silently skipped.
 * On a Friday the Dhuhr congregation is the first Jumu'ah and `jumuah` lists
 * them all (the day's own times, else the defaults from the settings).
 * @param days  The stored rows of the month, in any order.
 * @param today The mosque's current date, for marking today's row.
 */
export function monthRows(
  month: MonthString,
  days: readonly PrayerDay[],
  settings: Pick<SiteSettings, "jumuah">,
  today: DateString,
): MonthDayRow[] {
  const byDate = new Map<DateString, PrayerDay>();
  for (const day of days) byDate.set(day.date, day);

  return listDates(firstDayOfMonth(month), lastDayOfMonth(month)).map((date) => {
    const day = byDate.get(date) ?? null;
    const hasTimes = day !== null && TIME_FIELDS.some((field) => isValidTimeString(day[field]));
    const rows = hasTimes ? prayerRowsForDay(day, settings, date) : [];
    const dhuhr = rows.find((row) => row.key === "dhuhr");
    const note = day !== null && day.note !== null && day.note.trim() !== "" ? day.note.trim() : null;
    return {
      date,
      weekday: formatWeekdayShort(date),
      dayOfMonth: parseDateParts(date).day,
      isFriday: isFriday(date),
      isToday: date === today,
      hasTimes,
      fajr: cellOf(rows, "fajr"),
      sunrise: cellOf(rows, "sunrise").begins,
      dhuhr: cellOf(rows, "dhuhr"),
      asr: cellOf(rows, "asr"),
      maghrib: cellOf(rows, "maghrib"),
      isha: cellOf(rows, "isha"),
      jumuah: dhuhr !== undefined && dhuhr.isJumuah ? dhuhr.jumuahTimes : [],
      note,
    };
  });
}
