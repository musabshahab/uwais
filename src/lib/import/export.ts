/**
 * Writing the timetable back out: as CSV, as a tidy Excel workbook, and as a
 * blank template for a year. All three use the same canonical columns, which
 * the importer maps without any help, so a file exported here can be edited
 * and imported again without surprises.
 */

import ExcelJS from "exceljs";
import Papa from "papaparse";
import { dateToUtcMs } from "@/lib/time/dates";
import { TIME_FIELDS, type PrayerDay } from "@/lib/types";
import { blankYear, byDate } from "./day";
import { FIELD_LABELS, MAX_NOTE_LENGTH } from "./types";

/** Options of `toCsv`. */
export interface CsvExportOptions {
  /**
   * Start the text with a byte-order mark. Excel only reads accented and
   * Arabic notes correctly from a CSV file that has one; set it for downloads.
   */
  bom?: boolean;
}

/** Options of `toXlsx`. */
export interface XlsxExportOptions {
  /** Shown as the sheet tab and the document title, e.g. the mosque's name. Defaults to "Timetable". */
  title?: string;
}

/** Options of the template builders. */
export interface TemplateOptions {
  /** The calendar year whose dates are pre-filled. */
  year: number;
}

/** Fewest Jumu'ah columns an export has; more are added when a day has more times. */
const MIN_JUMUAH_COLUMNS = 3;

const DATE_HEADER = "Date";
const NOTE_HEADER = "Note";
const DEFAULT_TITLE = "Timetable";
/** Excel writes and expects CRLF line ends in CSV files. */
const CSV_NEWLINE = "\r\n";
const BYTE_ORDER_MARK = "\ufeff";
const INSTRUCTIONS_SHEET = "Instructions";

/** Shows a date cell as `Fri 1 Jan 2027`: unambiguous in every country, with the weekday for finding Fridays. */
const DATE_NUMBER_FORMAT = "ddd d mmm yyyy";
/** Excel's "Text" format: what is typed stays exactly as typed, so times are never reinterpreted. */
const TEXT_NUMBER_FORMAT = "@";

const DATE_COLUMN_WIDTH = 18;
const TIME_COLUMN_WIDTH = 15;
const NOTE_COLUMN_WIDTH = 40;
const INSTRUCTIONS_COLUMN_WIDTH = 110;

const HEADER_FILL_COLOUR = "FFE8EFEA";
const MAX_SHEET_NAME_LENGTH = 31;

/** Explanations attached to the template's headings. */
const HEADER_NOTES: Readonly<Record<string, string>> = {
  [DATE_HEADER]: "One row per day. The dates are already filled in; please do not change them.",
  Begins: "When the time for this prayer starts. 24-hour clock, for example 05:30 or 17:45.",
  Jamaat: "When the congregation stands for this prayer in the mosque. 24-hour clock, for example 13:15.",
  Sunrise: "Sunrise, the end of the time for Fajr. 24-hour clock, for example 07:58.",
  Jumuah: "Only for a Friday whose Jumu'ah times differ from the usual ones in the website settings. Leave empty otherwise.",
  [NOTE_HEADER]: "Optional short remark shown with the day, for example Eid al-Fitr.",
};

/** The text of the template's instructions sheet, one paragraph per row. */
function instructionLines(year: number): string[] {
  return [
    `Prayer timetable template for ${year}`,
    "",
    "How to fill it in",
    `1. Go to the "${DEFAULT_TITLE}" sheet. There is one row for every day of ${year}.`,
    "2. Type the times in 24-hour format with a colon, for example 05:30, 13:15 or 17:45. Times with am or pm (5:45 pm) are also understood.",
    '3. "Begins" is when the time for a prayer starts. "Jamaat" is when the congregation prays in the mosque.',
    "4. Leave a cell empty when there is no time to show. Rows without any times are skipped when you upload, and whatever is already saved for those days is kept.",
    "5. Fill in the Jumuah columns only for a Friday that differs from the usual Jumu'ah times set in the website settings.",
    '6. "Note" is an optional short remark for the day, for example Eid al-Fitr or Clocks go back.',
    "",
    "Please do not",
    "- rename or reorder the headings in the first row;",
    "- change the dates, or put two rows for the same date;",
    "- merge cells or add totals, titles or blank rows inside the table.",
    "",
    "When you are done",
    "Save the file as an Excel workbook (.xlsx) or as CSV, then upload it in the admin area of the website. You will see a preview with any problems listed before anything is saved.",
    "Uploading the same file again is safe: days that have not changed are left as they are.",
  ];
}

