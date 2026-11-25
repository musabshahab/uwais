/**
 * The timetable import, without the Server Action wrapping: reading the
 * form, building the preview and committing.
 *
 * Preview and commit share one analysis. The commit never receives rows from
 * the browser: it is handed the uploaded file again and works everything out
 * afresh, so what is saved always comes from the file and the database as
 * they are at that moment.
 */

import { z } from "zod";
import {
  MAX_DAY_NOTE_LENGTH,
  MAX_UPSERT_DAYS,
  addImportLog,
  getPrayerDays,
  getSettings,
  prayerDaysSchema,
  upsertPrayerDays,
} from "@/lib/db";
import {
  IMPORT_LIMITS,
  MAPPING_TARGETS,
  diffTimetable,
  isImportFileError,
  mergeDay,
  parseTimetable,
  readSpreadsheet,
  type ColumnMapping,
  type ImportIssue,
  type ImportResult,
  type ImportRow,
  type MappingTarget,
  type MergeField,
  type ParseOptions,
  type RawWorkbook,
  type TimetableDiff,
} from "@/lib/import";
import { plural } from "@/lib/import/text";
import { mosqueToday } from "@/lib/server/display";
import { yearOf } from "@/lib/time";
import type { DateString, PrayerDay } from "@/lib/types";
import {
  IMPORT_FORM_FIELDS,
  IMPORT_PREVIEW_CHANGE_LIMIT,
  IMPORT_PREVIEW_ISSUE_LIMIT,
  IMPORT_PREVIEW_ROW_LIMIT,
  MAX_IMPORT_YEAR,
  MIN_IMPORT_YEAR,
  type ActionFailure,
  type ImportCommitResult,
  type ImportDateOrderOption,
  type ImportDayEffect,
  type ImportIssueCounts,
  type ImportMappingOverrides,
  type ImportPreview,
  type ImportPreviewData,
  type ImportPreviewRow,
} from "../types";
import { cleanFileName, isFormData, readFile, readFlag, readTrimmed } from "./form";
import { withTimetableLock } from "./lock";
import { failure } from "./result";

/** Longest `mapping` field that is parsed at all; a real one is a few hundred characters. */
const MAX_MAPPING_JSON_LENGTH = 100_000;

/** Longest sheet name accepted as a mapping key. Excel's own limit is 31 characters. */
const MAX_SHEET_NAME_LENGTH = 255;

/** Name recorded in the import history when the browser sent none. */
const UNNAMED_FILE = "timetable";

const DATE_ORDER_OPTIONS: readonly ImportDateOrderOption[] = ["auto", "dmy", "mdy", "ymd"];

const columnIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(IMPORT_LIMITS.maxColumnsPerSheet - 1)
  .nullable()
  .optional();

/** One sheet's column choices: any subset of the mapping targets. Unknown keys are dropped. */
const sheetMappingSchema = z.object(
  Object.fromEntries(MAPPING_TARGETS.map((target) => [target, columnIndexSchema])) as Record<
    MappingTarget,
    typeof columnIndexSchema
  >,
);

/** A validated import submission. */
export interface ImportRequest {
  file: {
    /** File name without any folder; never empty. */
    name: string;
    size: number;
    data: Uint8Array;
  };
  /** Column choices per sheet, or null to let the importer work the columns out. */
  mapping: ImportMappingOverrides | null;
  /** Year for dates that carry none, or null when the file has to provide it. */
  year: number | null;
  dateOrder: ImportDateOrderOption;
  fillDown: boolean;
  /** Whether the user confirmed the warnings. Only the commit looks at it. */
  acknowledgeWarnings: boolean;
}

/** A readable submission, or the reason it was refused. */
export type ImportFormResult = { ok: true; request: ImportRequest } | ActionFailure;

/** Everything worked out about an upload, shared by the preview and the commit. */
interface ImportAnalysis {
  request: ImportRequest;
  result: ImportResult;
  /** Row outcomes, with any change this module made to a row's day and issues. */
  rows: ImportRow[];
  issues: ImportIssue[];
  counts: ImportIssueCounts;
  /** The days to save, in the exact form the database stores them, sorted by date. */
  days: PrayerDay[];
  /** The stored rows between the first and last date of `days`. */
  existing: PrayerDay[];
  diff: TimetableDiff;
}

