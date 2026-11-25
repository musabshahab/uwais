/**
 * The thinking behind the import wizard, kept apart from its components:
 * checking a chosen file before it is uploaded, building the form the two
 * import actions read, editing the column mapping, and turning a preview
 * into the words and lists the review step shows.
 */

import {
  IMPORT_FORM_FIELDS,
  MAX_IMPORT_YEAR,
  MIN_IMPORT_YEAR,
  type ImportDateOrderOption,
  type ImportDayChange,
  type ImportMappingOverrides,
  type ImportPreviewData,
  type ImportPreviewRow,
} from "@/lib/actions/types";
import {
  FIELD_LABELS,
  MAPPING_TARGETS,
  TARGET_LABELS,
  type ColumnMapping,
  type FieldChange,
  type ImportIssue,
  type IssueCode,
  type IssueSeverity,
  type MappingTarget,
  type MergeField,
  type SheetColumn,
  type SheetReport,
} from "@/lib/import/types";
import { formatTimeText, isValidTimeString } from "@/lib/time";
import { PRAYERS, TIME_FIELDS, type DateString, type TimeField, type TimeFormat } from "@/lib/types";
import { formatBytes, formatList, plural } from "./text";

// ---------------------------------------------------------------------------
// Choosing a file
// ---------------------------------------------------------------------------

/** The file name endings the file picker offers. */
export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".tsv", ".txt"] as const;

/** The `accept` attribute of the file input. */
export const FILE_ACCEPT = ACCEPTED_EXTENSIONS.join(",");

/** The ending of a file name in lower case, with its dot; empty when there is none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/** What the wizard needs to know about a chosen file. */
export interface SelectedFileInfo {
  name: string;
  size: number;
}

/**
 * Checks a chosen file before any of it is sent: its size against the upload
 * limit and its type by name. A file without an ending is let through; the
 * server judges it by its content.
 * @param maxBytes Largest upload the server accepts.
 * @returns What is wrong, worded for a volunteer, or null when the file can be sent.
 */
