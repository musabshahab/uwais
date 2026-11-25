/**
 * Reading one date cell, and working out whether a column of numeric dates
 * is written day-first or month-first.
 *
 * Nothing in here touches the server's timezone: Excel dates arrive as UTC
 * midnights and are read through their UTC day number; everything else is
 * parsed from text into plain year, month and day numbers.
 */

import { MS_PER_DAY, civilToEpochDay, daysInMonth, epochDayToCivil, toDateString } from "@/lib/time/dates";
import type { DateString } from "@/lib/types";
import { collapseSpaces, normaliseDigits } from "./text";
import type { DateOrder, RawCell } from "./types";

/** What a date cell turned out to contain. */
export type DateCellParts =
  | { kind: "empty" }
  /** A complete date. */
  | { kind: "full"; year: number; month: number; day: number }
  /** A day and month without a year (`1 Jan`, `31/01`). */
  | { kind: "month-day"; month: number; day: number }
  /** Only a day of the month (`14`, `Fri 14`, `14th`). */
  | { kind: "day"; day: number }
  /** Only a month, as in a title row (`March`, `March 2027`). */
  | { kind: "month"; month: number; year: number | null }
  /** Content that is not a date, including impossible dates such as 31/02. */
  | { kind: "invalid" };

/** How to read a cell's date parts. */
export interface DatePartsOptions {
  /** Order of numeric dates; day-first when omitted. */
  dateOrder?: DateOrder;
  /** True when bare serial numbers count from 1904 (see `RawWorkbook.date1904`). */
  date1904?: boolean;
}

/** What `parseDateCell` knows about the cell's surroundings. */
export interface DateCellContext {
  /** Order of numeric dates such as 01/02/2027. */
  dateOrder: DateOrder;
  /** Year for dates written without one. */
  year?: number;
  /** Month (1-12) for cells that only hold a day of the month. */
  month?: number;
  /** True when bare serial numbers count from 1904. */
  date1904?: boolean;
}

/** The outcome of `detectDateOrder`. */
export interface DateOrderDetection {
  order: DateOrder;
  /**
   * How the order was decided.
   * `evidence`: only this order makes every value a real date.
   * `sequence`: only this order makes the rows run through consecutive days.
   * `default`: the values fit several orders equally well; the fallback was used.
   * `none`: no value depends on the order.
   */
  basis: "evidence" | "sequence" | "default" | "none";
}

/** Years outside this range are typing mistakes or Excel artefacts, not timetable dates. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2199;

/** Bare numbers are only read as Excel serial dates when they land in this range of years. */
const MIN_SERIAL_YEAR = 1990;
const MAX_SERIAL_YEAR = 2100;

/** Days between Excel's day zero (1899-12-30) and 1970-01-01. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
/** Days by which the 1904 date system lags the 1900 one. */
const EXCEL_1904_SHIFT_DAYS = 1462;
/** Excel times carry floating-point noise; half a minute of slack keeps 23:59:59.999 on the right day. */
const HALF_MINUTE_MS = 30000;
const HALF_MINUTE_DAYS = 0.5 / 1440;

/** A leap year, used to validate and order dates that have no year of their own. */
const REFERENCE_LEAP_YEAR = 2000;

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAY_NAMES: ReadonlySet<string> = new Set([
  "mon",
  "monday",
  "tue",
  "tues",
  "tuesday",
  "wed",
  "weds",
  "wednesday",
  "thu",
  "thur",
  "thurs",
  "thursday",
  "fri",
  "friday",
  "sat",
  "saturday",
  "sun",
  "sunday",
]);

/** Words that may accompany a date without changing it (`1st of March`, `the 3rd`). */
const FILLER_WORDS: ReadonlySet<string> = new Set(["of", "the"]);

const INVALID: DateCellParts = { kind: "invalid" };
const EMPTY: DateCellParts = { kind: "empty" };

/** The month (1-12) a word names, or null. Accepts full names and the usual abbreviations. */
export function parseMonthName(word: string): number | null {
  return MONTH_NAMES[word.trim().toLowerCase().replace(/\.$/, "")] ?? null;
}

/** Whether a word is a weekday name or abbreviation (`Fri`, `Thurs`, `Sunday`). */
export function isWeekdayName(word: string): boolean {
  return WEEKDAY_NAMES.has(word.trim().toLowerCase().replace(/\.$/, ""));
}