/**
 * Reads the `mapping` field. The result has no prototype: the importer looks
 * sheets up by name in this object, and a sheet called `constructor` must not
 * find `Object.prototype.constructor` there.
 * @returns The overrides, null for a blank field, or `"invalid"`.
 */
function readMapping(text: string): ImportMappingOverrides | null | "invalid" {
  if (text === "") return null;
  if (text.length > MAX_MAPPING_JSON_LENGTH) return "invalid";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "invalid";

  const sheets = Object.keys(raw);
  // One entry per sheet, plus the `*` entry.
  if (sheets.length > IMPORT_LIMITS.maxSheets + 1) return "invalid";
  const source: Readonly<Record<string, unknown>> = { ...raw };
  const overrides: ImportMappingOverrides = Object.create(null);
  for (const sheet of sheets) {
    if (sheet === "" || sheet.length > MAX_SHEET_NAME_LENGTH) return "invalid";
    const parsed = sheetMappingSchema.safeParse(source[sheet]);
    if (!parsed.success) return "invalid";
    const mapping: Partial<ColumnMapping> = {};
    for (const target of MAPPING_TARGETS) {
      const index = parsed.data[target];
      if (index !== undefined) mapping[target] = index;
    }
    overrides[sheet] = mapping;
  }
  return overrides;
}

/** Reads the `year` field: null when blank, `"invalid"` unless it is a plausible four-digit year. */
function readYear(text: string): number | null | "invalid" {
  if (text === "") return null;
  if (!/^\d{4}$/.test(text)) return "invalid";
  const year = Number(text);
  return year >= MIN_IMPORT_YEAR && year <= MAX_IMPORT_YEAR ? year : "invalid";
}

/**
 * Validates an import form and reads the uploaded file into memory.
 *
 * Fields: `file` (required), `mapping` (JSON), `year`, `dateOrder`,
 * `fillDown`, `acknowledgeWarnings`; see `IMPORT_FORM_FIELDS`. Anything else
 * the form carries is ignored, in particular rows or days: those only ever
 * come from the file.
 */
export async function readImportForm(formData: unknown): Promise<ImportFormResult> {
  if (!isFormData(formData)) {
    return failure("invalid", "The upload could not be read. Choose the file again.");
  }
  const fieldErrors: Record<string, string> = {};

  const file = readFile(formData, IMPORT_FORM_FIELDS.file);
  // A file input that was left empty still submits a nameless file of zero bytes.
  if (file === null || (file.name === "" && file.size === 0)) {
    fieldErrors[IMPORT_FORM_FIELDS.file] =
      "Choose the timetable file to upload: an Excel workbook (.xlsx) or a CSV file.";
  }

  const mapping = readMapping(readTrimmed(formData, IMPORT_FORM_FIELDS.mapping));
  if (mapping === "invalid") {
    fieldErrors[IMPORT_FORM_FIELDS.mapping] =
      "The column choices could not be read. Choose the columns again.";
  }

  const year = readYear(readTrimmed(formData, IMPORT_FORM_FIELDS.year));
  if (year === "invalid") {
    fieldErrors[IMPORT_FORM_FIELDS.year] =
      `Enter the year as four digits between ${MIN_IMPORT_YEAR} and ${MAX_IMPORT_YEAR}, for example 2027.`;
  }

  const orderText = readTrimmed(formData, IMPORT_FORM_FIELDS.dateOrder) || "auto";
  const dateOrder = DATE_ORDER_OPTIONS.find((option) => option === orderText);
  if (dateOrder === undefined) {
    fieldErrors[IMPORT_FORM_FIELDS.dateOrder] = "Choose how the dates in the file are written.";
  }

  const messages = Object.values(fieldErrors);
  if (
    messages.length > 0 ||
    file === null ||
    mapping === "invalid" ||
    year === "invalid" ||
    dateOrder === undefined
  ) {
    return failure("invalid", messages[0] ?? "The upload could not be read.", fieldErrors);
  }

  return {
    ok: true,
    request: {
      file: {
        name: cleanFileName(file.name) || UNNAMED_FILE,
        size: file.size,
        data: new Uint8Array(await file.arrayBuffer()),
      },
      mapping,
      year,
      dateOrder,
      fillDown: readFlag(formData, IMPORT_FORM_FIELDS.fillDown),
      acknowledgeWarnings: readFlag(formData, IMPORT_FORM_FIELDS.acknowledgeWarnings),
    },
  };
}

