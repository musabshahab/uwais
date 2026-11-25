/**
 * Reading one time cell. Mosque spreadsheets write times in every way
 * imaginable: real Excel times, text with or without AM/PM, a dot instead of
 * a colon, Arabic digits. The hard part is the 12-hour clock without a
 * marker ("1:15" for the Dhuhr jamaat), which is resolved from the prayer the
 * column belongs to.
 */

import { MINUTES_PER_DAY, minutesToTime } from "@/lib/time/dates";
import type { TimeString } from "@/lib/types";
import { cellText, collapseSpaces, normaliseDigits, quote } from "./text";
import type { RawCell, TimeCellField } from "./types";

/**
 * How a time written without AM/PM was resolved.
 * `pm`: twelve hours were added (`1:15` became `13:15`).
 * `midnight`: an hour of 12 was read as the hour after midnight (`12:10` became `00:10`).
 */
export type TimeAdjustment = "pm" | "midnight";

/** A problem with one time cell. The message does not name the row or column; the caller adds that. */
export interface TimeCellIssue {
  /** `error`: the cell cannot be read. `warning`: it was read, by making an assumption. */
  severity: "error" | "warning";
  code: "time-invalid" | "midnight-assumed";
  message: string;
}

/** The outcome of reading one time cell. */
export interface TimeCellResult {
  /** The time, or null when the cell is empty, a ditto mark or unreadable. */
  time: TimeString | null;
  /** Set when a 12-hour value without AM/PM was moved to another half of the day. */
  adjustment: TimeAdjustment | null;
  /** True when the cell holds a ditto mark (`"`), meaning "same as the row above". */
  ditto: boolean;
  issue?: TimeCellIssue;
}

/** The part of the day a column's times fall in, which decides how `1:15` is read. */
type DayPart = "morning" | "midday" | "afternoon" | "night";

const DAY_PART: Readonly<Record<TimeCellField, DayPart>> = {
  fajrBegins: "morning",
  fajrJamaat: "morning",
  sunrise: "morning",
  dhuhrBegins: "midday",
  dhuhrJamaat: "midday",
  jumuah: "midday",
  asrBegins: "afternoon",
  asrJamaat: "afternoon",
  maghribBegins: "afternoon",
  maghribJamaat: "afternoon",
  ishaBegins: "night",
  ishaJamaat: "night",
};

/** Cell texts that mean "no time here". */
const EMPTY_MARKERS: ReadonlySet<string> = new Set([
  "",
  "-",
  "--",
  "---",
  "–",
  "—",
  "n/a",
  "na",
  "nil",
  "none",
  "null",
  "tbc",
  "tba",
]);

/** Cell texts that mean "same as the row above". */
const DITTO_MARKERS: ReadonlySet<string> = new Set(['"', "''", "”", "“", "〃", "″", ",,", "ditto", "do", "do.", "as above", "same", "same as above"]);

/** Characters people (and some fonts) use in place of a colon. */
const ODD_COLONS = /[：∶꞉˸٫]/g;

/** Excel serial numbers below this are not dates in living memory, so a number that large with a fraction is a date-time. */
const MIN_DATE_TIME_SERIAL = 10000;

const MINUTES_PER_HOUR = 60;
const LAST_MINUTE_OF_DAY = MINUTES_PER_DAY - 1;

const EMPTY: TimeCellResult = Object.freeze({ time: null, adjustment: null, ditto: false });

/** A clock reading before the 12-hour rules are applied. */
interface Reading {
  hour: number;
  minute: number;
  marker: "am" | "pm" | null;
}

/** Whether a cell's text means "no time" (blank, a dash, n/a). */
export function isEmptyTimeText(text: string): boolean {
  return EMPTY_MARKERS.has(collapseSpaces(text).toLowerCase());
}

/** Whether a cell's text is a ditto mark, meaning "same as the row above". */
export function isDittoText(text: string): boolean {
  return DITTO_MARKERS.has(collapseSpaces(text).toLowerCase());
}

