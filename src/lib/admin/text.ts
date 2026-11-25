/**
 * Small wording helpers shared by the admin screens. Pure and free of
 * server-only imports, so Server and Client Components use the same words.
 */

import {
  formatDateMedium,
  formatMonthYear,
  formatTimeText,
  formatWeekdayShort,
  parseDateParts,
  yearOf,
  zonedNow,
} from "@/lib/time";
import type { DateString, TimeFormat } from "@/lib/types";

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

/** `1 day` / `3 days`: a count with its noun in the right number. */
export function plural(count: number, singular: string, pluralForm: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Joins words as English prose: `a`, `a and b`, `a, b and c`.
 * @param conjunction The word before the last item; `or` after a negative ("it has no a, b or c").
 */
export function formatList(items: readonly string[], conjunction: "and" | "or" = "and"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

/** A file size a volunteer can compare with what their computer shows: `840 bytes`, `312 KB`, `5 MB`, `7.4 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 bytes";
  if (bytes < BYTES_PER_KB) return plural(Math.round(bytes), "byte");
  if (bytes < BYTES_PER_MB) return `${Math.round(bytes / BYTES_PER_KB)} KB`;
  const megabytes = bytes / BYTES_PER_MB;
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

/** A date with its year and without the weekday: `25 November 2026`. */
export function formatDateFull(date: DateString): string {
  return `${parseDateParts(date).day} ${formatMonthYear(date)}`;
}

/** A date with weekday and year, compact: `Wed 25 Nov 2026`. */
export function formatDateWithYear(date: DateString): string {
  return `${formatDateMedium(date)} ${yearOf(date)}`;
}

/** Day of the week and day of the month, for a row of a month: `Fri 1`. */
export function formatDayOfMonth(date: DateString): string {
  return `${formatWeekdayShort(date)} ${parseDateParts(date).day}`;
}

/**
 * An inclusive range of dates as prose. One day reads as a single date;
 * the year is said once when both ends share it.
 * `1 January to 31 December 2027`, `28 December 2026 to 3 January 2027`.
 */
export function formatDateRange(from: DateString, to: DateString): string {
  if (from === to) return formatDateFull(from);
  if (yearOf(from) !== yearOf(to)) return `${formatDateFull(from)} to ${formatDateFull(to)}`;
  const start = parseDateParts(from);
  const startMonth = formatMonthYear(from).replace(` ${start.year}`, "");
  return `${start.day} ${startMonth} to ${formatDateFull(to)}`;
}

/**
 * A stored timestamp (ISO-8601, UTC) as the date and time it was on the
 * mosque's wall clock: `Wed 25 Nov 2026, 2:05 PM`. Returns the placeholder
 * when the timestamp cannot be read.
 */
export function formatTimestamp(
  iso: string,
  timeZone: string,
  timeFormat: TimeFormat,
  placeholder: string = "Unknown time",
): string {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return placeholder;
  const local = zonedNow(timeZone, instant);
  return `${formatDateWithYear(local.date)}, ${formatTimeText(local.time, timeFormat)}`;
}
