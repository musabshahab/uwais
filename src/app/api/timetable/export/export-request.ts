/**
 * The request side of `GET /api/timetable/export`: which file format and
 * which dates were asked for, and what the download is called. Pure, so every
 * rejection can be unit-tested without a server.
 */

import type { DateRange } from "@/lib/db/schemas";
import { parseTimetableQuery } from "@/lib/server/timetable-query";
import { firstDayOfMonth, lastDayOfMonth, monthOf } from "@/lib/time";

/** The file formats the timetable can be downloaded in. */
export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
/** One of `EXPORT_FORMATS`. */
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The format served when the request names none. */
export const DEFAULT_EXPORT_FORMAT: ExportFormat = "csv";

/** The `Content-Type` of each format. */
export const EXPORT_CONTENT_TYPES: Readonly<Record<ExportFormat, string>> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Body of the answer when the requested period holds no days. */
export interface ExportNotFoundBody {
  error: {
    code: "no_data";
    /** A sentence that can be shown to the person who asked for the download. */
    message: string;
  };
}

/** A usable export request, or the reason it was refused. */
export type ExportQueryResult =
  | { ok: true; format: ExportFormat; range: DateRange }
  | { ok: false; message: string };

/**
 * Validates the query of `GET /api/timetable/export`.
 *
 * `format` is `csv` or `xlsx` (`csv` when left out). The dates are named
 * exactly as for `GET /api/timetable`: `year=YYYY`, `month=YYYY-MM`, or
 * `from` with `to`, under the same limits.
 */
export function parseExportQuery(params: URLSearchParams): ExportQueryResult {
  const formats = params.getAll("format");
  if (formats.length > 1) {
    return { ok: false, message: 'The "format" parameter was given more than once.' };
  }
  const wanted = formats.length === 0 ? DEFAULT_EXPORT_FORMAT : formats[0];
  const format = EXPORT_FORMATS.find((candidate) => candidate === wanted);
  if (format === undefined) {
    return { ok: false, message: "format: ask for csv or xlsx." };
  }
  const query = parseTimetableQuery(params);
  return query.ok ? { ok: true, format, range: query.range } : query;
}

/**
 * The name of the downloaded file: `timetable-2027.csv` for a calendar year,
 * `timetable-2027-03.xlsx` for a calendar month, and both dates for anything
 * else. Built from validated dates only, so it is plain ASCII with nothing
 * that needs escaping in a header.
 */
export function exportFileName(range: DateRange, format: ExportFormat): string {
  const { from, to } = range;
  const year = from.slice(0, 4);
  const wholeYear = from === `${year}-01-01` && to === `${year}-12-31`;
  const wholeMonth = from === firstDayOfMonth(from) && to === lastDayOfMonth(from);
  const period = wholeYear ? year : wholeMonth ? monthOf(from) : `${from}-to-${to}`;
  return `timetable-${period}.${format}`;
}

/** The `Content-Disposition` header that makes a browser save the response under `fileName`. */
export function attachmentDisposition(fileName: string): string {
  return `attachment; filename="${fileName}"`;
}
