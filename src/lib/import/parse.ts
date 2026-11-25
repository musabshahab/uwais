/**
 * Turning a raw workbook into validated timetable days.
 *
 * Nothing in here throws for bad data: every row that cannot be used, and
 * every assumption made while reading, comes back as an issue worded for the
 * volunteer who uploaded the file.
 */

import { isFriday, yearOf } from "@/lib/time/dates";
import { PRAYERS, TIME_FIELDS, type DateString, type PrayerDay, type TimeField, type TimeString } from "@/lib/types";
import { checkDay, findMissingDates, findTimeJumps } from "./checks";
import { analyseColumns, describeColumn, emptyMapping, listUnusedColumns, reviewMapping, type MappingNote } from "./columns";
import { blankDay, byDate } from "./day";
import { detectDateOrder, parseMonthName, readDateParts, readMonthYear, resolveDate, type DateCellParts } from "./date-cell";
import { detectTable, type DetectedTable } from "./detect";
import { cellText, formatList, formatRowRanges, isBlankCell, plural, quote, shortDate } from "./text";
import { parseTimeCell } from "./time-cell";
import {
  FIELD_LABELS,
  JUMUAH_TARGETS,
  MAPPING_TARGETS,
  MAX_NOTE_LENGTH,
  type ColumnMapping,
  type DateOrder,
  type IgnoredColumn,
  type ImportIssue,
  type ImportResult,
  type ImportRow,
  type ImportSummary,
  type IssueCode,
  type IssueSeverity,
  type MappingTarget,
  type MergeField,
  type ParseOptions,
  type RawCell,
  type RawSheet,
  type RawWorkbook,
  type SheetColumn,
  type SheetReport,
  type TimeCellField,
} from "./types";

/** Most missing dates listed in the summary. */
const MAX_MISSING_DATES = 1000;
/** Most gaps spelled out in the missing-dates message. */
const MAX_LISTED_GAPS = 5;
/** Dates further than this many years from the reference year are probably a wrong year. */
const MAX_YEARS_FROM_REFERENCE = 2;
/** A jamaat column that is empty on at least this share of the rows probably only lists changes. */
const SPARSE_COLUMN_SHARE = 0.5;
/** Title rows longer than this are sentences, not "March 2027", and are not searched for a month. */
const MAX_TITLE_WORDS = 6;
/** A sheet of bare day numbers this long is a whole year starting in January. */
const FULL_YEAR_ROW_COUNTS: readonly number[] = [365, 366];
/** Key in `ParseOptions.mapping` that applies to every sheet without its own entry. */
const ANY_SHEET = "*";

const JAMAAT_FIELDS: ReadonlySet<TimeField> = new Set(PRAYERS.map((prayer) => prayer.jamaatField));

const DATE_ORDER_NAMES: Readonly<Record<DateOrder, string>> = {
  dmy: "day/month/year",
  mdy: "month/day/year",
  ymd: "year/month/day",
};

/** The month and year the next date without them belongs to; carried from row to row and sheet to sheet. */
interface Calendar {
  year: number | null;
  month: number | null;
  /** Day of the month of the last dated row, to notice the start of a new month. */
  lastDay: number | null;
}

/** Words the location of an issue: with the sheet name only when the workbook has several sheets. */
interface Wording {
  /** `Row 14` or `Sheet "March", row 14`. */
  row(sheet: string, rowNumber: number): string;
  /** Prefix for a remark about a whole sheet: empty, or `Sheet "March": `. */
  sheet(sheet: string): string;
}

/** What is known about the sheet being read. */
interface SheetContext {
  sheet: RawSheet;
  table: DetectedTable;
  mapping: ColumnMapping;
  columns: ReadonlyMap<number, SheetColumn>;
  dateOrder: DateOrder;
  date1904: boolean;
  fillDown: boolean;
  wording: Wording;
}

/** The date of one row, or why it has none. */
type RowDate =
  | { kind: "date"; date: DateString }
  /** No date, or text that is not a date. `text` is what the cell holds. */
  | { kind: "none"; text: string; target: MappingTarget }
  /** A month heading inside the data ("February 2027"); the calendar has been moved on. */
  | { kind: "title" }
  /** A day and month that do not exist in the year they fall in. */
  | { kind: "impossible"; text: string; reason: string; target: MappingTarget }
  /** The sheet cannot be dated at all. */
  | { kind: "fatal"; code: "month-unknown" | "year-unknown" };

/** Everything gathered while reading one sheet. */
interface SheetOutcome {
  report: SheetReport;
  rows: ImportRow[];
  issues: ImportIssue[];
  mappingNotes: MappingNote[];
  pmAssumed: Set<TimeCellField>;
}

/** Running tallies of one sheet that end up as one issue each instead of one per row. */
interface SheetTallies {
  /** Rows with a date and no times. */
  withoutTimes: number[];
  /** Rows per column where 12:xx was read as just after midnight. */
  midnight: Map<MappingTarget, number[]>;
  /** Rows whose Jumu'ah times were dropped because the date is not a Friday. */
  jumuahNotFriday: number[];
  filledDown: number;
  /** For each jamaat column, whether each dated row had a time of its own. */
  jamaatPresence: Map<TimeField, boolean[]>;
  /** The last time read in each column, for ditto marks and fill-down. */
  lastTimes: Map<TimeField, TimeString>;
}

/** Builds the wording helper for a workbook. */
function createWording(sheetCount: number): Wording {
  const several = sheetCount > 1;
  return {
    row: (sheet, rowNumber) => (several ? `Sheet "${sheet}", row ${rowNumber}` : `Row ${rowNumber}`),
    sheet: (sheet) => (several ? `Sheet "${sheet}": ` : ""),
  };
}

