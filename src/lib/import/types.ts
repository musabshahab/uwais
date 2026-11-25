/**
 * Types and small constants of the timetable importer.
 *
 * This file has no runtime dependencies besides the shared domain types, so
 * client components (the mapping editor, the import preview) can import from
 * it directly without pulling the spreadsheet libraries into the browser
 * bundle. Server code imports everything from the barrel `@/lib/import`.
 */

import { TIME_FIELDS, type DateString, type PrayerDay, type TimeField } from "@/lib/types";

/** One cell as read from a spreadsheet, before any interpretation. */
export type RawCell = string | number | boolean | Date | null;

/** The file formats the importer can read. */
export type SpreadsheetFormat = "csv" | "xlsx";

/** One sheet of a workbook. `rows[0]` is row 1 as the user sees it in Excel. */
export interface RawSheet {
  /** Sheet name; for CSV files the file name without its extension. */
  name: string;
  /** Row by row, cell by cell. Rows may be shorter than the widest row. */
  rows: RawCell[][];
}

/** A spreadsheet file read into memory, with every cell still uninterpreted. */
export interface RawWorkbook {
  format: SpreadsheetFormat;
  sheets: RawSheet[];
  /**
   * True when the Excel workbook counts dates from 1904 (old Mac files).
   * Only matters for date cells that arrive as bare serial numbers.
   */
  date1904?: boolean;
}

/** A time column of the timetable, or a Jumu'ah time (which has no column of its own in `PrayerDay`). */
export type TimeCellField = TimeField | "jumuah";

/**
 * Order of the components in a numeric date such as `01/02/2027`.
 * `ymd` only ever applies to dates written with three two-digit numbers
 * (`27-02-01`); a four-digit year always identifies itself.
 */
export type DateOrder = "dmy" | "mdy" | "ymd";

/** The three Jumu'ah columns a file can carry. */
export const JUMUAH_TARGETS = ["jumuah1", "jumuah2", "jumuah3"] as const;
/** One of the Jumu'ah columns: `jumuah1`, `jumuah2` or `jumuah3`. */
export type JumuahTarget = (typeof JUMUAH_TARGETS)[number];

/**
 * Everything a spreadsheet column can be mapped to, in the order the mapping
 * editor lists them.
 *
 * - `date`: a full date (or a day and month, the year coming from context).
 * - `day`: a day-of-month number, combined with `month` or the sheet name.
 * - `month`: a month name or number.
 */
export const MAPPING_TARGETS = ["date", "day", "month", ...TIME_FIELDS, ...JUMUAH_TARGETS, "note"] as const;
/** One of `MAPPING_TARGETS`: what a spreadsheet column can stand for. */
export type MappingTarget = (typeof MAPPING_TARGETS)[number];

/**
 * Which column (0-based index into the sheet's rows) feeds each target, or
 * null when the file has no column for it. Plain data on purpose: the admin
 * corrects it with dropdowns and sends it back with the next import.
 */
export type ColumnMapping = Record<MappingTarget, number | null>;

/** Human names of the time columns, also the canonical export headers. */
export const FIELD_LABELS: Readonly<Record<TimeField, string>> = {
  fajrBegins: "Fajr Begins",
  fajrJamaat: "Fajr Jamaat",
  sunrise: "Sunrise",
  dhuhrBegins: "Dhuhr Begins",
  dhuhrJamaat: "Dhuhr Jamaat",
  asrBegins: "Asr Begins",
  asrJamaat: "Asr Jamaat",
  maghribBegins: "Maghrib Begins",
  maghribJamaat: "Maghrib Jamaat",
  ishaBegins: "Isha Begins",
  ishaJamaat: "Isha Jamaat",
};

/** Human names of every mapping target, for the mapping editor and for messages. */
export const TARGET_LABELS: Readonly<Record<MappingTarget, string>> = {
  date: "Date",
  day: "Day of month",
  month: "Month",
  ...FIELD_LABELS,
  jumuah1: "Jumuah 1",
  jumuah2: "Jumuah 2",
  jumuah3: "Jumuah 3",
  note: "Note",
};

/** Longest note kept for a day; anything longer is cut on import. */
export const MAX_NOTE_LENGTH = 200;

/** The parts of a `PrayerDay` an import can overwrite. */
export const MERGE_FIELDS = [...TIME_FIELDS, "jumuah", "note"] as const;
/** One of `MERGE_FIELDS`: a time field, `jumuah` (all Jumu'ah times of the day) or `note`. */
export type MergeField = (typeof MERGE_FIELDS)[number];

