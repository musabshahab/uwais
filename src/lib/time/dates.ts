/**
 * Calendar-date and time-of-day arithmetic on the timetable's string formats.
 *
 * Everything here is pure integer math on the proleptic Gregorian calendar.
 * No `Date` object is involved, so the results cannot depend on the timezone
 * of the server or the viewer and are correct across DST and leap years.
 */

import type { DateString, TimeString } from "@/lib/types";

/** A calendar month, `YYYY-MM` (e.g. `2026-11`). */
export type MonthString = string;

/** The numeric components of a calendar date. */
export interface DateParts {
  year: number;
  /** 1 = January .. 12 = December. */
  month: number;
  /** Day of the month, 1-based. */
  day: number;
}

/** Minutes in a civil day. */
export const MINUTES_PER_DAY = 1440;

/** Milliseconds in a second. */
export const MS_PER_SECOND = 1000;

/** Milliseconds in a minute. */
export const MS_PER_MINUTE = 60000;

/** Milliseconds in a 24-hour day. */
export const MS_PER_DAY = 86400000;

/**
 * Upper bound on the number of dates `listDates` will produce. Ranges often
 * come from URLs, so an absurd range must fail instead of allocating millions
 * of strings.
 */
export const MAX_LISTED_DATES = 3660;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MIN_YEAR = 1;
const MAX_YEAR = 9999;

/** Days from 0000-03-01 to 1970-01-01 in the proleptic Gregorian calendar. */
const EPOCH_SHIFT_DAYS = 719468;
const DAYS_PER_400_YEARS = 146097;

/** Left-pads a non-negative integer with zeros to `length` digits. */
function pad(value: number, length: number): string {
  let text = String(value);
  while (text.length < length) text = `0${text}`;
  return text;
}