/** Builds an issue. */
function issue(
  severity: IssueSeverity,
  code: IssueCode,
  message: string,
  sheet: string | null = null,
  rowNumber: number | null = null,
  field?: MappingTarget,
): ImportIssue {
  return field ? { severity, code, message, sheet, rowNumber, field } : { severity, code, message, sheet, rowNumber };
}

/** Whether moving from one month to another crosses New Year (December to January, allowing a missing month). */
function wrapsYear(fromMonth: number, toMonth: number): boolean {
  return fromMonth >= 10 && toMonth <= 3;
}

/** Whether a day number after another one means a new month has begun (31 then 1). */
function startsNewMonth(lastDay: number, day: number): boolean {
  return day < lastDay && (day === 1 || lastDay >= 28);
}

/** Moves the calendar to a named month, stepping into the next year when the months wrap around. */
function moveToMonth(calendar: Calendar, month: number, year: number | null): void {
  if (year !== null) calendar.year = year;
  else if (calendar.month !== null && calendar.year !== null && wrapsYear(calendar.month, month)) calendar.year++;
  if (calendar.month !== month) calendar.lastDay = null;
  calendar.month = month;
}

/** Applies what a sheet's name and title rows say about its month and year. */
function enterSheet(calendar: Calendar, sheetName: string, titles: readonly string[]): void {
  let { month, year } = readMonthYear(sheetName);
  for (const title of titles) {
    if (title.split(/\s+/).length > MAX_TITLE_WORDS) continue;
    const found = readMonthYear(title);
    month = month ?? found.month;
    year = year ?? found.year;
  }
  if (month !== null) {
    moveToMonth(calendar, month, year);
    calendar.lastDay = null;
  } else if (year !== null) {
    calendar.year = year;
  }
}

/** Reads a cell of the month column: a name, a number 1-12, or "March 2027". */
function readMonthCell(cell: RawCell | undefined): { month: number; year: number | null } | null {
  if (typeof cell === "number") return Number.isInteger(cell) && cell >= 1 && cell <= 12 ? { month: cell, year: null } : null;
  if (typeof cell !== "string") return null;
  const named = parseMonthName(cell);
  if (named !== null) return { month: named, year: null };
  const { month, year } = readMonthYear(cell);
  return month === null ? null : { month, year };
}

/** Completes a date that came without a year or month from the calendar, and keeps the calendar in step. */
function completeDate(parts: DateCellParts, text: string, target: MappingTarget, monthCell: RawCell | undefined, calendar: Calendar): RowDate {
  if (parts.kind === "full") {
    calendar.year = parts.year;
    calendar.month = parts.month;
    calendar.lastDay = parts.day;
    const date = resolveDate(parts.year, parts.month, parts.day);
    return date ? { kind: "date", date } : { kind: "none", text, target };
  }
  if (parts.kind === "month") {
    moveToMonth(calendar, parts.month, parts.year);
    return { kind: "title" };
  }
  if (parts.kind !== "month-day" && parts.kind !== "day") return { kind: "none", text, target };

  const fromColumn = readMonthCell(monthCell);
  if (parts.kind === "month-day") {
    moveToMonth(calendar, parts.month, null);
  } else if (fromColumn) {
    moveToMonth(calendar, fromColumn.month, fromColumn.year);
  } else if (calendar.month !== null && calendar.lastDay !== null && startsNewMonth(calendar.lastDay, parts.day)) {
    moveToMonth(calendar, (calendar.month % 12) + 1, null);
  }
  if (calendar.month === null) return { kind: "fatal", code: "month-unknown" };
  if (calendar.year === null) return { kind: "fatal", code: "year-unknown" };
  calendar.lastDay = parts.day;

  const date = resolveDate(calendar.year, calendar.month, parts.day);
  if (date) return { kind: "date", date };
  const monthName = shortDate(`${calendar.year}-${calendar.month < 10 ? "0" : ""}${calendar.month}-01`).slice(2);
  return { kind: "impossible", text, target, reason: `there is no day ${parts.day} in ${monthName}` };
}

/** Works out the date of a row from its date column, or its day and month columns. */
function readRowDate(row: readonly RawCell[], context: SheetContext, calendar: Calendar): RowDate {
  const { mapping } = context;
  const options = { dateOrder: context.dateOrder, date1904: context.date1904 };
  const monthCell = mapping.month === null ? undefined : row[mapping.month];

  // Text in the date column that is not a date; reported unless the day column has the date.
  let unreadable = "";
  if (mapping.date !== null) {
    const cell = row[mapping.date];
    const parts = readDateParts(cell, options);
    if (parts.kind === "invalid" && mapping.day !== null) unreadable = cellText(cell);
    else if (parts.kind !== "empty") return completeDate(parts, cellText(cell), "date", monthCell, calendar);
  }
  if (mapping.day !== null) {
    const cell = row[mapping.day];
    const parts = readDateParts(cell, options);
    if (parts.kind !== "empty" && (parts.kind !== "invalid" || unreadable === "")) {
      return completeDate(parts, cellText(cell), "day", monthCell, calendar);
    }
  }
  // A month heading on a row of its own, in the month column.
  const heading = readMonthCell(monthCell);
  if (heading && unreadable === "") {
    moveToMonth(calendar, heading.month, heading.year);
    return { kind: "title" };
  }
  return { kind: "none", text: unreadable, target: mapping.date !== null ? "date" : "day" };
}

/** Whether a row with no date is a month heading written across the row ("February 2027"). */
function readMonthHeading(row: readonly RawCell[]): { month: number; year: number | null } | null {
  const texts = new Set(row.filter((cell) => !isBlankCell(cell)).map((cell) => cellText(cell)));
  if (texts.size !== 1) return null;
  const parts = readDateParts(Array.from(texts)[0]);
  return parts.kind === "month" ? { month: parts.month, year: parts.year } : null;
}