/** What the values of a column look like, used to tell a date column from a weekday or day-number column. */
export type ColumnContent = "date" | "day-number" | "weekday" | "month" | "other" | "empty";

/** A column of a detected table. */
export interface SheetColumn {
  /** 0-based index into the sheet's rows. */
  index: number;
  /** The column's letter in Excel (`A`, `B`, .. `AA`). */
  letter: string;
  /** Header text, the rows of a multi-row header joined with a space. Empty when the column has no heading. */
  label: string;
  /** The first few values of the column as text, to help the admin recognise it. */
  samples: string[];
  content: ColumnContent;
}

/** A recognised column the importer deliberately does not use. */
export interface IgnoredColumn {
  index: number;
  label: string;
  /** Why it is not needed, e.g. `Hijri date`. */
  reason: string;
}

/**
 * How much an issue matters: an `error` keeps a row (or the whole file) from
 * being imported, a `warning` is imported but deserves a look, `info` only
 * explains what the importer did.
 */
export type IssueSeverity = "error" | "warning" | "info";

/** Stable identifiers of every problem the importer reports. Safe to switch on and to test against. */
export const ISSUE_CODES = [
  // Nothing can be imported.
  "empty-file",
  "no-timetable-found",
  "nothing-to-import",
  "sheet-not-found",
  "no-date-column",
  "no-time-columns",
  "month-unknown",
  "year-unknown",
  // A row cannot be imported.
  "date-missing",
  "date-invalid",
  "time-invalid",
  // Importable, but worth a look.
  "times-out-of-order",
  "jamaat-before-begins",
  "time-jump",
  "duplicate-date",
  "missing-dates",
  "rows-without-times",
  "dates-far-from-year",
  "date-order-assumed",
  "midnight-assumed",
  "no-jamaat-columns",
  "no-begins-columns",
  "prayer-column-missing",
  "prayer-not-found",
  "duplicate-column",
  "column-role-assumed",
  "columns-differ-between-sheets",
  "sparse-jamaat-column",
  "ditto-without-value",
  "mapping-invalid",
  "note-truncated",
  // For information.
  "pm-assumed",
  "asr-two-columns",
  "sheet-skipped",
  "row-skipped",
  "unmapped-columns",
  "jumuah-not-friday",
  "cells-filled-down",
] as const;
/** One of `ISSUE_CODES`. */
export type IssueCode = (typeof ISSUE_CODES)[number];

/** One problem or remark about the imported file, worded for a volunteer. */
export interface ImportIssue {
  /**
   * `error`: the row (or the whole file) cannot be imported.
   * `warning`: imported, but probably worth checking.
   * `info`: an explanation of how the file was read.
   */
  severity: IssueSeverity;
  code: IssueCode;
  /** Plain English; names the row and column and quotes the offending value where there is one. */
  message: string;
  /** Sheet the issue is about, or null when it concerns the whole file. */
  sheet: string | null;
  /** Row as numbered in Excel (1-based), or null when the issue is not about one row. */
  rowNumber: number | null;
  /** The mapping target of the column the issue is about. */
  field?: MappingTarget;
}

/**
 * What became of a spreadsheet row.
 *
 * - `ok`: imported.
 * - `error`: not imported; its issues say why.
 * - `no-times`: has a date but no times, so it was left out (existing times for that date are kept).
 * - `replaced`: valid, but a later row has the same date and won.
 * - `skipped`: does not look like a timetable row (a footer, a stray remark).
 */
export type ImportRowStatus = "ok" | "error" | "no-times" | "replaced" | "skipped";

/** The outcome of one spreadsheet row. */
export interface ImportRow {
  sheet: string;
  /** Row as numbered in Excel (1-based). */
  rowNumber: number;
  status: ImportRowStatus;
  /** The row's date when it could be read, even if the row itself was not imported. */
  date: DateString | null;
  /** The day read from the row; null unless the status is `ok` or `replaced`. */
  day: PrayerDay | null;
  issues: ImportIssue[];
}

/** Why a sheet contributed no rows. */
export type SheetStatus = "imported" | "skipped" | "failed";