/** Mathematical modulo: the result always has the sign of the divisor. */
function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Whether `year` is a leap year in the Gregorian calendar. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Number of days in a month.
 * @param year  Gregorian year.
 * @param month 1 = January .. 12 = December.
 * @throws RangeError when the month is not an integer from 1 to 12.
 */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${year}-${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Days between 1970-01-01 and the given civil date (negative before 1970).
 * The components are not validated; use `toEpochDay` for strings.
 */
export function civilToEpochDay(year: number, month: number, day: number): number {
  // The year is counted from March so the leap day is the last day of the
  // "year", which makes the day-of-year a simple linear formula.
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const monthFromMarch = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * monthFromMarch + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_400_YEARS + dayOfEra - EPOCH_SHIFT_DAYS;
}

/** Inverse of `civilToEpochDay`: the civil date for a day count since 1970-01-01. */
export function epochDayToCivil(epochDay: number): DateParts {
  const shifted = epochDay + EPOCH_SHIFT_DAYS;
  const era = Math.floor(shifted / DAYS_PER_400_YEARS);
  const dayOfEra = shifted - era * DAYS_PER_400_YEARS;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** Reads `YYYY-MM-DD` into numbers, or null when it is not a real calendar date. */
function readDate(value: unknown): DateParts | null {
  if (typeof value !== "string") return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Reads `YYYY-MM` (or the month of a full `YYYY-MM-DD`) into numbers, or null. */
function readMonth(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string") return null;
  const match = MONTH_PATTERN.exec(value);
  if (!match) return readDate(value);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < MIN_YEAR || month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Whether the value is a real calendar date written as `YYYY-MM-DD`
 * (years 0001 to 9999; 2026-02-30 and 2026-2-3 are rejected).
 */
export function isValidDateString(value: unknown): value is DateString {
  return readDate(value) !== null;
}

/** Whether the value is a calendar month written as `YYYY-MM`. */
export function isValidMonthString(value: unknown): value is MonthString {
  return typeof value === "string" && MONTH_PATTERN.test(value) && readMonth(value) !== null;
}

/** Whether the value is a 24-hour wall-clock time written as `HH:mm` (00:00 to 23:59). */
export function isValidTimeString(value: unknown): value is TimeString {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/**
 * Splits a `YYYY-MM-DD` date into numbers.
 * @throws RangeError when the string is not a valid date.
 */
export function parseDateParts(date: DateString): DateParts {
  const parts = readDate(date);
  if (!parts) throw new RangeError(`Invalid date: "${String(date)}"`);
  return parts;
}

/**
 * Builds a `YYYY-MM-DD` string from numbers.
 * @throws RangeError when the components do not form a real date in years 0001 to 9999.
 */
export function toDateString(year: number, month: number, day: number): DateString {
  const valid =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= MIN_YEAR &&
    year <= MAX_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month);
  if (!valid) throw new RangeError(`Invalid date: ${year}-${month}-${day}`);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Days between 1970-01-01 and the given date (negative before 1970).
 * @throws RangeError when the string is not a valid date.
 */
export function toEpochDay(date: DateString): number {
  const { year, month, day } = parseDateParts(date);
  return civilToEpochDay(year, month, day);
}

/**
 * The date that lies `epochDay` days after 1970-01-01.
 * @throws RangeError when the result falls outside years 0001 to 9999.
 */
export function fromEpochDay(epochDay: number): DateString {
  if (!Number.isInteger(epochDay)) throw new RangeError(`Invalid day number: ${epochDay}`);
  const { year, month, day } = epochDayToCivil(epochDay);
  return toDateString(year, month, day);
}

/**
 * Epoch milliseconds of 00:00 UTC on the given date. This is only a handle
 * for calendar formatting with `timeZone: "UTC"`; it is NOT midnight in the
 * mosque's timezone (use `zonedDateTimeToEpochMs` for that).
 */
export function dateToUtcMs(date: DateString): number {
  return toEpochDay(date) * MS_PER_DAY;
}

/**
 * Minutes since midnight for an `HH:mm` time (`"17:05"` gives 1025).
 * @throws RangeError when the string is not a valid time.
 */
export function parseTimeToMinutes(time: TimeString): number {
  const match = typeof time === "string" ? TIME_PATTERN.exec(time) : null;
  if (!match) throw new RangeError(`Invalid time: "${String(time)}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The `HH:mm` time for a number of minutes since midnight. Values outside one
 * day wrap around (1445 gives `00:05`, -5 gives `23:55`) so that adding an
 * offset to a time always yields a valid time; fractions are rounded down.
 * @throws RangeError when the value is not a finite number.
 */
export function minutesToTime(minutes: number): TimeString {
  if (!Number.isFinite(minutes)) throw new RangeError(`Invalid minutes: ${minutes}`);
  const wrapped = mod(Math.floor(minutes), MINUTES_PER_DAY);
  return `${pad(Math.floor(wrapped / 60), 2)}:${pad(wrapped % 60, 2)}`;
}

/**
 * Orders two `HH:mm` times: negative when `a` is earlier, positive when it is
 * later, zero when they are equal. Suitable as an `Array.prototype.sort` comparator.
 * @throws RangeError when either string is not a valid time.
 */
export function compareTimes(a: TimeString, b: TimeString): number {
  return parseTimeToMinutes(a) - parseTimeToMinutes(b);
}

/**
 * The date `days` days after `date` (before it when negative).
 * @throws RangeError for an invalid date, a non-integer offset or a result
 *         outside years 0001 to 9999.
 */
export function addDays(date: DateString, days: number): DateString {
  if (!Number.isInteger(days)) throw new RangeError(`Invalid day offset: ${days}`);
  return fromEpochDay(toEpochDay(date) + days);
}

/**
 * Whole days from `from` to `to`: positive when `to` is later
 * (`diffDays("2026-11-25", "2026-11-28")` is 3), negative when it is earlier.
 */
export function diffDays(from: DateString, to: DateString): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** Day of the week of a date: 0 = Sunday .. 6 = Saturday. */
export function weekdayOf(date: DateString): number {
  // 1970-01-01 was a Thursday (4).
  return mod(toEpochDay(date) + 4, 7);
}

/** Whether the date is a Friday, the day of Jumu'ah. */
export function isFriday(date: DateString): boolean {
  return weekdayOf(date) === 5;
}

/**
 * Every date from `from` to `to`, both inclusive, in ascending order. Returns
 * an empty list when `to` is before `from`.
 * @throws RangeError when the range holds more than `MAX_LISTED_DATES` days.
 */
export function listDates(from: DateString, to: DateString): DateString[] {
  const first = toEpochDay(from);
  const last = toEpochDay(to);
  const count = last - first + 1;
  if (count > MAX_LISTED_DATES) {
    throw new RangeError(`Date range too long: ${from} to ${to} (${count} days)`);
  }
  const dates: DateString[] = [];
  for (let epochDay = first; epochDay <= last; epochDay++) dates.push(fromEpochDay(epochDay));
  return dates;
}

/** The `YYYY-MM` month a date falls in. */
export function monthOf(date: DateString): MonthString {
  const { year, month } = parseDateParts(date);
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

/** The Gregorian year of a date, as a number. */
export function yearOf(date: DateString): number {
  return parseDateParts(date).year;
}

/**
 * Reads a `YYYY-MM` month, also accepting any date inside that month.
 * @throws RangeError when the string is neither.
 */
function parseMonth(month: MonthString | DateString): { year: number; month: number } {
  const parts = readMonth(month);
  if (!parts) throw new RangeError(`Invalid month: "${String(month)}"`);
  return parts;
}

/**
 * First day of a month.
 * @param month A `YYYY-MM` month, or any date inside the month.
 */
export function firstDayOfMonth(month: MonthString | DateString): DateString {
  const parts = parseMonth(month);
  return toDateString(parts.year, parts.month, 1);
}

/**
 * Last day of a month (28, 29, 30 or 31 as the calendar dictates).
 * @param month A `YYYY-MM` month, or any date inside the month.
 */
export function lastDayOfMonth(month: MonthString | DateString): DateString {
  const parts = parseMonth(month);
  return toDateString(parts.year, parts.month, daysInMonth(parts.year, parts.month));
}

/**
 * The month `count` months after the given one (before it when negative).
 * @param month A `YYYY-MM` month, or any date inside the month.
 * @throws RangeError for invalid input or a result outside years 0001 to 9999.
 */
export function addMonths(month: MonthString | DateString, count: number): MonthString {
  if (!Number.isInteger(count)) throw new RangeError(`Invalid month offset: ${count}`);
  const parts = parseMonth(month);
  const index = parts.year * 12 + (parts.month - 1) + count;
  const year = Math.floor(index / 12);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Month out of range: ${String(month)} + ${count}`);
  }
  return `${pad(year, 4)}-${pad(mod(index, 12) + 1, 2)}`;
}