/**
 * Parses a workbook with the mosque's current year as the yardstick for
 * "this date is years away", without ever guessing a missing year.
 *
 * The importer uses one option, `year`, for two things: the year to assume
 * when the file has none, and the reference for that plausibility check.
 * Passing the current year unasked would silently date a year-less file to
 * this year, and next year's timetable is usually uploaded in December. So
 * the file is first read without a year. If that fails for want of one, the
 * user is asked. Otherwise every date got its year from the file, and a
 * second reading with the current year changes no date and only adds the check.
 *
 * @param options     What the user chose; `year` only when they supplied one.
 * @param currentYear The year it is now on the mosque's calendar.
 */
export function parseWorkbook(
  workbook: RawWorkbook,
  options: ParseOptions,
  currentYear: number,
): ImportResult {
  const result = parseTimetable(workbook, options);
  if (options.year !== undefined) return result;
  if (result.issues.some((issue) => issue.code === "year-unknown")) return result;
  return parseTimetable(workbook, { ...options, year: currentYear });
}

/** Where a row is, worded as the importer words it. */
function rowLabel(row: ImportRow, sheetCount: number): string {
  return sheetCount > 1 ? `Sheet "${row.sheet}", row ${row.rowNumber}` : `Row ${row.rowNumber}`;
}

/** Puts issues in the importer's order: whole-file remarks first, then by sheet, then by row. */
function orderIssues(issues: readonly ImportIssue[], sheetNames: readonly string[]): ImportIssue[] {
  const position = (issue: ImportIssue) =>
    issue.sheet === null ? -1 : sheetNames.indexOf(issue.sheet);
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (a, b) =>
        position(a.issue) - position(b.issue) ||
        (a.issue.rowNumber ?? 0) - (b.issue.rowNumber ?? 0) ||
        a.index - b.index,
    )
    .map(({ issue }) => issue);
}

/**
 * Cuts notes down to what the database stores.
 *
 * The importer keeps notes up to 200 characters, the database refuses more
 * than `MAX_DAY_NOTE_LENGTH`. Without this step a single long note would
 * make the whole import fail when it is saved. The affected rows get a
 * warning in place of the importer's own "note was cut" remark, so the
 * preview states the length that really applies.
 */
function fitNotes(result: ImportResult): { rows: ImportRow[]; issues: ImportIssue[] } {
  const sheetCount = result.sheets.length;
  const isCutRemark = (issue: ImportIssue, row: ImportRow) =>
    issue.code === "note-truncated" && issue.sheet === row.sheet && issue.rowNumber === row.rowNumber;

  const shortened: ImportRow[] = [];
  const rows = result.rows.map((row) => {
    const note = row.day?.note ?? null;
    if (row.day === null || note === null || note.length <= MAX_DAY_NOTE_LENGTH) return row;
    const warning: ImportIssue = {
      severity: "warning",
      code: "note-truncated",
      message: `${rowLabel(row, sheetCount)}: the note is longer than ${MAX_DAY_NOTE_LENGTH} characters and was cut short.`,
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      field: "note",
    };
    const fitted: ImportRow = {
      ...row,
      day: { ...row.day, note: note.slice(0, MAX_DAY_NOTE_LENGTH).trim() },
      issues: [...row.issues.filter((issue) => !isCutRemark(issue, row)), warning],
    };
    shortened.push(fitted);
    return fitted;
  });
  if (shortened.length === 0) return { rows, issues: result.issues };

  const kept = result.issues.filter((issue) => !shortened.some((row) => isCutRemark(issue, row)));
  const added = shortened.map((row) => row.issues[row.issues.length - 1]);
  const sheetNames = result.sheets.map((sheet) => sheet.name);
  return { rows, issues: orderIssues([...kept, ...added], sheetNames) };
}

/** Counts issues by severity. */
function countIssues(issues: readonly ImportIssue[]): ImportIssueCounts {
  const counts: ImportIssueCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}

/** The options handed to the importer for a request. */
function parseOptionsOf(request: ImportRequest): ParseOptions {
  const options: ParseOptions = { dateOrder: request.dateOrder, fillDown: request.fillDown };
  if (request.mapping !== null) options.mapping = request.mapping;
  if (request.year !== null) options.year = request.year;
  return options;
}

/**
 * Reads the file, parses it and compares it with the stored timetable.
 * @throws when the database cannot be read, or when the importer hands back
 *         a day the database schema refuses (a bug, not a user error).
 */