/** How one sheet of the workbook was understood. */
export interface SheetReport {
  name: string;
  /**
   * `imported`: its rows were read. `skipped`: no timetable on it.
   * `failed`: it looks like a timetable but something essential is missing.
   */
  status: SheetStatus;
  /** First header row as numbered in Excel, or null when no header row was found. */
  headerRowNumber: number | null;
  /** How many rows the header spans (0 when none was found). */
  headerRowCount: number;
  columns: SheetColumn[];
  /** The mapping that was used: the guess, or the caller's override. */
  mapping: ColumnMapping;
  /** Whether `mapping` was guessed from the headers or supplied by the caller. */
  mappingSource: "guessed" | "provided";
  /** Recognised columns that are not needed (Hijri date, weekday, ...). */
  ignoredColumns: IgnoredColumn[];
  /** Columns that were not recognised and are not mapped. */
  unmappedColumns: SheetColumn[];
  /** The order used for numeric dates on this sheet, or null when no date depended on it. */
  dateOrder: DateOrder | null;
  /** Number of timetable rows read from the sheet (everything that appears in `ImportResult.rows`). */
  rowCount: number;
}

/** The headline numbers of an import. */
export interface ImportSummary {
  /** Rows looked at: every entry of `ImportResult.rows`. */
  totalRows: number;
  /** Days ready to be saved, after removing duplicates. */
  validDays: number;
  /** Rows that could not be imported. */
  errorRows: number;
  /** Rows left out without being an error (no times, or not a timetable row). */
  skippedRows: number;
  /** Number of warning-level issues. */
  warnings: number;
  firstDate: DateString | null;
  lastDate: DateString | null;
  /**
   * Dates between `firstDate` and `lastDate` that have no row in the file
   * (capped at 1000 entries). Dates whose row had an error or no times are
   * not listed here; those rows have their own issues.
   */
  missingDates: DateString[];
  /**
   * Columns in which a time written without AM/PM was moved to the afternoon
   * or evening (`1:15` read as `13:15`).
   */
  pmAssumedFields: TimeCellField[];
  /** The order used for numeric dates such as 01/02/2027, or null when no date depended on it. */
  dateOrderUsed: DateOrder | null;
}

/**
 * Everything the importer found out about a file. JSON-serialisable: it is
 * returned from a Server Action to the browser as is.
 */
export interface ImportResult {
  format: SpreadsheetFormat;
  sheets: SheetReport[];
  /**
   * The mapping used for each imported or failed sheet, keyed by sheet name:
   * the same shape as `ParseOptions.mapping`, ready to be edited and sent back.
   */
  mapping: Record<string, ColumnMapping>;
  rows: ImportRow[];
  /** Every issue, file-level ones first, then in sheet and row order. */
  issues: ImportIssue[];
  /** The days to save: valid, sorted by date, one per date. Unmapped fields are null. */
  days: PrayerDay[];
  /**
   * The parts of a day this file provides. Pass it to `diffTimetable` and
   * `mergeDay` so that columns the file does not have keep their saved values.
   */
  mappedFields: MergeField[];
  summary: ImportSummary;
}

/** Options of `parseTimetable`. */
export interface ParseOptions {
  /**
   * Column mapping overrides keyed by sheet name. The key `*` applies to every
   * sheet without an entry of its own. Targets left out are treated as unmapped.
   */
  mapping?: Record<string, Partial<ColumnMapping>>;
  /**
   * Year to assume when the file's dates carry none. Pass the current year in
   * the mosque's timezone. A year written in the file (sheet name, title row)
   * takes precedence. Also the reference for the "more than two years away" check.
   */
  year?: number;
  /** Order of numeric dates; `auto` (the default) works it out per sheet and falls back to day-first. */
  dateOrder?: "auto" | DateOrder;
  /** Restrict the import to these sheets (by name). Default: every sheet that holds a timetable. */
  sheets?: string[];
  /**
   * Treat an empty or dashed cell in a jamaat column as "same as the row
   * above". For sheets that only write a jamaat time on the day it changes.
   */
  fillDown?: boolean;
}

/** A field that differs between the saved day and the imported one. */
export interface FieldChange {
  field: MergeField;
  /** Saved value; Jumu'ah times are joined with ", ". Null when empty. */
  from: string | null;
  /** Value after the import, in the same form as `from`. */
  to: string | null;
}

/** A saved day the import would change. */
export interface DayChange {
  date: DateString;
  before: PrayerDay;
  /** The day as it will be saved: `mergeDay(before, incoming, mappedFields)`. */
  after: PrayerDay;
  fields: FieldChange[];
}

/** What an import would do to the saved timetable. */
export interface TimetableDiff {
  /** Days that do not exist yet, as they will be saved. */
  added: PrayerDay[];
  changed: DayChange[];
  /** Number of incoming days that are identical to what is saved. */
  unchanged: number;
}