/** Cleans a note cell: trimmed, formula-escape apostrophe removed, cut to the maximum length. */
function readNote(cell: RawCell | undefined): { note: string | null; truncated: boolean } {
  if (cell === null || cell === undefined || typeof cell === "boolean") return { note: null, truncated: false };
  // Our own CSV export guards notes that start like a formula with an apostrophe.
  const text = cellText(cell).replace(/^'(?=[=+\-@])/, "");
  if (text === "") return { note: null, truncated: false };
  if (text.length <= MAX_NOTE_LENGTH) return { note: text, truncated: false };
  return { note: text.slice(0, MAX_NOTE_LENGTH).trim(), truncated: true };
}

/** The times of one row, with the problems found while reading them. */
interface RowTimes {
  times: Partial<Record<TimeField, TimeString>>;
  jumuah: TimeString[];
  /** Number of cells that held a readable time of their own (not filled from above). */
  ownTimes: number;
  issues: ImportIssue[];
  /** Columns where a 12:xx without AM/PM was read as just after midnight. */
  midnight: MappingTarget[];
  /** For each mapped jamaat column, whether this row had a time of its own. */
  jamaatPresent: Map<TimeField, boolean>;
  filledDown: number;
  pmAssumed: TimeCellField[];
}

/** Reads every mapped time cell of a row. */
function readRowTimes(row: readonly RawCell[], rowNumber: number, context: SheetContext, lastTimes: Map<TimeField, TimeString>): RowTimes {
  const { mapping, sheet, wording } = context;
  const result: RowTimes = { times: {}, jumuah: [], ownTimes: 0, issues: [], midnight: [], jamaatPresent: new Map(), filledDown: 0, pmAssumed: [] };
  const where = (target: MappingTarget) => {
    const column = context.columns.get(mapping[target] ?? -1);
    return `${wording.row(sheet.name, rowNumber)}, ${column ? describeColumn(column) : "unknown column"}`;
  };

  for (const field of TIME_FIELDS) {
    const index = mapping[field];
    if (index === null) continue;
    const cell = parseTimeCell(row[index], field);
    if (cell.issue?.severity === "error") {
      result.issues.push(issue("error", cell.issue.code, `${where(field)}: ${cell.issue.message}`, sheet.name, rowNumber, field));
      continue;
    }
    if (cell.issue) result.midnight.push(field);
    if (cell.adjustment === "pm") result.pmAssumed.push(field);
    if (JAMAAT_FIELDS.has(field)) result.jamaatPresent.set(field, cell.time !== null || cell.ditto);

    let time = cell.time;
    if (time !== null) {
      result.ownTimes++;
    } else if (cell.ditto || (context.fillDown && JAMAAT_FIELDS.has(field))) {
      time = lastTimes.get(field) ?? null;
      if (time !== null && !cell.ditto) result.filledDown++;
      if (time === null && cell.ditto) {
        const message = `${where(field)}: the ditto mark has no time above it to repeat, so the cell was left empty.`;
        result.issues.push(issue("warning", "ditto-without-value", message, sheet.name, rowNumber, field));
      }
    }
    if (time !== null) result.times[field] = time;
  }

  for (const target of JUMUAH_TARGETS) {
    const index = mapping[target];
    if (index === null) continue;
    const cell = parseTimeCell(row[index], "jumuah");
    if (cell.issue?.severity === "error") {
      result.issues.push(issue("error", cell.issue.code, `${where(target)}: ${cell.issue.message}`, sheet.name, rowNumber, target));
    } else if (cell.time !== null) {
      result.jumuah.push(cell.time);
      result.ownTimes++;
      if (cell.adjustment === "pm") result.pmAssumed.push("jumuah");
    }
  }
  return result;
}

/** Reads the data rows of a sheet whose mapping is settled. Returns null when the sheet cannot be dated. */
function readRows(
  context: SheetContext,
  calendar: Calendar,
  tallies: SheetTallies,
  pmAssumed: Set<TimeCellField>,
): { rows: ImportRow[]; fatal: "month-unknown" | "year-unknown" | null } {
  const { sheet, table, mapping, wording } = context;
  const repeatedHeaders = new Set(table.repeatedHeaderRows);
  const rows: ImportRow[] = [];

  for (let index = table.dataStartIndex; index < sheet.rows.length; index++) {
    const row = sheet.rows[index];
    if (row.every((cell) => isBlankCell(cell)) || repeatedHeaders.has(index)) continue;
    const rowNumber = index + 1;
    const rowDate = readRowDate(row, context, calendar);
    if (rowDate.kind === "fatal") return { rows: [], fatal: rowDate.code };
    if (rowDate.kind === "title") continue;

    const read = readRowTimes(row, rowNumber, context, tallies.lastTimes);
    const at = wording.row(sheet.name, rowNumber);

    if (rowDate.kind === "none" && read.ownTimes === 0) {
      const heading = readMonthHeading(row);
      if (heading) {
        moveToMonth(calendar, heading.month, heading.year);
        continue;
      }
      const firstText = cellText(row.find((cell) => !isBlankCell(cell)));
      const message = `${at} was skipped because it has no date and no times (${quote(firstText)}).`;
      const skipped = issue("info", "row-skipped", message, sheet.name, rowNumber);
      rows.push({ sheet: sheet.name, rowNumber, status: "skipped", date: null, day: null, issues: [skipped] });
      continue;
    }

    const issues: ImportIssue[] = [];
    if (rowDate.kind === "none") {
      const message =
        rowDate.text === ""
          ? `${at} has times but no date, so it cannot be imported.`
          : `${at}: ${quote(rowDate.text)} is not a date we can read. Write dates like 2027-01-31 or 31/01/2027.`;
      issues.push(issue("error", rowDate.text === "" ? "date-missing" : "date-invalid", message, sheet.name, rowNumber, rowDate.target));
    } else if (rowDate.kind === "impossible") {
      const message = `${at}: ${quote(rowDate.text)} cannot be right, ${rowDate.reason}.`;
      issues.push(issue("error", "date-invalid", message, sheet.name, rowNumber, rowDate.target));
    }
    issues.push(...read.issues);

    const failed = issues.some((item) => item.severity === "error");
    if (failed || rowDate.kind !== "date") {
      const date = rowDate.kind === "date" ? rowDate.date : null;
      rows.push({ sheet: sheet.name, rowNumber, status: "error", date, day: null, issues });
      continue;
    }

    const day: PrayerDay = { ...blankDay(rowDate.date), ...read.times };
    if (read.jumuah.length > 0) {
      if (isFriday(rowDate.date)) day.jumuah = read.jumuah;
      else tallies.jumuahNotFriday.push(rowNumber);
    }
    const hasTimes = TIME_FIELDS.some((field) => day[field] !== null) || day.jumuah.length > 0;
    if (!hasTimes) {
      tallies.withoutTimes.push(rowNumber);
      rows.push({ sheet: sheet.name, rowNumber, status: "no-times", date: rowDate.date, day: null, issues });
      continue;
    }

    // Only rows that are imported feed the per-column tallies and the fill-down
    // memory: an unfilled row of a template says nothing about how a column is used.
    for (const field of TIME_FIELDS) {
      const time = read.times[field];
      if (time !== undefined) tallies.lastTimes.set(field, time);
    }
    read.jamaatPresent.forEach((present, field) => {
      const column = tallies.jamaatPresence.get(field) ?? [];
      column.push(present);
      tallies.jamaatPresence.set(field, column);
    });
    for (const target of read.midnight) tallies.midnight.set(target, [...(tallies.midnight.get(target) ?? []), rowNumber]);
    for (const field of read.pmAssumed) pmAssumed.add(field);
    tallies.filledDown += read.filledDown;
    if (mapping.note !== null) {
      const { note, truncated } = readNote(row[mapping.note]);
      day.note = note;
      if (truncated) {
        const message = `${at}: the note is longer than ${MAX_NOTE_LENGTH} characters and was cut short.`;
        issues.push(issue("warning", "note-truncated", message, sheet.name, rowNumber, "note"));
      }
    }
    rows.push({ sheet: sheet.name, rowNumber, status: "ok", date: rowDate.date, day, issues });
  }
  return { rows, fatal: null };
}

/** Whether a column of jamaat times has gaps between its values on most rows: a "changes only" column. */
function isSparse(presence: readonly boolean[]): boolean {
  const first = presence.indexOf(true);
  const last = presence.lastIndexOf(true);
  if (first < 0 || first === last) return false;
  const empty = presence.filter((present) => !present).length;
  const gapsInside = presence.slice(first, last).some((present) => !present);
  return gapsInside && empty >= presence.length * SPARSE_COLUMN_SHARE;
}

/** Turns the per-sheet tallies into one issue each. */
function summariseTallies(context: SheetContext, tallies: SheetTallies): ImportIssue[] {
  const { sheet, mapping, wording } = context;
  const prefix = wording.sheet(sheet.name);
  const issues: ImportIssue[] = [];
  const columnName = (target: MappingTarget) => {
    const column = context.columns.get(mapping[target] ?? -1);
    return column ? describeColumn(column) : target;
  };

  tallies.midnight.forEach((rowNumbers, target) => {
    const count = rowNumbers.length;
    const message = `${prefix}${columnName(target)} has ${plural(count, "time")} with an hour of 12 and no AM or PM (${plural(count, "row")}: ${formatRowRanges(rowNumbers)}). ${count === 1 ? "It was" : "They were"} read as just after midnight (00:xx). If that is wrong, write the time with AM or PM.`;
    issues.push(issue("warning", "midnight-assumed", message, sheet.name, rowNumbers[0], target));
  });

  if (tallies.withoutTimes.length > 0) {
    const count = tallies.withoutTimes.length;
    const message = `${prefix}${plural(count, "row")} (${formatRowRanges(tallies.withoutTimes)}) ${count === 1 ? "has" : "have"} a date but no times and ${count === 1 ? "was" : "were"} left out. Times already saved for ${count === 1 ? "that date" : "those dates"} are kept.`;
    issues.push(issue("warning", "rows-without-times", message, sheet.name, tallies.withoutTimes[0]));
  }

  if (!context.fillDown) {
    tallies.jamaatPresence.forEach((presence, field) => {
      if (!isSparse(presence)) return;
      const empty = presence.filter((present) => !present).length;
      const message = `${prefix}${columnName(field)} is empty on ${empty} of ${presence.length} rows. If an empty cell means "same as the row above", import again with "fill empty jamaat times from the row above" switched on.`;
      issues.push(issue("warning", "sparse-jamaat-column", message, sheet.name, null, field));
    });
  }

  if (tallies.filledDown > 0) {
    const message = `${prefix}${plural(tallies.filledDown, "empty jamaat cell")} ${tallies.filledDown === 1 ? "was" : "were"} filled with the time from the row above.`;
    issues.push(issue("info", "cells-filled-down", message, sheet.name));
  }

  if (tallies.jumuahNotFriday.length > 0) {
    const count = tallies.jumuahNotFriday.length;
    const message = `${prefix}Jumu'ah times on ${plural(count, "row")} that ${count === 1 ? "is" : "are"} not a Friday were ignored (${formatRowRanges(tallies.jumuahNotFriday)}).`;
    issues.push(issue("info", "jumuah-not-friday", message, sheet.name, tallies.jumuahNotFriday[0]));
  }
  return issues;
}

/** Applies a caller-supplied mapping, dropping entries that point at columns the sheet does not have. */
function applyOverride(override: Partial<ColumnMapping>, columns: ReadonlyMap<number, SheetColumn>): { mapping: ColumnMapping; invalid: MappingTarget[] } {
  const mapping = emptyMapping();
  const invalid: MappingTarget[] = [];
  for (const target of MAPPING_TARGETS) {
    const index = override[target];
    if (index === null || index === undefined) continue;
    if (columns.has(index)) mapping[target] = index;
    else invalid.push(target);
  }
  return { mapping, invalid };
}

/** The first date in a column whose meaning depends on the date order, for quoting in a message. */
function findAmbiguousDate(values: readonly (RawCell | undefined)[]): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const dayFirst = readDateParts(value, { dateOrder: "dmy" });
    const monthFirst = readDateParts(value, { dateOrder: "mdy" });
    if (dayFirst.kind === "full" && monthFirst.kind === "full" && dayFirst.month !== monthFirst.month) return cellText(value);
    if (dayFirst.kind === "month-day" && monthFirst.kind === "month-day" && dayFirst.month !== monthFirst.month) return cellText(value);
  }
  return "";
}