/** A clock time after a date, as Excel and databases add when they export a date as text. */
const TRAILING_CLOCK = /[t\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(z|[ap]\.?m\.?)?$/;

/**
 * Lower-cases a date text, unifies digits and spaces, drops a trailing clock
 * time and separates glued parts (`1Sun`, `14th`).
 */
function cleanDateText(text: string): string {
  return collapseSpaces(
    collapseSpaces(normaliseDigits(text).toLowerCase())
      .replace(TRAILING_CLOCK, "")
      .replace(/['’‘`]/g, " ")
      .replace(/(\d)(st|nd|rd|th)\b/g, "$1 ")
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/,/g, " ")
      .replace(/\.$/, ""),
  );
}

/** Whether year, month and day form a real date inside the accepted range of years. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** A complete date, or `invalid` when the numbers do not form one. */
function full(year: number, month: number, day: number): DateCellParts {
  return isRealDate(year, month, day) ? { kind: "full", year, month, day } : INVALID;
}

/** A day and month without a year, or `invalid`. 29 February is accepted; the year decides later. */
function monthDay(month: number, day: number): DateCellParts {
  return isRealDate(REFERENCE_LEAP_YEAR, month, day) ? { kind: "month-day", month, day } : INVALID;
}

/** Two-digit years are this century: timetables are never about the 1900s. */
function expandYear(twoDigits: number): number {
  return 2000 + twoDigits;
}

/** The numbers of a purely numeric date and how many digits each was written with. */
interface NumericDate {
  parts: number[];
  digits: number[];
}

/**
 * Splits a cleaned numeric date text (`31/01/2027`, `1-2-27`, `31.01`) into
 * its numbers. Null when the text is anything else.
 */
function readNumericDate(text: string): NumericDate | null {
  const match = /^(\d{1,4})[-/.\s](\d{1,2})(?:[-/.\s](\d{1,4}))?$/.exec(text);
  if (!match) return null;
  const texts = match.slice(1).filter((part): part is string => part !== undefined);
  return { parts: texts.map(Number), digits: texts.map((part) => part.length) };
}

/** Interprets the numbers of a numeric date in the given order. */
function resolveNumericDate({ parts, digits }: NumericDate, order: DateOrder): DateCellParts {
  if (parts.length === 2) {
    if (digits[0] > 2) return INVALID;
    return order === "dmy" ? monthDay(parts[1], parts[0]) : monthDay(parts[0], parts[1]);
  }
  const [first, second, third] = parts;
  // A four-digit year identifies itself wherever it stands.
  if (digits[0] === 4) return digits[2] <= 2 ? full(first, second, third) : INVALID;
  if (digits[0] > 2) return INVALID;
  if (digits[2] === 4) return order === "mdy" ? full(third, first, second) : full(third, second, first);
  if (digits[2] !== 2) return INVALID;
  if (order === "ymd") return digits[0] === 2 ? full(expandYear(first), second, third) : INVALID;
  return order === "mdy" ? full(expandYear(third), first, second) : full(expandYear(third), second, first);
}

/** Reads dates that spell the month out: `31 Jan 2027`, `Jan 31, 2027`, `Fri 1 Jan`, `March 2027`. */
function readNamedDate(text: string): DateCellParts {
  const words = text.split(/[\s\-/.]+/).filter((word) => word !== "");
  let month: number | null = null;
  const numbers: { value: number; digits: number }[] = [];
  for (const word of words) {
    if (isWeekdayName(word) || FILLER_WORDS.has(word)) continue;
    const named = parseMonthName(word);
    if (named !== null) {
      if (month !== null) return INVALID;
      month = named;
    } else if (/^\d{1,4}$/.test(word)) {
      numbers.push({ value: Number(word), digits: word.length });
    } else {
      return INVALID;
    }
  }
  if (month === null) {
    // "Fri 14", "14th", "1Sun": a day of the month with decoration.
    if (numbers.length === 1 && numbers[0].digits <= 2 && numbers[0].value >= 1 && numbers[0].value <= 31) {
      return { kind: "day", day: numbers[0].value };
    }
    return INVALID;
  }
  if (numbers.length === 0) return { kind: "month", month, year: null };
  if (numbers.length === 1) {
    const [only] = numbers;
    if (only.digits === 4) {
      return only.value >= MIN_YEAR && only.value <= MAX_YEAR ? { kind: "month", month, year: only.value } : INVALID;
    }
    return only.digits <= 2 ? monthDay(month, only.value) : INVALID;
  }
  if (numbers.length > 2) return INVALID;
  const [first, second] = numbers;
  if (first.digits === 4) return full(first.value, month, second.value);
  if (first.digits > 2 || second.digits === 1 || second.digits === 3) return INVALID;
  return full(second.digits === 4 ? second.value : expandYear(second.value), month, first.value);
}

/** Reads a date typed as text. */
function readText(text: string, order: DateOrder): DateCellParts {
  const cleaned = cleanDateText(text);
  if (cleaned === "") return EMPTY;
  if (/^\d{8}$/.test(cleaned)) {
    return full(Number(cleaned.slice(0, 4)), Number(cleaned.slice(4, 6)), Number(cleaned.slice(6, 8)));
  }
  if (/^\d{1,2}$/.test(cleaned)) {
    const day = Number(cleaned);
    return day >= 1 && day <= 31 ? { kind: "day", day } : INVALID;
  }
  const numeric = readNumericDate(cleaned);
  if (numeric) return resolveNumericDate(numeric, order);
  return readNamedDate(cleaned);
}

/** The civil date of a day count since 1970, as parts, or `invalid` outside the accepted years. */
function fromEpochDay(epochDay: number, minYear: number, maxYear: number): DateCellParts {
  const { year, month, day } = epochDayToCivil(epochDay);
  return year >= minYear && year <= maxYear ? { kind: "full", year, month, day } : INVALID;
}

/** Reads a date stored as a number: a day of the month, `YYYYMMDD`, or an Excel serial date. */
function readNumber(value: number, date1904: boolean): DateCellParts {
  if (!Number.isFinite(value) || value < 1) return INVALID;
  if (Number.isInteger(value) && value <= 31) return { kind: "day", day: value };
  if (Number.isInteger(value) && value >= MIN_YEAR * 10000) {
    return full(Math.floor(value / 10000), Math.floor(value / 100) % 100, value % 100);
  }
  const serialDay = Math.floor(value + HALF_MINUTE_DAYS);
  const epochDay = serialDay - EXCEL_EPOCH_OFFSET_DAYS + (date1904 ? EXCEL_1904_SHIFT_DAYS : 0);
  return fromEpochDay(epochDay, MIN_SERIAL_YEAR, MAX_SERIAL_YEAR);
}

/** Reads an Excel date cell, which exceljs delivers as midnight UTC of that date. */
function readDateObject(value: Date): DateCellParts {
  const ms = value.getTime();
  if (Number.isNaN(ms)) return INVALID;
  // A bare time cell sits on Excel's day zero and is rejected by the year range.
  return fromEpochDay(Math.floor((ms + HALF_MINUTE_MS) / MS_PER_DAY), MIN_YEAR, MAX_YEAR);
}

/**
 * Works out what a date cell contains without needing any context: a full
 * date, a day and month, a bare day of the month, a month title, or nothing
 * usable. `parseDateCell` builds on this; the timetable parser uses it
 * directly so it can fill in the missing year or month itself.
 */
export function readDateParts(value: RawCell | undefined, options: DatePartsOptions = {}): DateCellParts {
  if (value === null || value === undefined) return EMPTY;
  if (typeof value === "string") return readText(value, options.dateOrder ?? "dmy");
  if (typeof value === "number") return readNumber(value, options.date1904 ?? false);
  if (typeof value === "boolean") return INVALID;
  return readDateObject(value);
}

/**
 * Reads one date cell into `YYYY-MM-DD`.
 *
 * Accepts Excel date cells and serial numbers, ISO dates, numeric dates in
 * the order given by `context.dateOrder` (`31/01/2027`, `31-01-27`,
 * `1/31/2027`), dates with a month name (`31 Jan 2027`, `Jan 31, 2027`,
 * `Friday 1 January 2027`), dates without a year (`Fri 1 Jan`, taking
 * `context.year`) and a bare day of the month (taking `context.month` and
 * `context.year`).
 *
 * @returns the date, or null when the cell is empty, is not a date, or needs
 *          a year or month the context does not provide.
 */
export function parseDateCell(value: RawCell | undefined, context: DateCellContext): DateString | null {
  const parts = readDateParts(value, context);
  if (parts.kind === "full") return toDateString(parts.year, parts.month, parts.day);
  if (parts.kind === "month-day") return resolveDate(context.year, parts.month, parts.day);
  if (parts.kind === "day") return resolveDate(context.year, context.month, parts.day);
  return null;
}

/** Builds a date from parts that may be missing or may not exist in that year (29 February). */
export function resolveDate(year: number | undefined, month: number | undefined, day: number): DateString | null {
  if (year === undefined || month === undefined) return null;
  return isRealDate(year, month, day) ? toDateString(year, month, day) : null;
}

/** Position of a date for the consecutive-days test; dates without a year are placed in a leap year. */
function sequencePosition(parts: DateCellParts): number | null {
  if (parts.kind === "full") return civilToEpochDay(parts.year, parts.month, parts.day);
  if (parts.kind === "month-day") return civilToEpochDay(REFERENCE_LEAP_YEAR, parts.month, parts.day);
  return null;
}

/** How well one candidate order explains a column of dates. */
function scoreOrder(dates: readonly NumericDate[], order: DateOrder): { valid: number; consecutive: number } {
  let valid = 0;
  let consecutive = 0;
  let previous: number | null = null;
  for (const date of dates) {
    const position = sequencePosition(resolveNumericDate(date, order));
    if (position === null) continue;
    valid++;
    if (previous !== null && position === previous + 1) consecutive++;
    previous = position;
  }
  return { valid, consecutive };
}

/** Whether the meaning of a numeric date depends on the order of its parts. */
function isOrderDependent({ parts, digits }: NumericDate): boolean {
  return !(parts.length === 3 && digits[0] === 4);
}

/**
 * Decides how the numeric dates of one column are written.
 *
 * An order that turns more values into real dates wins (a first number above
 * 12 can only be a day). Between orders that fit equally, the one under which
 * the rows run through consecutive days wins. If that still leaves a choice,
 * the fallback is used. Year-first is only considered for dates written as
 * three two-digit numbers (`27-01-31`).
 *
 * @param values   The cells of the date column, in row order.
 * @param fallback Order to use when the values do not decide (day-first by default).
 */
export function detectDateOrder(values: readonly (RawCell | undefined)[], fallback: DateOrder = "dmy"): DateOrderDetection {
  const dates: NumericDate[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const numeric = readNumericDate(cleanDateText(value));
    if (numeric && isOrderDependent(numeric)) dates.push(numeric);
  }
  if (dates.length === 0) return { order: fallback, basis: "none" };

  const hasTwoDigitTriple = dates.some(({ parts, digits }) => parts.length === 3 && digits.every((count) => count <= 2));
  const candidates: DateOrder[] = hasTwoDigitTriple ? ["dmy", "mdy", "ymd"] : ["dmy", "mdy"];
  const scores = candidates.map((order) => ({ order, ...scoreOrder(dates, order) }));

  const mostValid = Math.max(...scores.map((score) => score.valid));
  const fitting = scores.filter((score) => score.valid === mostValid);
  if (fitting.length === 1) return { order: fitting[0].order, basis: "evidence" };

  const longestRun = Math.max(...fitting.map((score) => score.consecutive));
  const sequential = fitting.filter((score) => score.consecutive === longestRun);
  if (sequential.length === 1) return { order: sequential[0].order, basis: "sequence" };

  const preferred = sequential.some((score) => score.order === fallback) ? fallback : sequential[0].order;
  return { order: preferred, basis: "default" };
}

/**
 * Finds a month and a year in free text such as a sheet name or a title row:
 * `March`, `Mar 2027`, `Jan-27`, `2027-03`, `03`, `Prayer times - March 2027`.
 * Either part is null when the text does not name it.
 */
export function readMonthYear(text: string): { month: number | null; year: number | null } {
  const words = cleanDateText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
  let month: number | null = null;
  let year: number | null = null;
  const smallNumbers: number[] = [];
  for (const word of words) {
    const named = parseMonthName(word);
    // "may" is also an everyday word ("times may change"); only trust it in short texts.
    if (named !== null && month === null && (word !== "may" || words.length <= 3)) {
      month = named;
    } else if (/^\d{4}$/.test(word)) {
      const value = Number(word);
      if (year === null && value >= MIN_SERIAL_YEAR && value <= MAX_SERIAL_YEAR) year = value;
    } else if (/^\d{1,2}$/.test(word)) {
      smallNumbers.push(Number(word));
    }
  }
  const onlyNumbers = words.every((word) => /^\d+$/.test(word));
  if (month === null && onlyNumbers && smallNumbers.length === 1 && smallNumbers[0] >= 1 && smallNumbers[0] <= 12) {
    // A sheet or file named "03", or "2027-03".
    if (words.length === 1 || year !== null) month = smallNumbers[0];
  }
  if (month !== null && year === null && words.length === 2 && smallNumbers.length === 1 && smallNumbers[0] >= 20) {
    // "Jan 27" as a sheet name is January 2027, not the 27th.
    year = expandYear(smallNumbers[0]);
  }
  return { month, year };
}