/** Splits a trailing AM/PM marker (`pm`, `p.m.`, `P`, Arabic `م`) off a time text. */
function splitMarker(text: string): { body: string; marker: "am" | "pm" | null } {
  const latin = /^(.*?\d)\s*([ap])\.?\s?(?:m\.?)?$/.exec(text);
  if (latin) return { body: latin[1], marker: latin[2] === "a" ? "am" : "pm" };
  const arabic = /^(.*?\d)\s*([صم])$/.exec(text);
  if (arabic) return { body: arabic[1], marker: arabic[2] === "ص" ? "am" : "pm" };
  return { body: text, marker: null };
}

/** Rounds seconds into the minute and keeps the result inside the day. */
function roundToMinute(hour: number, minute: number, second: number): number {
  const total = hour * MINUTES_PER_HOUR + minute + (second >= 30 ? 1 : 0);
  return Math.min(total, LAST_MINUTE_OF_DAY);
}

/**
 * Reads the digits of a time text (marker already removed).
 * Returns the minutes since midnight as written, or null when it is not a time.
 */
function readClockDigits(body: string): { hour: number; minute: number; second: number } | null {
  const separated = /^(\d{1,2})\s*([:.,;h\s])\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,2})(?:[.,]\d+)?)?$/.exec(body);
  if (separated) {
    const decimalSeparator = separated[2] === "." || separated[2] === ",";
    // "5.3" is what a spreadsheet keeps of a typed "5.30".
    const minute = decimalSeparator && separated[3].length === 1 ? Number(separated[3]) * 10 : Number(separated[3]);
    return { hour: Number(separated[1]), minute, second: separated[4] ? Number(separated[4]) : 0 };
  }
  const compact = /^(\d{1,2})(\d{2})$/.exec(body);
  if (compact) return { hour: Number(compact[1]), minute: Number(compact[2]), second: 0 };
  const hourOnly = /^(\d{1,2})$/.exec(body);
  if (hourOnly) return { hour: Number(hourOnly[1]), minute: 0, second: 0 };
  return null;
}

/** Reads a time typed as text. Null when the text is not a time. */
function readText(text: string): Reading | null {
  const cleaned = collapseSpaces(normaliseDigits(text).replace(ODD_COLONS, ":")).toLowerCase();
  const { body, marker } = splitMarker(cleaned);
  const digits = readClockDigits(body.trim());
  if (!digits) return null;
  if (digits.hour > 23 || digits.minute > 59 || digits.second > 59) return null;
  const total = roundToMinute(digits.hour, digits.minute, digits.second);
  return { hour: Math.floor(total / MINUTES_PER_HOUR), minute: total % MINUTES_PER_HOUR, marker };
}

/** Turns a fraction of a day (Excel's native time) into a reading, rounded to the minute. */
function readDayFraction(fraction: number): Reading {
  const total = Math.min(Math.round(fraction * MINUTES_PER_DAY), LAST_MINUTE_OF_DAY);
  return { hour: Math.floor(total / MINUTES_PER_HOUR), minute: total % MINUTES_PER_HOUR, marker: null };
}

/**
 * Reads a time stored as a number: an Excel fraction of a day (0.2292), a
 * time typed with a dot (5.3 for 5:30, 17.45) or as bare digits (530, 1745).
 */
function readNumber(value: number): Reading | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1) return readDayFraction(value);
  if (value >= MIN_DATE_TIME_SERIAL) {
    return Number.isInteger(value) ? null : readDayFraction(value - Math.floor(value));
  }
  if (Number.isInteger(value)) {
    if (value < 24) return { hour: value, minute: 0, marker: null };
    // 24 to 99 is neither an hour nor digits typed without a colon.
    if (value < 100) return null;
    const hour = Math.floor(value / 100);
    const minute = value % 100;
    return hour < 24 && minute < MINUTES_PER_HOUR ? { hour, minute, marker: null } : null;
  }
  if (value >= 24) return null;
  const hour = Math.floor(value);
  const hundredths = (value - hour) * 100;
  const minute = Math.round(hundredths);
  // 5.305 is not a time typed with a dot; only whole "minutes" qualify.
  if (Math.abs(hundredths - minute) > 1e-6 || minute >= MINUTES_PER_HOUR) return null;
  return { hour, minute, marker: null };
}