/** Number of data rows that hold nothing but a day of the month where the date should be. */
function countBareDayRows(sheet: RawSheet, table: DetectedTable, mapping: ColumnMapping): number {
  const index = mapping.date ?? mapping.day;
  if (index === null) return 0;
  let count = 0;
  for (let rowIndex = table.dataStartIndex; rowIndex < sheet.rows.length; rowIndex++) {
    if (readDateParts(sheet.rows[rowIndex][index]).kind === "day") count++;
  }
  return count;
}

/** A report for a sheet that contributes no rows. */
function emptyReport(sheet: RawSheet, table: DetectedTable | null, status: SheetReport["status"]): SheetReport {
  return {
    name: sheet.name,
    status,
    headerRowNumber: table?.headerRowIndex === null || table === null ? null : table.headerRowIndex + 1,
    headerRowCount: table?.headerRowCount ?? 0,
    columns: table?.columns ?? [],
    mapping: emptyMapping(),
    mappingSource: "guessed",
    ignoredColumns: [],
    unmappedColumns: [],
    dateOrder: null,
    rowCount: 0,
  };
}

/** Reads one sheet: finds its table, settles the mapping, reads the rows. */
function parseSheet(sheet: RawSheet, workbook: RawWorkbook, options: ParseOptions, calendar: Calendar, wording: Wording): SheetOutcome {
  const outcome = (report: SheetReport, issues: ImportIssue[]): SheetOutcome => ({ report, rows: [], issues, mappingNotes: [], pmAssumed: new Set() });
  const prefix = wording.sheet(sheet.name);
  const table = detectTable(sheet);
  if (!table) {
    return outcome(emptyReport(sheet, null, "skipped"), [issue("info", "sheet-skipped", `Sheet "${sheet.name}" is empty and was skipped.`, sheet.name)]);
  }

  const columns = new Map(table.columns.map((column) => [column.index, column] as const));
  const override = options.mapping?.[sheet.name] ?? options.mapping?.[ANY_SHEET];
  const issues: ImportIssue[] = [];
  let mapping: ColumnMapping;
  let ignoredColumns: IgnoredColumn[];
  let unmapped: number[];
  let mappingNotes: MappingNote[] = [];
  if (override) {
    const applied = applyOverride(override, columns);
    mapping = applied.mapping;
    ({ ignored: ignoredColumns, unmapped } = listUnusedColumns(table.columns, mapping));
    for (const target of applied.invalid) {
      const message = `${prefix}The column chosen for ${FIELD_OR_TARGET_NAMES[target]} does not exist on this sheet, so it was left unmapped.`;
      issues.push(issue("warning", "mapping-invalid", message, sheet.name, null, target));
    }
  } else {
    const analysis = analyseColumns(table.columns);
    mapping = analysis.mapping;
    ignoredColumns = analysis.ignored;
    unmapped = analysis.unmapped;
    mappingNotes = analysis.notes;
  }

  const report: SheetReport = {
    ...emptyReport(sheet, table, "imported"),
    mapping,
    mappingSource: override ? "provided" : "guessed",
    ignoredColumns,
    unmappedColumns: table.columns.filter((column) => unmapped.includes(column.index)),
  };

  const hasDate = mapping.date !== null || mapping.day !== null;
  const hasTimes = [...TIME_FIELDS, ...JUMUAH_TARGETS].some((target) => mapping[target] !== null);
  if (!hasDate && !hasTimes) {
    const reason = table.headerRowIndex === null ? "no header row with prayer names was found on it" : "its headings are not those of a timetable";
    const message = `Sheet "${sheet.name}" was skipped because ${reason}. If it is a timetable, choose its columns in the column mapping.`;
    return outcome({ ...report, status: "skipped" }, [...issues, issue("info", "sheet-skipped", message, sheet.name)]);
  }
  if (!hasDate) {
    const message = `${prefix}No date column was found, so the rows cannot be matched to days. Add a "Date" column, or choose the date column in the column mapping.`;
    return outcome({ ...report, status: "failed" }, [...issues, issue("error", "no-date-column", message, sheet.name, null, "date")]);
  }
  if (!hasTimes) {
    const message = `${prefix}No prayer time columns were recognised. Check that the headings name the prayers (Fajr, Dhuhr, Asr, Maghrib, Isha), or choose the columns in the column mapping.`;
    return outcome({ ...report, status: "failed" }, [...issues, issue("error", "no-time-columns", message, sheet.name)]);
  }

  enterSheet(calendar, sheet.name, table.titles);
  if (calendar.month === null && mapping.month === null && FULL_YEAR_ROW_COUNTS.includes(countBareDayRows(sheet, table, mapping))) {
    calendar.month = 1;
  }

  const dateValues = mapping.date === null ? [] : sheet.rows.slice(table.dataStartIndex).map((row) => row[mapping.date as number]);
  const detection = detectDateOrder(dateValues);
  const dateOrder = options.dateOrder && options.dateOrder !== "auto" ? options.dateOrder : detection.order;
  report.dateOrder = detection.basis === "none" ? null : dateOrder;
  if (detection.basis === "default" && (!options.dateOrder || options.dateOrder === "auto")) {
    const message = `${prefix}Dates such as ${quote(findAmbiguousDate(dateValues))} can be read two ways. They were read as ${DATE_ORDER_NAMES[dateOrder]}. If that is wrong, choose the other date order and import again.`;
    issues.push(issue("warning", "date-order-assumed", message, sheet.name, null, "date"));
  }

  const context: SheetContext = {
    sheet,
    table,
    mapping,
    columns,
    dateOrder,
    date1904: workbook.date1904 === true,
    fillDown: options.fillDown === true,
    wording,
  };
  const tallies: SheetTallies = {
    withoutTimes: [],
    midnight: new Map(),
    jumuahNotFriday: [],
    filledDown: 0,
    jamaatPresence: new Map(),
    lastTimes: new Map(),
  };
  const pmAssumed = new Set<TimeCellField>();
  const { rows, fatal } = readRows(context, calendar, tallies, pmAssumed);
  if (fatal === "month-unknown") {
    const message = `${prefix}The dates are day numbers only and nothing says which month they belong to. Name the sheet after its month (for example "March 2027"), add a Month column, or write full dates.`;
    return outcome({ ...report, status: "failed" }, [...issues, issue("error", "month-unknown", message, sheet.name, null, "date")]);
  }
  if (fatal === "year-unknown") {
    const message = `${prefix}The dates have no year. Choose the year this timetable is for and import again.`;
    return outcome({ ...report, status: "failed" }, [...issues, issue("error", "year-unknown", message, sheet.name, null, "date")]);
  }

  if (report.unmappedColumns.length > 0) {
    const names = report.unmappedColumns.map((column) => describeColumn(column));
    const message = `${prefix}${names.length === 1 ? "This column was" : "These columns were"} not recognised and left out: ${formatList(names)}.`;
    issues.push(issue("info", "unmapped-columns", message, sheet.name));
  }
  issues.push(...summariseTallies(context, tallies));
  report.rowCount = rows.length;
  return { report, rows, issues, mappingNotes: [...mappingNotes, ...reviewMapping(mapping)], pmAssumed };
}