export function checkSelectedFile(file: SelectedFileInfo, maxBytes: number): string | null {
  const extension = fileExtension(file.name);
  if (extension === ".xls") {
    return "This is an older Excel file (.xls). Open it in Excel, choose Save As, pick Excel Workbook (.xlsx) and upload that file instead.";
  }
  const accepted: readonly string[] = ACCEPTED_EXTENSIONS;
  if (extension !== "" && !accepted.includes(extension)) {
    return `"${file.name}" is not a kind of file we can read. Upload an Excel workbook (.xlsx) or a CSV file.`;
  }
  if (file.size === 0) return "This file is empty. Check it on your computer and choose it again.";
  if (file.size > maxBytes) {
    return `This file is ${formatBytes(file.size)}, and the largest we can take is ${formatBytes(maxBytes)}. A year of prayer times is usually far smaller: remove pictures and extra sheets, or save the timetable sheet as a CSV file.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The options sent with a preview or a commit
// ---------------------------------------------------------------------------

/** The choices the review step lets the user make. */
export interface ImportOptionsState {
  /** Column choices per sheet, or null to let the importer work the columns out. */
  mapping: ImportMappingOverrides | null;
  /** The year for dates without one, as typed; empty when the file provides it. */
  year: string;
  dateOrder: ImportDateOrderOption;
  fillDown: boolean;
}

/** The options a freshly chosen file starts with: everything worked out from the file. */
export const INITIAL_IMPORT_OPTIONS: ImportOptionsState = {
  mapping: null,
  year: "",
  dateOrder: "auto",
  fillDown: false,
};

/** Whether the year field holds nothing or a complete, acceptable year: only then is a preview worth running. */
export function isYearReady(year: string): boolean {
  const text = year.trim();
  if (text === "") return true;
  if (!/^\d{4}$/.test(text)) return false;
  const value = Number(text);
  return value >= MIN_IMPORT_YEAR && value <= MAX_IMPORT_YEAR;
}

/**
 * The form the import actions read. The preview and the commit are given the
 * very same file and options, so what is saved is what was reviewed.
 * @param acknowledge Commit only: the user has confirmed the warnings.
 */
export function buildImportFormData(file: Blob, options: ImportOptionsState, acknowledge: boolean = false): FormData {
  const form = new FormData();
  form.set(IMPORT_FORM_FIELDS.file, file);
  if (options.mapping !== null) form.set(IMPORT_FORM_FIELDS.mapping, JSON.stringify(options.mapping));
  const year = options.year.trim();
  if (year !== "") form.set(IMPORT_FORM_FIELDS.year, year);
  form.set(IMPORT_FORM_FIELDS.dateOrder, options.dateOrder);
  if (options.fillDown) form.set(IMPORT_FORM_FIELDS.fillDown, "true");
  if (acknowledge) form.set(IMPORT_FORM_FIELDS.acknowledgeWarnings, "true");
  return form;
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

/** Mapping key that applies to every sheet without an entry of its own. */
export const ALL_SHEETS_KEY = "*";

/** A set of mapping targets shown together in the mapping editor. */
export interface MappingGroup {
  id: string;
  title: string;
  targets: readonly MappingTarget[];
}

/** The mapping targets in the order and grouping the editor shows them. */
export const MAPPING_GROUPS: readonly MappingGroup[] = [
  { id: "date", title: "Date", targets: ["date", "day", "month"] },
  ...PRAYERS.slice(0, 1).map((prayer) => ({
    id: prayer.key,
    title: prayer.name,
    targets: [prayer.beginsField, prayer.jamaatField] as const,
  })),
  { id: "sunrise", title: "Sunrise", targets: ["sunrise"] },
  ...PRAYERS.slice(1).map((prayer) => ({
    id: prayer.key,
    title: prayer.name,
    targets: [prayer.beginsField, prayer.jamaatField] as const,
  })),
  { id: "jumuah", title: "Jumu'ah", targets: ["jumuah1", "jumuah2", "jumuah3"] },
  { id: "note", title: "Note", targets: ["note"] },
];

const SHORT_TARGET_LABELS: Partial<Record<MappingTarget, string>> = {
  date: "Full date",
  day: "Day of the month",
  month: "Month",
  sunrise: "Sunrise",
  jumuah1: "1st time",
  jumuah2: "2nd time",
  jumuah3: "3rd time",
  note: "Note",
};

/** The label of a target inside its group: `Begins`, `Jamaat`, `Full date`. */
export function mappingTargetLabel(target: MappingTarget): string {
  const short = SHORT_TARGET_LABELS[target];
  if (short !== undefined) return short;
  return target.endsWith("Begins") ? "Begins" : target.endsWith("Jamaat") ? "Jamaat" : TARGET_LABELS[target];
}

/** The full name of a target, for messages and screen readers: `Fajr Begins`, `Jumu'ah 2`. */
export function mappingTargetName(target: MappingTarget): string {
  if (target === "day") return "Day of the month";
  if (target === "jumuah1" || target === "jumuah2" || target === "jumuah3") return `Jumu'ah ${target.slice(-1)}`;
  return TARGET_LABELS[target];
}

/** How a column reads in a mapping dropdown: its letter, its heading and a sample value. */
export function columnOptionLabel(column: Pick<SheetColumn, "letter" | "label" | "samples">): string {
  const heading = column.label.trim() === "" ? "no heading" : column.label.trim();
  const sample = column.samples.find((value) => value.trim() !== "");
  return sample === undefined ? `${column.letter}: ${heading}` : `${column.letter}: ${heading} (e.g. ${sample})`;
}

/** What is essential in a mapping and whether it is there. */
export interface MappingGaps {
  /** No column gives the date: neither a full date nor a day of the month. */
  dateMissing: boolean;
  /** No column gives any prayer time. */
  timesMissing: boolean;
  /** The time fields without a column. */
  unmatchedTimes: TimeField[];
}

/** Finds what a mapping lacks. A sheet needs a date and at least one time to be imported. */
export function mappingGaps(mapping: ColumnMapping): MappingGaps {
  const unmatchedTimes = TIME_FIELDS.filter((field) => mapping[field] === null);
  return {
    dateMissing: mapping.date === null && mapping.day === null,
    timesMissing: unmatchedTimes.length === TIME_FIELDS.length,
    unmatchedTimes,
  };
}

/** Whether two mappings choose the same column for every target. */
export function mappingsEqual(a: ColumnMapping, b: ColumnMapping): boolean {
  return MAPPING_TARGETS.every((target) => a[target] === b[target]);
}

/** Whether every sheet was read with the same columns, as month-per-sheet workbooks usually are. */
export function mappingsAgree(mapping: Readonly<Record<string, ColumnMapping>>): boolean {
  const all = Object.values(mapping);
  return all.every((entry) => mappingsEqual(entry, all[0]));
}

/**
 * The sheets whose columns the user can correct: those that were read or
 * that look like a timetable but lack something essential.
 */
export function editableSheets(sheets: readonly SheetReport[]): SheetReport[] {
  return sheets.filter((sheet) => sheet.status !== "skipped" && sheet.columns.length > 0);
}

/** One change to the column mapping. */
export interface MappingEdit {
  /** The sheet being edited. */
  sheet: string;
  target: MappingTarget;
  /** The column chosen (0-based), or null for "not in this file". */
  column: number | null;
  /** Apply the edited sheet's columns to every sheet of the workbook. */
  applyToAll: boolean;
}

/**
 * The overrides to send after one change in the mapping editor.
 *
 * The edit starts from the mapping the last preview actually used for the
 * sheet, so everything the user did not touch stays as shown. A column feeds
 * one field at most: choosing a column that another field was using moves it.
 * With `applyToAll` the result is a single entry for every sheet; otherwise
 * the sheet gets an entry of its own and the others keep what they had.
 *
 * @param used      `preview.mapping`: the mapping in force per sheet.
 * @param overrides The overrides sent with that preview, or null.
 */
export function editMapping(
  used: Readonly<Record<string, ColumnMapping>>,
  overrides: ImportMappingOverrides | null,
  edit: MappingEdit,
): ImportMappingOverrides {
  const base = used[edit.sheet];
  const edited: Partial<ColumnMapping> = {};
  for (const target of MAPPING_TARGETS) {
    const current = base?.[target] ?? null;
    edited[target] = edit.column !== null && current === edit.column ? null : current;
  }
  edited[edit.target] = edit.column;

  if (edit.applyToAll) return { [ALL_SHEETS_KEY]: edited };
  const next: ImportMappingOverrides = {};
  for (const [sheet, mapping] of Object.entries(overrides ?? {})) next[sheet] = mapping;
  next[edit.sheet] = edited;
  return next;
}

/**
 * The overrides after switching "use these columns for every sheet" on or
 * off. On: the given sheet's columns become the one entry for all sheets.
 * Off: every sheet keeps the columns it is using now, each as its own entry,
 * so they can then be corrected one by one.
 */
export function setApplyToAll(
  used: Readonly<Record<string, ColumnMapping>>,
  sheet: string,
  applyToAll: boolean,
): ImportMappingOverrides {
  if (applyToAll) {
    const base = used[sheet];
    return base === undefined ? {} : { [ALL_SHEETS_KEY]: { ...base } };
  }
  const next: ImportMappingOverrides = {};
  for (const [name, mapping] of Object.entries(used)) next[name] = { ...mapping };
  return next;
}

// ---------------------------------------------------------------------------
// Which options to offer
// ---------------------------------------------------------------------------

function hasIssue(preview: Pick<ImportPreviewData, "issues">, codes: readonly IssueCode[]): boolean {
  return preview.issues.some((issue) => codes.includes(issue.code));
}

/** Whether the file's dates carry no year, so the user must supply one. */
export function needsYear(preview: Pick<ImportPreviewData, "issues" | "options">): boolean {
  return preview.options.year !== null || hasIssue(preview, ["year-unknown"]);
}

/** Whether the file has numeric dates whose order (day first or month first) matters. */
export function offersDateOrder(preview: Pick<ImportPreviewData, "issues" | "options" | "summary">): boolean {
  return (
    preview.options.dateOrder !== "auto" ||
    preview.summary.dateOrderUsed !== null ||
    hasIssue(preview, ["date-order-assumed", "date-invalid"])
  );
}

/** Whether the file leaves jamaat cells blank between changes, so "same as the row above" is worth offering. */
export function offersFillDown(preview: Pick<ImportPreviewData, "issues" | "options">): boolean {
  return preview.options.fillDown || hasIssue(preview, ["sparse-jamaat-column", "cells-filled-down", "ditto-without-value"]);
}

// ---------------------------------------------------------------------------
// What the file provides
// ---------------------------------------------------------------------------

/** How a mergeable part of a day reads: `Fajr Jamaat`, `Jumu'ah times`, `Note`. */
export function mergeFieldLabel(field: MergeField): string {
  if (field === "jumuah") return "Jumu'ah times";
  if (field === "note") return "Note";
  return FIELD_LABELS[field];
}

const BEGINS_FIELDS: readonly MergeField[] = PRAYERS.map((prayer) => prayer.beginsField);
const JAMAAT_FIELDS: readonly MergeField[] = PRAYERS.map((prayer) => prayer.jamaatField);

function describePrayerFields(provided: ReadonlySet<MergeField>): string[] {
  const begins = BEGINS_FIELDS.filter((field) => provided.has(field));
  const jamaat = JAMAAT_FIELDS.filter((field) => provided.has(field));
  const allBegins = begins.length === BEGINS_FIELDS.length;
  const allJamaat = jamaat.length === JAMAAT_FIELDS.length;
  if (allBegins && allJamaat) return ["begins and jamaat times for all five prayers"];
  const parts: string[] = [];
  if (allBegins) parts.push("begins times for all five prayers");
  else parts.push(...begins.map(mergeFieldLabel));
  if (allJamaat) parts.push("jamaat times for all five prayers");
  else parts.push(...jamaat.map(mergeFieldLabel));
  return parts;
}

/** What a file brings and what it leaves alone. */
export interface ProvidedSummary {
  /** A phrase listing what the file provides, e.g. `jamaat times for all five prayers and notes`. */
  provided: string;
  /** The parts of a day the file does not have; their stored values are kept. */
  kept: string[];
}

/**
 * Describes which parts of a day a file provides. A jamaat-only file is the
 * important case: the user must see that the begins times are not touched.
 */
export function describeProvided(mappedFields: readonly MergeField[]): ProvidedSummary {
  const provided = new Set(mappedFields);
  const parts = describePrayerFields(provided);
  if (provided.has("sunrise")) parts.push("sunrise");
  if (provided.has("jumuah")) parts.push("Jumu'ah times");
  if (provided.has("note")) parts.push("notes");

  const kept: string[] = [];
  const missingBegins = BEGINS_FIELDS.filter((field) => !provided.has(field));
  const missingJamaat = JAMAAT_FIELDS.filter((field) => !provided.has(field));
  if (missingBegins.length === BEGINS_FIELDS.length) kept.push("begins times");
  else kept.push(...missingBegins.map(mergeFieldLabel));
  if (missingJamaat.length === JAMAAT_FIELDS.length) kept.push("jamaat times");
  else kept.push(...missingJamaat.map(mergeFieldLabel));
  if (!provided.has("sunrise")) kept.push("sunrise");

  return { provided: parts.length === 0 ? "no prayer times" : formatList(parts), kept };
}

/** How many sheets were read and how many were left out, as a phrase. */
export function describeSheets(sheets: readonly SheetReport[]): string {
  const imported = sheets.filter((sheet) => sheet.status === "imported").length;
  const failed = sheets.filter((sheet) => sheet.status === "failed").length;
  const skipped = sheets.filter((sheet) => sheet.status === "skipped").length;
  const asides: string[] = [];
  if (failed > 0) asides.push(`${failed} could not be read`);
  if (skipped > 0) asides.push(`${skipped} without a timetable left out`);
  const base = `${plural(imported, "sheet")} read`;
  return asides.length === 0 ? base : `${base}, ${asides.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

/** Which issues the problem list shows. */
export type IssueFilter = "all" | IssueSeverity;

/** How each severity is named and explained to a volunteer. */
export const SEVERITY_TEXT: Readonly<Record<IssueSeverity, { one: string; many: string; meaning: string }>> = {
  error: { one: "error", many: "errors", meaning: "These rows or sheets will be left out." },
  warning: { one: "warning", many: "warnings", meaning: "These are imported, but look unusual. Please check them." },
  info: { one: "note", many: "notes", meaning: "How the file was read. Nothing to fix." },
};

/** The issues of one severity, or all of them, in the order the importer gave them. */
export function filterIssues(issues: readonly ImportIssue[], filter: IssueFilter): ImportIssue[] {
  return filter === "all" ? [...issues] : issues.filter((issue) => issue.severity === filter);
}

/**
 * Where an issue is, as a short label: `Row 13`, `March, row 13`, `Sheet
 * March` or `Whole file`. The sheet is only named when the file has several.
 */
export function issueLocation(issue: Pick<ImportIssue, "sheet" | "rowNumber">, sheetCount: number): string {
  if (issue.sheet === null) return "Whole file";
  if (issue.rowNumber === null) return sheetCount > 1 ? `Sheet ${issue.sheet}` : "Whole sheet";
  return sheetCount > 1 ? `${issue.sheet}, row ${issue.rowNumber}` : `Row ${issue.rowNumber}`;
}

/** The filter the problem list opens on: the most serious kind that is present. */
export function defaultIssueFilter(counts: Readonly<Record<IssueSeverity, number>>): IssueFilter {
  if (counts.error > 0 && counts.warning > 0) return "all";
  if (counts.error > 0) return "error";
  if (counts.warning > 0) return "warning";
  return "all";
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/** The overall state of a reviewed file. */
export interface ImportVerdict {
  tone: "success" | "warning" | "danger";
  title: string;
  detail: string;
}

/**
 * Sums a preview up in one line and one sentence: ready, ready once the
 * warnings are confirmed, nothing new, or not importable (and why).
 */
export function importVerdict(preview: ImportPreviewData): ImportVerdict {
  if (!preview.canCommit) {
    const reason = preview.issues.find((issue) => issue.severity === "error");
    return {
      tone: "danger",
      title: "This file cannot be imported yet",
      detail:
        reason?.message ??
        "No day with a date and at least one prayer time was found. Check the columns below, or try a different file.",
    };
  }
  const { added, updated, unchanged } = preview.diff;
  const days = plural(preview.summary.validDays, "day");
  if (preview.requiresAcknowledgement) {
    const parts: string[] = [];
    if (preview.issueCounts.error > 0) parts.push(plural(preview.issueCounts.error, "error"));
    if (preview.issueCounts.warning > 0) parts.push(plural(preview.issueCounts.warning, "warning"));
    return {
      tone: "warning",
      title: `Check ${formatList(parts)} before you publish`,
      detail: `${days} can be imported. Read the problems below; if the file is right as it is, confirm at the bottom of the page and publish.`,
    };
  }
  if (added === 0 && updated === 0) {
    return {
      tone: "success",
      title: "Nothing would change",
      detail: `All ${days} in this file are already stored with exactly these times (${plural(unchanged, "day")} unchanged). There is no need to publish it again.`,
    };
  }
  return {
    tone: "success",
    title: "This file is ready to publish",
    detail: `${days} were read without any problems. Check the changes below, then publish.`,
  };
}

// ---------------------------------------------------------------------------
// Rows and changes
// ---------------------------------------------------------------------------

/** How a row of the file is labelled in the preview table. */
export interface RowOutcome {
  label: string;
  tone: "neutral" | "accent" | "info" | "warning" | "danger";
}

/** What becomes of a row: new, updated, unchanged, or why it is not imported. */
export function rowOutcome(row: Pick<ImportPreviewRow, "status" | "effect">): RowOutcome {
  if (row.status === "error") return { label: "Left out", tone: "danger" };
  if (row.status === "no-times") return { label: "No times", tone: "warning" };
  if (row.status === "replaced") return { label: "Replaced", tone: "warning" };
  if (row.status === "skipped") return { label: "Skipped", tone: "neutral" };
  if (row.effect === "added") return { label: "New", tone: "accent" };
  if (row.effect === "updated") return { label: "Updated", tone: "info" };
  return { label: "Unchanged", tone: "neutral" };
}

/** Which rows the preview table shows. */
export type RowFilter = "all" | "added" | "updated" | "unchanged" | "left-out";

/** The rows that match a filter, in file order. */
export function filterRows(rows: readonly ImportPreviewRow[], filter: RowFilter): ImportPreviewRow[] {
  if (filter === "all") return [...rows];
  if (filter === "left-out") return rows.filter((row) => row.effect === null);
  return rows.filter((row) => row.effect === filter);
}

/** The changed fields of each updated date, for highlighting cells in the preview table. */
export function changesByDate(changes: readonly ImportDayChange[]): Map<DateString, Map<MergeField, FieldChange>> {
  const byDate = new Map<DateString, Map<MergeField, FieldChange>>();
  for (const change of changes) {
    byDate.set(change.date, new Map(change.fields.map((field) => [field.field, field])));
  }
  return byDate;
}

/** How "no value" reads in the list of changes. */
export const EMPTY_CHANGE_VALUE = "empty";

/**
 * One side of a change as the review shows it: times in the mosque's time
 * format, Jumu'ah times as a list, a note as it is, and "empty" for nothing.
 */
export function formatChangeValue(field: MergeField, value: string | null, timeFormat: TimeFormat): string {
  if (value === null || value.trim() === "") return EMPTY_CHANGE_VALUE;
  if (field === "note") return value;
  return value
    .split(",")
    .map((part) => part.trim())
    .map((part) => (isValidTimeString(part) ? formatTimeText(part, timeFormat) : part))
    .join(", ");
}

/** How many days publishing would touch: the new ones and the changed ones. */
export function daysAffected(diff: Pick<ImportPreviewData["diff"], "added" | "updated">): number {
  return diff.added + diff.updated;
}

/** Number of pages a list of `total` items takes; at least one. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The items of one page (1-based). A page beyond the end gives the last page. */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const last = pageCount(items.length, pageSize);
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  return items.slice((current - 1) * pageSize, current * pageSize);
}