/** Reads the clock of an Excel date/time cell, which exceljs delivers in UTC. */
function readDate(value: Date): Reading | null {
  const ms = value.getTime();
  if (Number.isNaN(ms)) return null;
  const seconds = value.getUTCSeconds() + value.getUTCMilliseconds() / 1000;
  const total = roundToMinute(value.getUTCHours(), value.getUTCMinutes(), seconds);
  return { hour: Math.floor(total / MINUTES_PER_HOUR), minute: total % MINUTES_PER_HOUR, marker: null };
}

/**
 * Applies the 12-hour rules to a value written without AM/PM.
 * Only called for hours 1 to 12; anything else is already unambiguous.
 */
function resolveUnmarkedHour(hour: number, part: DayPart): { hour: number; adjustment: TimeAdjustment | null } {
  switch (part) {
    case "morning":
      return hour === 12 ? { hour: 0, adjustment: "midnight" } : { hour, adjustment: null };
    case "midday":
      return hour <= 5 ? { hour: hour + 12, adjustment: "pm" } : { hour, adjustment: null };
    case "afternoon":
      return hour <= 11 ? { hour: hour + 12, adjustment: "pm" } : { hour, adjustment: null };
    case "night":
      if (hour === 12) return { hour: 0, adjustment: "midnight" };
      // 1 to 4 can only be the small hours of a far-northern summer night;
      // 13:00 to 16:59 is never Isha, so those are left as written.
      return hour >= 5 ? { hour: hour + 12, adjustment: "pm" } : { hour, adjustment: null };
  }
}

/** Resolves AM/PM (explicit or inferred from the column) into a 24-hour result. */
function finish(reading: Reading, field: TimeCellField, original: string): TimeCellResult {
  let hour = reading.hour;
  let adjustment: TimeAdjustment | null = null;
  if (reading.marker === "am") {
    if (hour === 12) hour = 0;
  } else if (reading.marker === "pm") {
    if (hour < 12) hour += 12;
  } else if (hour >= 1 && hour <= 12) {
    ({ hour, adjustment } = resolveUnmarkedHour(hour, DAY_PART[field]));
  }
  const time = minutesToTime(hour * MINUTES_PER_HOUR + reading.minute);
  const result: TimeCellResult = { time, adjustment, ditto: false };
  if (adjustment === "midnight" && DAY_PART[field] === "night") {
    result.issue = {
      severity: "warning",
      code: "midnight-assumed",
      message: `${quote(original)} has no AM or PM and was read as ${time}, just after midnight. Write it as ${time} if that is right.`,
    };
  }
  return result;
}

/**
 * Reads one time cell of the column `field`.
 *
 * Accepts Excel time cells (a `Date`, read in UTC and rounded to the minute),
 * Excel fractions of a day, numbers typed with a dot (`5.3`, `17.45`) and
 * text such as `5:30`, `05:30:00`, `5.30`, `0530`, `5:30 PM`, `5.30 p.m.`,
 * also with Arabic digits. Blank cells, `-` and `n/a` are an empty time.
 *
 * Times with an hour of 1 to 12 and no AM/PM marker are placed by the column
 * they are in: Fajr and sunrise are morning (12 means 00), Dhuhr and Jumu'ah
 * keep 11 and 12 and move 1-5 to the afternoon, Asr and Maghrib move 1-11 to
 * the afternoon, Isha moves 5-11 to the evening and reads 12 as 00 (with a
 * warning). Values with a marker or an hour of 0 or 13+ are never adjusted.
 *
 * @returns the time as `HH:mm`; an `issue` of severity `error` when the cell
 *          has content that is not a time.
 */
export function parseTimeCell(value: RawCell | undefined, field: TimeCellField): TimeCellResult {
  if (value === null || value === undefined) return EMPTY;
  if (typeof value === "string") {
    if (isEmptyTimeText(value)) return EMPTY;
    if (isDittoText(value)) return { time: null, adjustment: null, ditto: true };
  }
  const original = cellText(value);
  let reading: Reading | null;
  if (typeof value === "string") reading = readText(value);
  else if (typeof value === "number") reading = readNumber(value);
  else if (typeof value === "boolean") reading = null;
  else reading = readDate(value);

  if (!reading) {
    return {
      time: null,
      adjustment: null,
      ditto: false,
      issue: {
        severity: "error",
        code: "time-invalid",
        message: `${quote(original)} is not a time we can read. Write times like 05:30, 17:45 or 5:45 pm.`,
      },
    };
  }
  return finish(reading, field, original);
}
