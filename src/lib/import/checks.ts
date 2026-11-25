/**
 * Plausibility checks on the days read from a file. None of these stop an
 * import; they point at the mistakes that are easy to make in a spreadsheet:
 * a time typed into the wrong row, a missing PM, a skipped day.
 */

import { MINUTES_PER_DAY, diffDays, addDays, parseTimeToMinutes } from "@/lib/time/dates";
import { PRAYERS, type DateString, type PrayerDay, type TimeField, type TimeString } from "@/lib/types";
import { FIELD_LABELS } from "./types";

/** Something suspicious about one day. The message does not name the row; the caller adds that. */
export interface DayFinding {
  code: "times-out-of-order" | "jamaat-before-begins";
  /** The column the finding is about. */
  field: TimeField;
  message: string;
}

/** A begin time that moved implausibly far from one day to the next. */
export interface TimeJump {
  /** The later of the two days. */
  date: DateString;
  field: TimeField;
  previous: TimeString;
  current: TimeString;
  /**
   * Minutes by which the day's other times moved together: 60 or -60 when the
   * clocks changed, otherwise 0. Not zero means this time failed to move with them.
   */
  shift: number;
}

/** The dates a timetable skips between its first and last day. */
export interface MissingDates {
  /** The skipped dates in order, at most `limit` of them. */
  dates: DateString[];
  /** How many dates are skipped in total. */
  total: number;
  /** The skipped dates as inclusive ranges, at most `limit` of them. */
  ranges: { from: DateString; to: DateString }[];
}

/** The times that must follow one another through the day. */
const DAY_ORDER: readonly TimeField[] = ["fajrBegins", "sunrise", "dhuhrBegins", "asrBegins", "maghribBegins", "ishaBegins"];

/**
 * Begin times drift by a few minutes a day; more than this from one day to
 * the next means a typing slip (or a change of calculation method).
 */
export const MAX_DAILY_DRIFT_MINUTES = 20;

/** When the clocks change every time moves by about an hour; this much either side still counts. */
const CLOCK_CHANGE_MINUTES = 60;

/** Isha times before this hour belong to the night that started the evening before. */
const SMALL_HOURS_END_MINUTES = 4 * 60;

/**
 * Minutes since midnight for comparing times within a day. An Isha time in
 * the small hours (far-northern summers) counts as after midnight of the
 * same night, so it still follows Maghrib.
 */
function minutesOf(field: TimeField, time: TimeString): number {
  const minutes = parseTimeToMinutes(time);
  const isIsha = field === "ishaBegins" || field === "ishaJamaat";
  return isIsha && minutes < SMALL_HOURS_END_MINUTES ? minutes + MINUTES_PER_DAY : minutes;
}

/**
 * Checks one day: its begin times and sunrise must run in order
 * (Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha) and no jamaat may be earlier
 * than its prayer begins. Missing times are skipped. At most one ordering
 * finding is returned per day, for the first time that is out of place.
 */
export function checkDay(day: PrayerDay): DayFinding[] {
  const findings: DayFinding[] = [];
  let previous: TimeField | null = null;
  for (const field of DAY_ORDER) {
    const time = day[field];
    if (time === null) continue;
    const before = previous === null ? null : day[previous];
    if (previous !== null && before !== null && minutesOf(field, time) <= minutesOf(previous, before)) {
      findings.push({
        code: "times-out-of-order",
        field,
        message: `${FIELD_LABELS[field]} (${time}) is not later than ${FIELD_LABELS[previous]} (${before}). Check for a time in the wrong column or a missing AM/PM.`,
      });
      break;
    }
    previous = field;
  }
  for (const prayer of PRAYERS) {
    const begins = day[prayer.beginsField];
    const jamaat = day[prayer.jamaatField];
    if (begins === null || jamaat === null) continue;
    if (minutesOf(prayer.jamaatField, jamaat) < minutesOf(prayer.beginsField, begins)) {
      findings.push({
        code: "jamaat-before-begins",
        field: prayer.jamaatField,
        message: `${FIELD_LABELS[prayer.jamaatField]} (${jamaat}) is earlier than ${FIELD_LABELS[prayer.beginsField]} (${begins}).`,
      });
    }
  }
  return findings;
}

/**
 * The shift shared by most times between two days: about an hour forwards or
 * backwards when the clocks changed, otherwise zero. At least two times must
 * agree, so a single wrong value is never mistaken for a clock change.
 */
function sharedShift(deltas: readonly number[]): number {
  const near = (delta: number, target: number) => Math.abs(delta - target) <= MAX_DAILY_DRIFT_MINUTES;
  for (const shift of [CLOCK_CHANGE_MINUTES, -CLOCK_CHANGE_MINUTES]) {
    const agreeing = deltas.filter((delta) => near(delta, shift)).length;
    if (agreeing >= 2 && agreeing * 2 > deltas.length) return shift;
  }
  return 0;
}

/**
 * Finds begin times (and sunrises) that differ by more than
 * `MAX_DAILY_DRIFT_MINUTES` from the previous calendar day. Days are only
 * compared with the day directly before them, and the hour by which every
 * time moves when the clocks change is allowed for. A single wrong value is
 * reported once, not again when the next day returns to normal.
 *
 * @param days Sorted by date, one entry per date.
 */
export function findTimeJumps(days: readonly PrayerDay[]): TimeJump[] {
  const jumps: TimeJump[] = [];
  let flaggedYesterday = new Set<TimeField>();
  for (let index = 1; index < days.length; index++) {
    const previous = days[index - 1];
    const current = days[index];
    const flagged = new Set<TimeField>();
    if (addDays(previous.date, 1) === current.date) {
      const compared = DAY_ORDER.filter((field) => previous[field] !== null && current[field] !== null);
      const delta = (field: TimeField, from: PrayerDay) => minutesOf(field, current[field] as TimeString) - minutesOf(field, from[field] as TimeString);
      const shift = sharedShift(compared.map((field) => delta(field, previous)));
      const dayBefore = index >= 2 && addDays(days[index - 2].date, 1) === previous.date ? days[index - 2] : null;
      for (const field of compared) {
        if (Math.abs(delta(field, previous) - shift) <= MAX_DAILY_DRIFT_MINUTES) continue;
        const backToNormal =
          flaggedYesterday.has(field) &&
          dayBefore !== null &&
          dayBefore[field] !== null &&
          Math.abs(delta(field, dayBefore) - shift) <= 2 * MAX_DAILY_DRIFT_MINUTES;
        if (backToNormal) continue;
        flagged.add(field);
        jumps.push({ date: current.date, field, previous: previous[field] as TimeString, current: current[field] as TimeString, shift });
      }
    }
    flaggedYesterday = flagged;
  }
  return jumps;
}

/**
 * Lists the dates missing from a run of dates.
 *
 * @param dates Sorted ascending, without repeats.
 * @param limit Most dates (and most ranges) to list; `total` always counts all.
 */
export function findMissingDates(dates: readonly DateString[], limit: number): MissingDates {
  const missing: MissingDates = { dates: [], total: 0, ranges: [] };
  for (let index = 1; index < dates.length; index++) {
    const gap = diffDays(dates[index - 1], dates[index]) - 1;
    if (gap <= 0) continue;
    missing.total += gap;
    const from = addDays(dates[index - 1], 1);
    if (missing.ranges.length < limit) missing.ranges.push({ from, to: addDays(dates[index], -1) });
    for (let offset = 0; offset < gap && missing.dates.length < limit; offset++) missing.dates.push(addDays(from, offset));
  }
  return missing;
}
