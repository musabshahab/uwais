/**
 * Display formatting for times, dates and countdowns.
 *
 * Pages are rendered on the server and hydrated in browsers as old as the
 * Chromium in TV boxes, and the two must produce byte-identical text. ICU
 * versions disagree on details of English dates ("Sep" or "Sept", a comma
 * after the weekday or not), so the default locale is rendered from the
 * built-in tables below. Only other locales are delegated to `Intl`.
 */

import type { DateString, TimeFormat, TimeString } from "@/lib/types";
import {
  type MonthString,
  dateToUtcMs,
  firstDayOfMonth,
  isValidTimeString,
  parseDateParts,
  parseTimeToMinutes,
  weekdayOf,
} from "./dates";

/** A time split into its digits and its AM/PM marker so screens can style them apart. */
export interface FormattedTime {
  /** `5:05` in 12-hour format, `17:05` in 24-hour format. */
  text: string;
  /** `AM` or `PM` in 12-hour format, null in 24-hour format. */
  period: "AM" | "PM" | null;
}

/** A duration broken down for a countdown display. */
export interface CountdownParts {
  /** Whole hours; not capped at 23. */
  hours: number;
  /** 0 to 59. */
  minutes: number;
  /** 0 to 59. */
  seconds: number;
  /** True when the input was below zero, that is the moment has already passed. */
  negative: boolean;
}

/** Shown in place of a time the timetable does not have. */
export const TIME_PLACEHOLDER = "--:--";

/** Locale rendered from the built-in tables; see the note at the top of this file. */
export const DEFAULT_LOCALE = "en-GB";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Length of the abbreviated English weekday and month names ("Wed", "Nov"). */
const SHORT_NAME_LENGTH = 3;

const INTL_STYLES = {
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  medium: { weekday: "short", day: "numeric", month: "short" },
  monthYear: { month: "long", year: "numeric" },
  weekdayShort: { weekday: "short" },
  weekdayLong: { weekday: "long" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

type IntlStyle = keyof typeof INTL_STYLES;

const INTL_CACHE_LIMIT = 32;
const intlFormatters = new Map<string, Intl.DateTimeFormat>();

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Formats a date through `Intl` for a non-default locale, or returns null
 * when the runtime rejects the locale so the caller can fall back to English.
 */
function formatWithIntl(utcMs: number, locale: string, style: IntlStyle): string | null {
  const key = `${locale}|${style}`;
  let formatter = intlFormatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale, {
        ...INTL_STYLES[style],
        // The date is carried as UTC midnight, and some locales (ar-SA)
        // would otherwise switch to a non-Gregorian calendar.
        timeZone: "UTC",
        calendar: "gregory",
      });
    } catch {
      return null;
    }
    if (intlFormatters.size >= INTL_CACHE_LIMIT) intlFormatters.clear();
    intlFormatters.set(key, formatter);
  }
  return formatter.format(new Date(utcMs));
}

/**
 * Formats a wall-clock time for display.
 * `formatTime("17:05", "12h")` is `{ text: "5:05", period: "PM" }` and
 * `formatTime("17:05", "24h")` is `{ text: "17:05", period: null }`.
 * @throws RangeError when `time` is not a valid `HH:mm` string; use
 *         `formatTimeOrPlaceholder` for values that may be missing.
 */
export function formatTime(time: TimeString, timeFormat: TimeFormat): FormattedTime {
  const minutes = parseTimeToMinutes(time);
  if (timeFormat === "24h") return { text: time, period: null };
  const hour = Math.floor(minutes / 60);
  return {
    text: `${hour % 12 === 0 ? 12 : hour % 12}:${pad2(minutes % 60)}`,
    period: hour < 12 ? "AM" : "PM",
  };
}

/**
 * Formats a wall-clock time as one string: `5:05 PM` in 12-hour format,
 * `17:05` in 24-hour format.
 * @throws RangeError when `time` is not a valid `HH:mm` string.
 */
export function formatTimeText(time: TimeString, timeFormat: TimeFormat): string {
  const formatted = formatTime(time, timeFormat);
  return formatted.period === null ? formatted.text : `${formatted.text} ${formatted.period}`;
}

/**
 * Like `formatTime`, for timetable cells that may be empty: a null, undefined
 * or malformed time yields `{ text: placeholder, period: null }` instead of
 * throwing.
 */
export function formatTimeOrPlaceholder(
  time: TimeString | null | undefined,
  timeFormat: TimeFormat,
  placeholder: string = TIME_PLACEHOLDER,
): FormattedTime {
  return isValidTimeString(time)
    ? formatTime(time, timeFormat)
    : { text: placeholder, period: null };
}

