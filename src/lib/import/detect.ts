/**
 * Finding the timetable inside a sheet. Real files start with the mosque's
 * name, a month title or an empty line, and often split the header over two
 * rows ("Fajr" merged above "Begins | Jama'ah"). This module locates the
 * header, joins a multi-row header into one label per column and describes
 * the columns.
 */

import { classifyLabel, type LabelKind } from "./columns";
import { isWeekdayName, parseMonthName, readDateParts } from "./date-cell";
import { cellText, columnLetter, isBlankCell, normaliseDigits, normaliseLabel } from "./text";
import type { ColumnContent, RawCell, RawSheet, SheetColumn } from "./types";

/** Where the timetable sits on a sheet. */
export interface DetectedTable {
  /** 0-based index of the first header row, or null when the sheet has no recognisable header. */
  headerRowIndex: number | null;
  /** Number of rows the header spans (0 without a header). */
  headerRowCount: number;
  /** 0-based index of the first row after the header. */
  dataStartIndex: number;
  columns: SheetColumn[];
  /** Text of the rows above the header (mosque name, "March 2027", ...), one entry per row. */
  titles: string[];
  /**
   * 0-based indices of rows after the header that are a header again, as in
   * timetables that repeat the headings for every month or printed page.
   */
  repeatedHeaderRows: number[];
}

/** The header is looked for in this many rows from the top. */
const HEADER_SEARCH_ROWS = 25;
/** A header never spans more rows than this. */
const MAX_HEADER_ROWS = 3;
const SAMPLES_PER_COLUMN = 3;
/** Number of values looked at to decide what a column contains. */
const CONTENT_SAMPLE_SIZE = 60;
/** Share of a column's values that must agree for the column to count as that kind. */
const CONTENT_MAJORITY = 0.6;

/** How much each kind of heading says "this row is the header". Prayer names are the strongest sign. */
const KIND_WEIGHT: Readonly<Record<LabelKind, number>> = {
  prayer: 3,
  sunrise: 2,
  jumuah: 2,
  date: 2,
  day: 2,
  month: 2,
  qualifier: 1,
  note: 1,
  ignored: 1,
  unknown: 0,
};

/** What a row looks like to the header search. */
interface RowProfile {
  /** Cells that read as a known heading. */
  recognised: number;
  /** Different headings among them; a merged title repeats one text across the row. */
  distinct: number;
  /** Cells that hold a value rather than a heading (a time, a date, a number). */
  data: number;
  weight: number;
}

/** Whether a cell holds a value (a number, a date, a time) rather than a heading. */
function isDataCell(cell: RawCell): boolean {
  if (typeof cell === "number" || cell instanceof Date) return true;
  if (typeof cell !== "string") return false;
  const text = normaliseDigits(cell).trim();
  if (/^\d+$/.test(text) || /^\d{1,2}\s*[:.]\s*\d{2}/.test(text)) return true;
  const { kind } = readDateParts(text);
  return kind === "full" || kind === "month-day";
}

/** Counts the headings and the values in a row. */
function profileRow(row: readonly RawCell[] | undefined): RowProfile {
  const profile: RowProfile = { recognised: 0, distinct: 0, data: 0, weight: 0 };
  const seen = new Set<string>();
  for (const cell of row ?? []) {
    if (isBlankCell(cell)) continue;
    if (isDataCell(cell)) {
      profile.data++;
      continue;
    }
    const text = cellText(cell);
    const { kind } = classifyLabel(text);
    if (kind === "unknown") continue;
    profile.recognised++;
    profile.weight += KIND_WEIGHT[kind];
    seen.add(normaliseLabel(text));
  }
  profile.distinct = seen.size;
  return profile;
}

/** Whether a row can be the main header row: several different headings and hardly any values. */
function isHeaderProfile(profile: RowProfile): boolean {
  return profile.distinct >= 2 && profile.recognised > profile.data * 2;
}

/** Whether a row can be an additional header row above or below the main one. */
function isCompanionProfile(profile: RowProfile): boolean {
  return profile.data === 0 && profile.distinct >= 2;
}

/** Finds the rows that make up the header: `[first, last]` as 0-based indices, or null. */
function findHeaderRows(rows: readonly RawCell[][]): [number, number] | null {
  let best = -1;
  let bestWeight = 0;
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let index = 0; index < limit; index++) {
    const profile = profileRow(rows[index]);
    if (isHeaderProfile(profile) && profile.weight > bestWeight) {
      best = index;
      bestWeight = profile.weight;
    }
  }
  if (best < 0) return null;

  let last = best;
  while (last - best + 1 < MAX_HEADER_ROWS && isCompanionProfile(profileRow(rows[last + 1]))) last++;
  let first = best;
  if (last - first + 1 < MAX_HEADER_ROWS && first > 0 && isCompanionProfile(profileRow(rows[first - 1]))) first--;
  return [first, last];
}

/**
 * The text a header cell contributes to its column's label. A blank cell
 * under a merged group heading takes the heading to its left, but only when
 * the two belong together ("Fajr" + "Jama'ah", "Jamaat Time" + "Asr"), so a
 * stray "Notes" column does not become "Isha Notes".
 */
