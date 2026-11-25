/**
 * The timetable import/export engine.
 *
 *   readSpreadsheet(file)            bytes of a CSV or Excel file -> raw rows
 *   parseTimetable(workbook, opts)   raw rows -> validated days + issues
 *   diffTimetable / mergeDay         preview and apply the upsert
 *   toCsv / toXlsx / buildTemplate*  write the timetable back out
 *
 * Server-side only: this barrel pulls in the spreadsheet libraries. Client
 * components import types and constants from `@/lib/import/types`, and the
 * pure merge helpers from `@/lib/import/diff`.
 */

export * from "./types";
export * from "./errors";
export { readSpreadsheet, type SpreadsheetFile } from "./read";
export { detectTable, type DetectedTable } from "./detect";
export {
  analyseColumns,
  classifyLabel,
  describeColumn,
  emptyMapping,
  guessMapping,
  listUnusedColumns,
  reviewMapping,
  type ColumnAnalysis,
  type ColumnInput,
  type LabelClass,
  type LabelKind,
  type MappingNote,
  type PrayerRole,
} from "./columns";
export { parseTimeCell, type TimeAdjustment, type TimeCellIssue, type TimeCellResult } from "./time-cell";
export {
  detectDateOrder,
  parseDateCell,
  readDateParts,
  readMonthYear,
  type DateCellContext,
  type DateCellParts,
  type DateOrderDetection,
  type DatePartsOptions,
} from "./date-cell";
export { parseTimetable } from "./parse";
export { checkDay, findMissingDates, findTimeJumps, MAX_DAILY_DRIFT_MINUTES, type DayFinding, type MissingDates, type TimeJump } from "./checks";
export { daysToSave, diffTimetable, mergeDay } from "./diff";
export { blankDay, blankYear } from "./day";
export {
  buildTemplateCsv,
  buildTemplateXlsx,
  exportHeaders,
  toCsv,
  toXlsx,
  type CsvExportOptions,
  type TemplateOptions,
  type XlsxExportOptions,
} from "./export";