/** Target names as they read after "the column chosen for". */
const FIELD_OR_TARGET_NAMES: Readonly<Record<MappingTarget, string>> = {
  date: "the date",
  day: "the day of the month",
  month: "the month",
  ...FIELD_LABELS,
  jumuah1: "Jumuah 1",
  jumuah2: "Jumuah 2",
  jumuah3: "Jumuah 3",
  note: "the note",
};

/** `Sheet "A"`, `Sheets "A" and "B"`, `Sheets "A", "B" and 10 more`. */
function nameSheets(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  if (quoted.length === 1) return `Sheet ${quoted[0]}`;
  if (quoted.length <= 3) return `Sheets ${formatList(quoted)}`;
  return `Sheets ${quoted.slice(0, 2).join(", ")} and ${quoted.length - 2} more`;
}

/**
 * Turns mapping remarks into issues. A workbook with a sheet per month would
 * repeat every remark twelve times; identical remarks are reported once,
 * naming the sheets they apply to.
 */
function mergeMappingNotes(outcomes: readonly SheetOutcome[], several: boolean): ImportIssue[] {
  const grouped = new Map<string, { note: MappingNote; sheets: string[] }>();
  for (const { report, mappingNotes } of outcomes) {
    for (const note of mappingNotes) {
      const key = `${note.code}|${note.field ?? ""}|${note.message}`;
      const group = grouped.get(key) ?? { note, sheets: [] };
      group.sheets.push(report.name);
      grouped.set(key, group);
    }
  }
  return Array.from(grouped.values()).map(({ note, sheets }) =>
    issue(note.severity, note.code, several ? `${nameSheets(sheets)}: ${note.message}` : note.message, sheets[0], null, note.field),
  );
}