function headerPart(row: readonly RawCell[], column: number, lowerLabel: string, isLastRow: boolean): string {
  const own = cellText(row[column]);
  if (own !== "" || isLastRow || lowerLabel === "") return own;
  let left = column - 1;
  while (left >= 0 && isBlankCell(row[left])) left--;
  if (left < 0) return "";
  const group = cellText(row[left]);
  const lowerKind = classifyLabel(lowerLabel).kind;
  const groupKind = classifyLabel(group).kind;
  const prayerOverQualifier = lowerKind === "qualifier" && groupKind === "prayer";
  const qualifierOverPrayer = (lowerKind === "prayer" || lowerKind === "sunrise") && groupKind === "qualifier";
  return prayerOverQualifier || qualifierOverPrayer ? group : "";
}

/** Joins the header rows of one column into a single label, dropping repeats ("Date" merged over two rows). */
function columnLabel(rows: readonly RawCell[][], first: number, last: number, column: number): string {
  const parts: string[] = [];
  for (let rowIndex = last; rowIndex >= first; rowIndex--) {
    const lower = parts.join(" ");
    const part = headerPart(rows[rowIndex], column, lower, rowIndex === last);
    if (part !== "" && part.toLowerCase() !== (parts[0] ?? "").toLowerCase()) parts.unshift(part);
  }
  return parts.join(" ");
}

/** What a single value says about its column. */
function contentOfCell(cell: RawCell): ColumnContent {
  if (typeof cell === "boolean") return "other";
  if (typeof cell === "string") {
    if (isWeekdayName(cell)) return "weekday";
    if (parseMonthName(cell) !== null) return "month";
  }
  const { kind } = readDateParts(cell);
  if (kind === "full" || kind === "month-day") return "date";
  if (kind === "day") return "day-number";
  return kind === "month" ? "month" : "other";
}

/** Describes one column from its values: a few samples and what most of the values are. */
function describeValues(
  rows: readonly RawCell[][],
  dataStart: number,
  column: number,
  headerRows: ReadonlySet<number>,
): { samples: string[]; content: ColumnContent } {
  const samples: string[] = [];
  const counts = new Map<ColumnContent, number>();
  let seen = 0;
  for (let rowIndex = dataStart; rowIndex < rows.length && seen < CONTENT_SAMPLE_SIZE; rowIndex++) {
    const cell = rows[rowIndex][column];
    if (cell === undefined || isBlankCell(cell) || headerRows.has(rowIndex)) continue;
    seen++;
    if (samples.length < SAMPLES_PER_COLUMN) samples.push(cellText(cell));
    const content = contentOfCell(cell);
    counts.set(content, (counts.get(content) ?? 0) + 1);
  }
  if (seen === 0) return { samples, content: "empty" };
  let content: ColumnContent = "other";
  counts.forEach((count, kind) => {
    if (count >= seen * CONTENT_MAJORITY) content = kind;
  });
  return { samples, content };
}

/** The text of a title row: its different cells joined, so a merged title is not repeated. */
function titleText(row: readonly RawCell[]): string {
  const texts: string[] = [];
  for (const cell of row) {
    const text = cellText(cell);
    if (text !== "" && !texts.includes(text)) texts.push(text);
  }
  return texts.join(" ");
}

/**
 * Locates the timetable on a sheet.
 *
 * The header is the row among the first 25 with the most recognised headings
 * and no values; a row of group headings above it or of "Begins / Jama'ah"
 * sub-headings below it is joined in. When no header is found the sheet is
 * still described, with unlabelled columns, so the admin can map it by hand.
 *
 * @returns null when the sheet is empty.
 */
export function detectTable(sheet: RawSheet): DetectedTable | null {
  const { rows } = sheet;
  const firstUsed = rows.findIndex((row) => row.some((cell) => !isBlankCell(cell)));
  if (firstUsed < 0) return null;

  const header = findHeaderRows(rows);
  const dataStart = header ? header[1] + 1 : firstUsed;
  const width = rows.slice(header ? header[0] : firstUsed).reduce((max, row) => Math.max(max, row.length), 0);

  const repeatedHeaderRows: number[] = [];
  if (header) {
    for (let index = dataStart; index < rows.length; index++) {
      if (isCompanionProfile(profileRow(rows[index]))) repeatedHeaderRows.push(index);
    }
  }
  const headerRows = new Set(repeatedHeaderRows);

  const columns: SheetColumn[] = [];
  for (let index = 0; index < width; index++) {
    const label = header ? columnLabel(rows, header[0], header[1], index) : "";
    const { samples, content } = describeValues(rows, dataStart, index, headerRows);
    if (label === "" && content === "empty") continue;
    columns.push({ index, letter: columnLetter(index), label, samples, content });
  }

  const titles = header
    ? rows
        .slice(0, header[0])
        .map(titleText)
        .filter((text) => text !== "")
    : [];
  return {
    headerRowIndex: header ? header[0] : null,
    headerRowCount: header ? header[1] - header[0] + 1 : 0,
    dataStartIndex: dataStart,
    columns,
    titles,
    repeatedHeaderRows,
  };
}