async function analyseImport(
  request: ImportRequest,
  nowMs: number,
): Promise<{ ok: true; analysis: ImportAnalysis } | ActionFailure> {
  let workbook: RawWorkbook;
  try {
    workbook = await readSpreadsheet({ fileName: request.file.name, data: request.file.data });
  } catch (error) {
    if (!isImportFileError(error)) throw error;
    return failure("invalid", error.message, { [IMPORT_FORM_FIELDS.file]: error.message });
  }

  const settings = await getSettings();
  const currentYear = yearOf(mosqueToday(settings.timezone, nowMs));
  const result = parseWorkbook(workbook, parseOptionsOf(request), currentYear);
  const { rows, issues } = fitNotes(result);

  const winners = rows.filter((row) => row.status === "ok" && row.day !== null);
  if (winners.length > MAX_UPSERT_DAYS) {
    const message = `This file has ${winners.length} days. At most ${MAX_UPSERT_DAYS} days can be imported at once: split the file and import it in parts.`;
    return failure("invalid", message, { [IMPORT_FORM_FIELDS.file]: message });
  }
  // Through the database schema, so the comparison below sees each day exactly as it would be stored.
  const days = prayerDaysSchema
    .parse(winners.map((row) => row.day))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const existing =
    days.length === 0 ? [] : await getPrayerDays(days[0].date, days[days.length - 1].date);
  const diff = diffTimetable(existing, days, result.mappedFields);
  return {
    ok: true,
    analysis: { request, result, rows, issues, counts: countIssues(issues), days, existing, diff },
  };
}

/** Whether a file has anything the user must confirm before it is saved. */
function needsAcknowledgement(counts: ImportIssueCounts): boolean {
  return counts.error > 0 || counts.warning > 0;
}

/**
 * Keeps at most `limit` issues without disturbing their order. When some
 * have to go, remarks go before warnings and warnings before errors.
 */
function capIssues(issues: readonly ImportIssue[], limit: number): ImportIssue[] {
  if (issues.length <= limit) return [...issues];
  const keep = new Set<ImportIssue>();
  for (const severity of ["error", "warning", "info"] as const) {
    for (const issue of issues) {
      if (keep.size >= limit) break;
      if (issue.severity === severity) keep.add(issue);
    }
  }
  return issues.filter((issue) => keep.has(issue));
}

/** What saving each imported date does, by date. */
function effectsByDate(diff: TimetableDiff, days: readonly PrayerDay[]): Map<DateString, ImportDayEffect> {
  const effects = new Map<DateString, ImportDayEffect>();
  for (const day of days) effects.set(day.date, "unchanged");
  for (const day of diff.added) effects.set(day.date, "added");
  for (const change of diff.changed) effects.set(change.date, "updated");
  return effects;
}

/** Shapes an analysis into what the import screen shows. */
function toPreview(analysis: ImportAnalysis): ImportPreviewData {
  const { request, result, rows, issues, counts, days, diff } = analysis;
  const effects = effectsByDate(diff, days);
  const previewRows: ImportPreviewRow[] = rows.slice(0, IMPORT_PREVIEW_ROW_LIMIT).map((row) => ({
    ...row,
    effect: row.status === "ok" && row.date !== null ? (effects.get(row.date) ?? null) : null,
  }));
  const shownIssues = capIssues(issues, IMPORT_PREVIEW_ISSUE_LIMIT);
  const mappedFields: MergeField[] = [...result.mappedFields];
  return {
    file: { name: request.file.name, size: request.file.size, format: result.format },
    options: { year: request.year, dateOrder: request.dateOrder, fillDown: request.fillDown },
    sheets: result.sheets,
    mapping: result.mapping,
    mappedFields,
    rows: previewRows,
    totalRows: rows.length,
    rowsTruncated: rows.length > previewRows.length,
    issues: shownIssues,
    issueCounts: counts,
    issuesTruncated: issues.length > shownIssues.length,
    summary: { ...result.summary, warnings: counts.warning },
    diff: {
      added: diff.added.length,
      updated: diff.changed.length,
      unchanged: diff.unchanged,
      changes: diff.changed
        .slice(0, IMPORT_PREVIEW_CHANGE_LIMIT)
        .map((change) => ({ date: change.date, fields: change.fields })),
      changesTruncated: diff.changed.length > IMPORT_PREVIEW_CHANGE_LIMIT,
    },
    canCommit: days.length > 0,
    requiresAcknowledgement: days.length > 0 && needsAcknowledgement(counts),
  };
}