/** The parts of a day a mapping provides. */
function mappedFieldsOf(mapping: ColumnMapping): MergeField[] {
  const fields: MergeField[] = TIME_FIELDS.filter((field) => mapping[field] !== null);
  if (JUMUAH_TARGETS.some((target) => mapping[target] !== null)) fields.push("jumuah");
  if (mapping.note !== null) fields.push("note");
  return fields;
}

/** Warns about sheets that lack a column the other sheets have: that field will be empty for their dates. */
function compareSheetColumns(imported: readonly SheetOutcome[], allFields: readonly MergeField[]): ImportIssue[] {
  const groups = new Map<string, { missing: MergeField[]; sheets: string[] }>();
  for (const { report } of imported) {
    const own = mappedFieldsOf(report.mapping);
    const missing = allFields.filter((field) => !own.includes(field));
    if (missing.length === 0) continue;
    const key = missing.join("|");
    const group = groups.get(key) ?? { missing, sheets: [] };
    group.sheets.push(report.name);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map(({ missing, sheets }) => {
    const names = formatList(missing.map((field) => (field === "jumuah" ? "Jumu'ah" : field === "note" ? "Note" : FIELD_LABELS[field])));
    const message = `${nameSheets(sheets)} ${sheets.length === 1 ? "has" : "have"} no column for ${names}, unlike the other sheets. ${sheets.length === 1 ? "Its" : "Their"} dates will be imported with ${missing.length === 1 ? "that field" : "those fields"} empty.`;
    return issue("warning", "columns-differ-between-sheets", message, sheets[0]);
  });
}

/** Keeps one row per date (the last one wins) and warns about every row that was replaced. */
function removeDuplicates(rows: readonly ImportRow[], wording: Wording): { winners: Map<DateString, ImportRow>; issues: ImportIssue[] } {
  const winners = new Map<DateString, ImportRow>();
  const issues: ImportIssue[] = [];
  for (const row of rows) {
    if (row.status !== "ok" || !row.day) continue;
    const earlier = winners.get(row.day.date);
    if (earlier) {
      earlier.status = "replaced";
      const message = `${wording.row(row.sheet, row.rowNumber)} has the same date (${shortDate(row.day.date)}) as ${wording.row(earlier.sheet, earlier.rowNumber).replace(/^[RS]/, (letter) => letter.toLowerCase())}. The later row (${row.rowNumber}) is used.`;
      const duplicate = issue("warning", "duplicate-date", message, row.sheet, row.rowNumber, "date");
      row.issues.push(duplicate);
      issues.push(duplicate);
    }
    winners.set(row.day.date, row);
  }
  return { winners, issues };
}

/** Runs the plausibility checks on the final days and attaches each finding to the row it came from. */
function checkDays(days: readonly PrayerDay[], winners: ReadonlyMap<DateString, ImportRow>, wording: Wording): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const report = (date: DateString, code: IssueCode, field: TimeField, text: string) => {
    const row = winners.get(date);
    if (!row) return;
    const found = issue("warning", code, `${wording.row(row.sheet, row.rowNumber)} (${shortDate(date)}): ${text}`, row.sheet, row.rowNumber, field);
    row.issues.push(found);
    issues.push(found);
  };
  for (const day of days) {
    for (const finding of checkDay(day)) report(day.date, finding.code, finding.field, finding.message);
  }
  for (const jump of findTimeJumps(days)) {
    const text =
      jump.shift === 0
        ? `${FIELD_LABELS[jump.field]} is ${jump.current}, but ${jump.previous} the day before. Check that the time is in the right row and has the right AM/PM.`
        : `${FIELD_LABELS[jump.field]} is ${jump.current} and was ${jump.previous} the day before, although the other times moved by an hour, as they do when the clocks change. Check this time.`;
    report(jump.date, "time-jump", jump.field, text);
  }
  return issues;
}