/** Number of Jumu'ah columns needed to hold every day's times. */
function jumuahColumnCount(days: readonly PrayerDay[]): number {
  return days.reduce((most, day) => Math.max(most, day.jumuah.length), MIN_JUMUAH_COLUMNS);
}

/**
 * The header row of an export: `Date`, the eleven time columns, the Jumu'ah
 * columns and `Note`.
 *
 * @param jumuahColumns Number of Jumu'ah columns (three by default).
 */
export function exportHeaders(jumuahColumns: number = MIN_JUMUAH_COLUMNS): string[] {
  const jumuah = Array.from({ length: jumuahColumns }, (_, index) => `Jumuah ${index + 1}`);
  return [DATE_HEADER, ...TIME_FIELDS.map((field) => FIELD_LABELS[field]), ...jumuah, NOTE_HEADER];
}

/** The cells of one day after the date: times as `HH:mm` text, empty strings for missing values. */
function timeCells(day: PrayerDay, jumuahColumns: number): string[] {
  const times = TIME_FIELDS.map((field) => day[field] ?? "");
  const jumuah = Array.from({ length: jumuahColumns }, (_, index) => day.jumuah[index] ?? "");
  return [...times, ...jumuah, day.note ?? ""];
}

/**
 * Writes days as CSV with the canonical header row, ISO dates
 * (`2027-01-31`) and 24-hour `HH:mm` times, sorted by date. Lines end with
 * CRLF as Excel expects. Notes that start like a spreadsheet formula are
 * guarded with a leading apostrophe, which the importer removes again.
 */
export function toCsv(days: readonly PrayerDay[], options: CsvExportOptions = {}): string {
  const jumuahColumns = jumuahColumnCount(days);
  const data = [...days].sort(byDate).map((day) => [day.date, ...timeCells(day, jumuahColumns)]);
  const csv = Papa.unparse({ fields: exportHeaders(jumuahColumns), data }, { newline: CSV_NEWLINE, escapeFormulae: true });
  // papaparse ends a header-only file with a line break and any other file without one.
  return `${options.bom ? BYTE_ORDER_MARK : ""}${csv}${csv.endsWith(CSV_NEWLINE) ? "" : CSV_NEWLINE}`;
}

/** Makes a text usable as an Excel sheet name: no `\ / ? * [ ] :`, at most 31 characters, never empty. */
function toSheetName(title: string): string {
  const cleaned = title
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .slice(0, MAX_SHEET_NAME_LENGTH)
    .trim();
  return cleaned === "" ? DEFAULT_TITLE : cleaned;
}

/** The explanation for a heading, picked by what the heading ends with. */
function headerNote(header: string): string | undefined {
  if (header in HEADER_NOTES) return HEADER_NOTES[header];
  const key = Object.keys(HEADER_NOTES).find((candidate) => header.startsWith(candidate) || header.endsWith(candidate));
  return key ? HEADER_NOTES[key] : undefined;
}

/** What `addTimetableSheet` should add beyond the plain table. */
interface SheetExtras {
  /** Explain each heading in a cell note and guide typing with data validation. */
  guidance: boolean;
}

/**
 * Adds the timetable sheet to a workbook: a frozen, styled header, real date
 * cells in the first column and every other cell formatted as text.
 */