/**
 * Like `formatTimeText`, for timetable cells that may be empty: a null,
 * undefined or malformed time yields the placeholder.
 */
export function formatTimeTextOrPlaceholder(
  time: TimeString | null | undefined,
  timeFormat: TimeFormat,
  placeholder: string = TIME_PLACEHOLDER,
): string {
  return isValidTimeString(time) ? formatTimeText(time, timeFormat) : placeholder;
}

/**
 * Full weekday name of a date, e.g. `Wednesday`.
 * @throws RangeError when `date` is not a valid date.
 */
export function formatWeekdayLong(date: DateString, locale: string = DEFAULT_LOCALE): string {
  const english = WEEKDAY_NAMES[weekdayOf(date)];
  if (locale === DEFAULT_LOCALE) return english;
  return formatWithIntl(dateToUtcMs(date), locale, "weekdayLong") ?? english;
}

/**
 * Abbreviated weekday name of a date, e.g. `Wed`.
 * @throws RangeError when `date` is not a valid date.
 */
export function formatWeekdayShort(date: DateString, locale: string = DEFAULT_LOCALE): string {
  const english = WEEKDAY_NAMES[weekdayOf(date)].slice(0, SHORT_NAME_LENGTH);
  if (locale === DEFAULT_LOCALE) return english;
  return formatWithIntl(dateToUtcMs(date), locale, "weekdayShort") ?? english;
}

/**
 * Full date with weekday, e.g. `Wednesday 25 November 2026`.
 * @throws RangeError when `date` is not a valid date.
 */
export function formatDateLong(date: DateString, locale: string = DEFAULT_LOCALE): string {
  const { year, month, day } = parseDateParts(date);
  const english = `${WEEKDAY_NAMES[weekdayOf(date)]} ${day} ${MONTH_NAMES[month - 1]} ${year}`;
  if (locale === DEFAULT_LOCALE) return english;
  return formatWithIntl(dateToUtcMs(date), locale, "long") ?? english;
}

/**
 * Compact date without the year, e.g. `Wed 25 Nov`.
 * @throws RangeError when `date` is not a valid date.
 */
export function formatDateMedium(date: DateString, locale: string = DEFAULT_LOCALE): string {
  const { month, day } = parseDateParts(date);
  const weekday = WEEKDAY_NAMES[weekdayOf(date)].slice(0, SHORT_NAME_LENGTH);
  const english = `${weekday} ${day} ${MONTH_NAMES[month - 1].slice(0, SHORT_NAME_LENGTH)}`;
  if (locale === DEFAULT_LOCALE) return english;
  return formatWithIntl(dateToUtcMs(date), locale, "medium") ?? english;
}

/**
 * Month heading, e.g. `November 2026`.
 * @param month A `YYYY-MM` month, or any date inside the month.
 * @throws RangeError when `month` is neither.
 */
export function formatMonthYear(
  month: MonthString | DateString,
  locale: string = DEFAULT_LOCALE,
): string {
  const firstDay = firstDayOfMonth(month);
  const parts = parseDateParts(firstDay);
  const english = `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
  if (locale === DEFAULT_LOCALE) return english;
  return formatWithIntl(dateToUtcMs(firstDay), locale, "monthYear") ?? english;
}

/**
 * Splits a number of seconds into hours, minutes and seconds. Fractions of a
 * second are dropped and a negative input is reported through `negative`
 * with the parts describing its magnitude. A non-finite input counts as zero.
 */
export function formatCountdown(totalSeconds: number): CountdownParts {
  const magnitude = Number.isFinite(totalSeconds) ? Math.floor(Math.abs(totalSeconds)) : 0;
  return {
    hours: Math.floor(magnitude / 3600),
    minutes: Math.floor((magnitude % 3600) / 60),
    seconds: magnitude % 60,
    negative: totalSeconds < 0 && magnitude > 0,
  };
}

/**
 * Countdown as a ticking clock: `H:MM:SS` from one hour up (`1:05:09`),
 * `MM:SS` below (`04:09`). A countdown never runs below zero: a moment that
 * has passed shows `00:00`.
 */
export function formatCountdownClock(totalSeconds: number): string {
  const { hours, minutes, seconds } = formatCountdown(Math.max(0, totalSeconds));
  const tail = `${pad2(minutes)}:${pad2(seconds)}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}

/**
 * Countdown in words, rounded down to the minute: `1 hr 5 min`, `2 hr`,
 * `12 min`, and `less than a minute` for anything under 60 seconds
 * (including a moment that has already passed), so the result always reads
 * correctly after the word "in".
 */
export function formatCountdownWords(totalSeconds: number): string {
  const { hours, minutes } = formatCountdown(Math.max(0, totalSeconds));
  if (hours === 0 && minutes === 0) return "less than a minute";
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}