/**
 * Warns once about dates between the first and last day that have no row in
 * the file. Dates whose row failed or had no times are not repeated here:
 * those rows already have an issue of their own.
 */
function reportMissingDates(days: readonly PrayerDay[], rows: readonly ImportRow[]): { dates: DateString[]; issues: ImportIssue[] } {
  if (days.length === 0) return { dates: [], issues: [] };
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const present = new Set<DateString>();
  for (const row of rows) {
    if (row.date !== null && row.date >= first && row.date <= last) present.add(row.date);
  }
  const missing = findMissingDates(Array.from(present).sort(), MAX_MISSING_DATES);
  if (missing.total === 0) return { dates: [], issues: [] };
  const listed = missing.ranges
    .slice(0, MAX_LISTED_GAPS)
    .map(({ from, to }) => (from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`));
  const more = missing.ranges.length > MAX_LISTED_GAPS ? " and more" : "";
  const message = `${plural(missing.total, "date")} between ${shortDate(first)} and ${shortDate(last)} ${missing.total === 1 ? "is" : "are"} not in the file: ${formatList(listed)}${more}.`;
  return { dates: missing.dates, issues: [issue("warning", "missing-dates", message)] };
}

/** Warns once when dates are implausibly far from the year the import is for. */
function reportFarDates(days: readonly PrayerDay[], winners: ReadonlyMap<DateString, ImportRow>, referenceYear: number | undefined, wording: Wording): ImportIssue[] {
  if (referenceYear === undefined) return [];
  const far = days.filter((day) => Math.abs(yearOf(day.date) - referenceYear) > MAX_YEARS_FROM_REFERENCE);
  const first = far.length > 0 ? winners.get(far[0].date) : undefined;
  if (!first) return [];
  const message = `${plural(far.length, "date")} ${far.length === 1 ? "is" : "are"} more than ${MAX_YEARS_FROM_REFERENCE} years away from ${referenceYear}, starting with ${shortDate(far[0].date)} (${wording.row(first.sheet, first.rowNumber).replace(/^[RS]/, (letter) => letter.toLowerCase())}). Check the year in the file.`;
  return [issue("warning", "dates-far-from-year", message, first.sheet, first.rowNumber, "date")];
}

/**
 * A workbook with a sheet per month and no year anywhere fails on every sheet
 * for the same reason. One error for the file says it better than twelve.
 */
function reportYearUnknownOnce(issues: ImportIssue[]): ImportIssue[] {
  if (issues.filter((item) => item.code === "year-unknown").length < 2) return issues;
  const once = issue("error", "year-unknown", "The dates in this file have no year. Choose the year this timetable is for and import again.", null, null, "date");
  return [once, ...issues.filter((item) => item.code !== "year-unknown")];
}

/** Orders issues: whole-file remarks first, then by sheet, then by row. */
function sortIssues(issues: ImportIssue[], sheetOrder: readonly string[]): ImportIssue[] {
  const position = (item: ImportIssue) => (item.sheet === null ? -1 : sheetOrder.indexOf(item.sheet));
  return issues
    .map((item, index) => ({ item, index }))
    .sort((a, b) => position(a.item) - position(b.item) || (a.item.rowNumber ?? 0) - (b.item.rowNumber ?? 0) || a.index - b.index)
    .map(({ item }) => item);
}

/** An `ImportResult` for a workbook that has nothing in it. */
function emptyResult(workbook: RawWorkbook, sheets: SheetReport[], issues: ImportIssue[]): ImportResult {
  const summary: ImportSummary = {
    totalRows: 0,
    validDays: 0,
    errorRows: 0,
    skippedRows: 0,
    warnings: issues.filter((item) => item.severity === "warning").length,
    firstDate: null,
    lastDate: null,
    missingDates: [],
    pmAssumedFields: [],
    dateOrderUsed: null,
  };
  return { format: workbook.format, sheets, mapping: {}, rows: [], issues, days: [], mappedFields: [], summary };
}

/**
 * Reads a timetable out of a workbook.
 *
 * Every sheet that holds a recognisable timetable is imported; sheets named
 * after months are read as one continuous timetable. For each sheet the
 * header is located, the columns are mapped (or the caller's mapping is
 * used), and every row becomes a validated `PrayerDay` or a row with issues.
 *
 * The result is plain JSON. Problems never throw: a file with nothing usable
 * comes back with zero days and at least one error-level issue.
 */
export function parseTimetable(workbook: RawWorkbook, options: ParseOptions = {}): ImportResult {
  if (workbook.sheets.length === 0 || workbook.sheets.every((sheet) => sheet.rows.every((row) => row.every((cell) => isBlankCell(cell))))) {
    return emptyResult(workbook, [], [issue("error", "empty-file", "This file has no rows in it. Check that you picked the right file.")]);
  }

  const issues: ImportIssue[] = [];
  const wanted = options.sheets;
  for (const name of wanted ?? []) {
    if (!workbook.sheets.some((sheet) => sheet.name === name)) {
      issues.push(issue("error", "sheet-not-found", `The file has no sheet called "${name}".`));
    }
  }
  const selected = wanted ? workbook.sheets.filter((sheet) => wanted.includes(sheet.name)) : workbook.sheets;
  const wording = createWording(workbook.sheets.length);
  const calendar: Calendar = { year: options.year ?? null, month: null, lastDay: null };

  const outcomes = selected.map((sheet) => parseSheet(sheet, workbook, options, calendar, wording));
  const imported = outcomes.filter((outcome) => outcome.report.status === "imported");
  const rows = outcomes.flatMap((outcome) => outcome.rows);
  for (const outcome of outcomes) issues.push(...outcome.issues, ...outcome.rows.flatMap((row) => row.issues));
  issues.push(...mergeMappingNotes(imported, workbook.sheets.length > 1));

  const mappedFields = Array.from(new Set(imported.flatMap((outcome) => mappedFieldsOf(outcome.report.mapping))));
  const orderedFields = [...TIME_FIELDS, "jumuah" as const, "note" as const].filter((field) => mappedFields.includes(field));
  issues.push(...compareSheetColumns(imported, orderedFields));

  const duplicates = removeDuplicates(rows, wording);
  issues.push(...duplicates.issues);
  const days = Array.from(duplicates.winners.values())
    .map((row) => row.day)
    .filter((day): day is PrayerDay => day !== null)
    .sort(byDate);

  issues.push(...checkDays(days, duplicates.winners, wording));
  const missing = reportMissingDates(days, rows);
  issues.push(...missing.issues, ...reportFarDates(days, duplicates.winners, options.year, wording));

  const pmAssumedFields = [...TIME_FIELDS, "jumuah" as const].filter((field) => outcomes.some((outcome) => outcome.pmAssumed.has(field)));
  if (pmAssumedFields.length > 0) {
    const names = pmAssumedFields.map((field) => (field === "jumuah" ? "Jumu'ah" : FIELD_LABELS[field]));
    const message = `Times without AM or PM were read as afternoon or evening in ${formatList(names)} (for example 1:15 as 13:15).`;
    issues.push(issue("info", "pm-assumed", message));
  }

  if (days.length === 0 && !issues.some((item) => item.severity === "error")) {
    const found = imported.length > 0;
    const message = found
      ? "No rows with both a date and times were found, so there is nothing to import."
      : "No timetable was found in this file. It needs a header row with a date column and the prayer names (Fajr, Dhuhr, Asr, Maghrib, Isha).";
    issues.push(issue("error", found ? "nothing-to-import" : "no-timetable-found", message));
  }

  const mapping: Record<string, ColumnMapping> = {};
  for (const { report } of outcomes) {
    if (report.columns.length > 0) mapping[report.name] = report.mapping;
  }
  const sorted = sortIssues(reportYearUnknownOnce(issues), workbook.sheets.map((sheet) => sheet.name));
  const summary: ImportSummary = {
    totalRows: rows.length,
    validDays: days.length,
    errorRows: rows.filter((row) => row.status === "error").length,
    skippedRows: rows.filter((row) => row.status === "skipped" || row.status === "no-times").length,
    warnings: sorted.filter((item) => item.severity === "warning").length,
    firstDate: days.length > 0 ? days[0].date : null,
    lastDate: days.length > 0 ? days[days.length - 1].date : null,
    missingDates: missing.dates,
    pmAssumedFields,
    dateOrderUsed: outcomes.map((outcome) => outcome.report.dateOrder).find((order) => order !== null) ?? null,
  };
  return {
    format: workbook.format,
    sheets: outcomes.map((outcome) => outcome.report),
    mapping,
    rows,
    issues: sorted,
    days,
    mappedFields: orderedFields,
    summary,
  };
}