function addTimetableSheet(workbook: ExcelJS.Workbook, name: string, days: readonly PrayerDay[], extras: SheetExtras): void {
  const jumuahColumns = jumuahColumnCount(days);
  const headers = exportHeaders(jumuahColumns);
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });

  sheet.columns = headers.map((header, index) => ({
    header,
    width: index === 0 ? DATE_COLUMN_WIDTH : header === NOTE_HEADER ? NOTE_COLUMN_WIDTH : TIME_COLUMN_WIDTH,
    style: { numFmt: index === 0 ? DATE_NUMBER_FORMAT : TEXT_NUMBER_FORMAT },
  }));

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.numFmt = TEXT_NUMBER_FORMAT;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL_COLOUR } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin" } };
    const note = extras.guidance ? headerNote(String(cell.value)) : undefined;
    if (note) cell.note = note;
  });

  for (const day of [...days].sort(byDate)) {
    // exceljs writes a Date by its UTC fields; UTC midnight is that calendar date in Excel.
    const row = sheet.addRow([new Date(dateToUtcMs(day.date)), ...timeCells(day, jumuahColumns).map((text) => (text === "" ? null : text))]);
    row.getCell(1).alignment = { horizontal: "left" };
    if (extras.guidance) addGuidance(row, headers.length);
  }
}

/** Adds typing hints and gentle validation to the time and note cells of a template row. */
function addGuidance(row: ExcelJS.Row, columnCount: number): void {
  for (let column = 2; column <= columnCount; column++) {
    const isNote = column === columnCount;
    row.getCell(column).dataValidation = isNote
      ? {
          type: "textLength",
          operator: "lessThanOrEqual",
          allowBlank: true,
          formulae: [MAX_NOTE_LENGTH],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Long note",
          error: `Notes longer than ${MAX_NOTE_LENGTH} characters are cut short.`,
        }
      : {
          type: "textLength",
          operator: "between",
          allowBlank: true,
          formulae: [3, 8],
          showInputMessage: true,
          promptTitle: "Time",
          prompt: "24-hour time such as 05:30 or 17:45. Leave empty if there is none.",
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Check this time",
          error: "Please write the time like 05:30 or 17:45.",
        };
  }
}

/** Serialises a workbook to bytes. */
async function toBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/**
 * Writes days as an Excel workbook: one sheet with a frozen header, sensible
 * column widths, real date cells and the times as text (`HH:mm`), so Excel
 * does not reinterpret anything. Rows are sorted by date.
 */
export async function toXlsx(days: readonly PrayerDay[], options: XlsxExportOptions = {}): Promise<Uint8Array> {
  const title = options.title?.trim() || DEFAULT_TITLE;
  const workbook = new ExcelJS.Workbook();
  workbook.title = title;
  addTimetableSheet(workbook, toSheetName(title), days, { guidance: false });
  return toBytes(workbook);
}

/**
 * Builds a blank Excel template for a whole year: every date pre-filled, the
 * time cells formatted as text with typing hints, a note on every heading and
 * an "Instructions" sheet in plain English.
 *
 * @throws RangeError when the year is not an integer from 1 to 9999.
 */
export async function buildTemplateXlsx(options: TemplateOptions): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = `Prayer timetable ${options.year}`;
  addTimetableSheet(workbook, DEFAULT_TITLE, blankYear(options.year), { guidance: true });

  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET);
  instructions.getColumn(1).width = INSTRUCTIONS_COLUMN_WIDTH;
  for (const line of instructionLines(options.year)) {
    const cell = instructions.addRow([line]).getCell(1);
    cell.alignment = { wrapText: true, vertical: "top" };
    // Section headings are the lines that are neither numbered steps, bullets nor sentences.
    if (line !== "" && !/^[\d-]/.test(line) && !line.endsWith(".")) cell.font = { bold: true };
  }
  return toBytes(workbook);
}

/**
 * Builds a blank CSV template for a whole year: the canonical header row and
 * one row per date with every other cell empty.
 *
 * @throws RangeError when the year is not an integer from 1 to 9999.
 */
export function buildTemplateCsv(options: TemplateOptions): string {
  return toCsv(blankYear(options.year));
}