/**
 * Builds the preview of an import: how the file was read, every problem
 * found, and what saving it would add and change. Writes nothing.
 * @param nowMs Clock, epoch milliseconds; decides which year "this year" is.
 * @throws when the database cannot be read.
 */
export async function previewImport(
  request: ImportRequest,
  nowMs: number = Date.now(),
): Promise<ImportPreview> {
  const analysed = await analyseImport(request, nowMs);
  if (!analysed.ok) return analysed;
  return { ok: true, ...toPreview(analysed.analysis) };
}

/** Why a file with no usable day cannot be imported: its first problem, in the importer's words. */
function nothingToImport(issues: readonly ImportIssue[]): ActionFailure {
  const problem = issues.find((issue) => issue.severity === "error");
  const reason = problem ? problem.message : "This file has no days that can be imported.";
  return failure("invalid", `Nothing was imported. ${reason}`, {
    [IMPORT_FORM_FIELDS.file]: reason,
  });
}

/** Asks for the confirmation a file with problems or warnings needs. */
function acknowledgementRequired(counts: ImportIssueCounts): ActionFailure {
  const parts: string[] = [];
  if (counts.error > 0) parts.push(plural(counts.error, "problem"));
  if (counts.warning > 0) parts.push(plural(counts.warning, "warning"));
  const message = `Nothing was imported yet. This file has ${parts.join(" and ")}. Read them, confirm that you want to import the file as it is, then import again.`;
  return failure("confirmation-required", message, {
    [IMPORT_FORM_FIELDS.acknowledgeWarnings]: "Confirm that you have read the warnings.",
  });
}

/**
 * Saves an import. The file is parsed again from its bytes, merged with the
 * stored days (columns the file does not have keep their stored values) and
 * written in one transaction: every day or none. The import is then noted in
 * the import history.
 *
 * Refused when the file holds no usable day, and when it has problems or
 * warnings that `request.acknowledgeWarnings` does not confirm. Importing
 * the same file twice is harmless: the second run reports every day unchanged.
 *
 * @param nowMs Clock, epoch milliseconds.
 * @throws when the database cannot be read or written; nothing is saved then.
 */
export async function commitImport(
  request: ImportRequest,
  nowMs: number = Date.now(),
): Promise<ImportCommitResult> {
  return withTimetableLock(async () => {
    const analysed = await analyseImport(request, nowMs);
    if (!analysed.ok) return analysed;
    const { result, issues, counts, days, existing } = analysed.analysis;
    if (days.length === 0) return nothingToImport(issues);
    if (needsAcknowledgement(counts) && !request.acknowledgeWarnings) {
      return acknowledgementRequired(counts);
    }

    const stored = new Map<DateString, PrayerDay>();
    for (const day of existing) stored.set(day.date, day);
    const merged = days.map((day) => mergeDay(stored.get(day.date), day, result.mappedFields));
    // `replace`: each merged day is already complete, and a cell the file left
    // empty in a column it has must clear the stored time.
    const summary = await upsertPrayerDays(merged, { mode: "replace", nowMs });

    const outcome = {
      added: summary.added,
      updated: summary.updated,
      unchanged: summary.unchanged,
      firstDate: days[0].date,
      lastDate: days[days.length - 1].date,
      warnings: counts.warning,
      fileName: request.file.name,
    };
    try {
      await addImportLog(outcome, nowMs);
    } catch (error) {
      // The timetable is saved. Reporting a failure now would be untrue and
      // would only invite a second import; the missing history line is logged.
      console.error("[action] commitImport saved the days but could not write the import log", error);
    }
    return { ok: true, ...outcome };
  });
}

/**
 * Preview straight from a submitted form: `readImportForm`, then `previewImport`.
 * @throws when the database cannot be read.
 */
export async function previewImportForm(
  formData: unknown,
  nowMs: number = Date.now(),
): Promise<ImportPreview> {
  const form = await readImportForm(formData);
  return form.ok ? previewImport(form.request, nowMs) : form;
}

/**
 * Commit straight from a submitted form: `readImportForm`, then `commitImport`.
 * @throws when the database cannot be read or written.
 */
export async function commitImportForm(
  formData: unknown,
  nowMs: number = Date.now(),
): Promise<ImportCommitResult> {
  const form = await readImportForm(formData);
  return form.ok ? commitImport(form.request, nowMs) : form;
}
