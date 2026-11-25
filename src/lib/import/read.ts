/**
 * Reading an uploaded file into rows of raw cells. Works out what the file
 * really is from its first bytes (people rename files), decodes CSV in
 * whatever encoding and delimiter Excel produced, and flattens the many
 * shapes of an Excel cell into plain values.
 *
 * Every failure is an `ImportFileError` with a message a volunteer can act
 * on; no library error escapes.
 */

import ExcelJS from "exceljs";
import Papa from "papaparse";
import { IMPORT_LIMITS, ImportFileError } from "./errors";
import { collapseSpaces } from "./text";
import type { RawCell, RawSheet, RawWorkbook } from "./types";

/** An uploaded file: its name (used for the extension and as the CSV sheet name) and its bytes. */
export interface SpreadsheetFile {
  fileName: string;
  data: Uint8Array | ArrayBuffer;
}

/** One file inside a zip archive, as listed in its directory. */
interface ZipEntry {
  name: string;
  /** Size once unpacked, as declared by the archive. */
  size: number;
}

const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
/** Rows looked at to work out the CSV delimiter. */
const DELIMITER_SAMPLE_ROWS = 60;

const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_ENTRY_SIGNATURE = 0x02014b50;
const ZIP_END_MIN_BYTES = 22;
const ZIP_ENTRY_MIN_BYTES = 46;
const ZIP_MAX_COMMENT_BYTES = 0xffff;

const SAVE_AS_HINT = "Open it in Excel, Google Sheets or Numbers, choose Save As (or Download / Export) and pick Excel (.xlsx) or CSV, then upload that file.";

/** Formats we recognise but cannot read, with what to call them. */
const UNSUPPORTED_EXTENSIONS: Readonly<Record<string, string>> = {
  xls: "an old Excel file (.xls)",
  xlsb: "a binary Excel file (.xlsb)",
  ods: "an OpenDocument spreadsheet (.ods)",
  numbers: "an Apple Numbers file",
  pdf: "a PDF",
  doc: "a Word document",
  docx: "a Word document",
};

/** Builds the "we cannot read this kind of file" error. */
function unsupported(what: string): ImportFileError {
  return new ImportFileError("unsupported-format", `This is ${what}, which cannot be imported. ${SAVE_AS_HINT}`);
}

/** The lower-case extension of a file name, without the dot. */
function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

/** A file name without its folder and extension, used as the sheet name of a CSV file. */
function baseName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? "";
  return collapseSpaces(name.replace(/\.[A-Za-z0-9]+$/, "")) || "Sheet1";
}

/** Whether the bytes start with the given signature. */
function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Lists the files inside a zip archive by reading its directory, without
 * unpacking anything. Returns null when the directory cannot be read (the
 * archive is damaged, or uses the zip64 extension no timetable needs).
 */
function listZipEntries(bytes: Uint8Array): ZipEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - ZIP_END_MIN_BYTES - ZIP_MAX_COMMENT_BYTES);
  let end = -1;
  for (let offset = bytes.length - ZIP_END_MIN_BYTES; offset >= lowest; offset--) {
    if (view.getUint32(offset, true) === ZIP_END_SIGNATURE) {
      end = offset;
      break;
    }
  }
  if (end < 0) return null;

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff) return null;

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (offset + ZIP_ENTRY_MIN_BYTES > bytes.length || view.getUint32(offset, true) !== ZIP_ENTRY_SIGNATURE) return null;
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameEnd = offset + ZIP_ENTRY_MIN_BYTES + nameLength;
    if (nameEnd > bytes.length) return null;
    entries.push({ name: decoder.decode(bytes.subarray(offset + ZIP_ENTRY_MIN_BYTES, nameEnd)), size });
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

/**
 * Checks a zip archive before it is unpacked: it must be an Excel workbook,
 * and one of a sane size. A workbook with styling on a million empty rows is
 * tiny on disk and would exhaust the server's memory.
 */
function checkWorkbookArchive(entries: readonly ZipEntry[]): void {
  const names = entries.map((entry) => entry.name);
  if (!names.includes("xl/workbook.xml")) {
    if (names.includes("xl/workbook.bin")) throw unsupported("a binary Excel file (.xlsb)");
    if (names.includes("content.xml")) throw unsupported("an OpenDocument spreadsheet (.ods)");
    if (names.some((name) => name.startsWith("Index/") || name.endsWith(".iwa"))) throw unsupported("an Apple Numbers file");
    if (names.some((name) => name.startsWith("word/"))) throw unsupported("a Word document");
    throw unsupported("not a spreadsheet");
  }
  const sheetCount = names.filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).length;
  if (sheetCount > IMPORT_LIMITS.maxSheets) throw tooManySheets(sheetCount);
  const unzipped = entries.reduce((total, entry) => total + entry.size, 0);
  if (unzipped > IMPORT_LIMITS.maxUnzippedBytes) {
    throw new ImportFileError(
      "file-too-large",
      "This workbook is far larger inside than a timetable needs to be, usually because formatting was applied to thousands of empty rows. Copy just the timetable into a new workbook, save it as .xlsx or .csv and upload that.",
    );
  }
}

/** Builds the "too many sheets" error. */
function tooManySheets(count: number): ImportFileError {
  return new ImportFileError(
    "too-many-sheets",
    `This workbook has ${count} sheets; the most we can import is ${IMPORT_LIMITS.maxSheets}. Remove the sheets that are not part of the timetable and upload it again.`,
  );
}

/** Builds the "sheet too long" error. */
function tooManyRows(sheetName: string, count: number): ImportFileError {
  return new ImportFileError(
    "too-many-rows",
    `"${sheetName}" has ${count} rows; the most we can import is ${IMPORT_LIMITS.maxRowsPerSheet}. Split the timetable into smaller files, for example one per year.`,
  );
}

/** Builds the "sheet too wide" error. */
function tooManyColumns(sheetName: string, count: number): ImportFileError {
  return new ImportFileError(
    "too-many-columns",
    `"${sheetName}" has ${count} columns; the most we can import is ${IMPORT_LIMITS.maxColumnsPerSheet}. Remove the columns that are not part of the timetable and upload it again.`,
  );
}

/** Trims text and turns an empty string into an empty cell. */
function textCell(text: string): RawCell {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** Removes empty cells from the end of each row and empty rows from the end of the sheet. */
function trimSheet(rows: RawCell[][]): RawCell[][] {
  for (const row of rows) {
    while (row.length > 0 && row[row.length - 1] === null) row.pop();
  }
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

/** Enforces the row and column limits on a sheet. */
function checkSheetSize(sheet: RawSheet): void {
  if (sheet.rows.length > IMPORT_LIMITS.maxRowsPerSheet) throw tooManyRows(sheet.name, sheet.rows.length);
  const widest = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (widest > IMPORT_LIMITS.maxColumnsPerSheet) throw tooManyColumns(sheet.name, widest);
}

/**
 * Decodes the bytes of a text file. Honours a byte-order mark, expects UTF-8
 * and falls back to Windows-1252, which is what Excel on Windows writes when
 * asked for plain "CSV".
 */
function decodeText(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Works out which delimiter a CSV text uses. The right one splits the most
 * rows into the same number of fields. Agreement between rows counts before
 * the number of fields: a note such as "a; b; c" splits its own row into many
 * pieces, but the header row does not follow it, whereas the real delimiter
 * splits header and data alike. Title rows above the table do not matter
 * either, because they fall outside the most common width.
 */
function sniffDelimiter(text: string): string {
  let best: string = CSV_DELIMITERS[0];
  let bestRows = 0;
  let bestWidth = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const sample = Papa.parse<string[]>(text, { delimiter, preview: DELIMITER_SAMPLE_ROWS, skipEmptyLines: true });
    const rowsByWidth = new Map<number, number>();
    for (const row of sample.data) {
      if (row.length > 1) rowsByWidth.set(row.length, (rowsByWidth.get(row.length) ?? 0) + 1);
    }
    let rows = 0;
    let width = 0;
    rowsByWidth.forEach((rowCount, rowWidth) => {
      if (rowCount > rows || (rowCount === rows && rowWidth > width)) {
        rows = rowCount;
        width = rowWidth;
      }
    });
    if (rows > bestRows || (rows === bestRows && width > bestWidth)) {
      best = delimiter;
      bestRows = rows;
      bestWidth = width;
    }
  }
  return best;
}

/** Reads a delimited text file (CSV, TSV, semicolon- or pipe-separated) as a single sheet. */
function readDelimitedText(bytes: Uint8Array, fileName: string): RawWorkbook {
  let text: string;
  try {
    text = decodeText(bytes);
  } catch {
    throw new ImportFileError("unreadable-file", `We could not read the text in this file. ${SAVE_AS_HINT}`);
  }
  if (text.includes("\u0000")) throw unsupported("not a spreadsheet we recognise");

  const parsed = Papa.parse<string[]>(text, { delimiter: sniffDelimiter(text), skipEmptyLines: false });
  const rows = trimSheet(parsed.data.map((row) => row.map(textCell)));
  const sheet: RawSheet = { name: baseName(fileName), rows };
  checkSheetSize(sheet);
  return { format: "csv", sheets: [sheet] };
}

/**
 * Flattens an Excel cell value: formulas give their last calculated result,
 * rich text and hyperlinks give their text, error values (#N/A) give an
 * empty cell. Dates stay `Date` objects (UTC midnight for a date, a moment
 * on Excel's day zero for a bare time).
 */
function toRawCell(value: unknown): RawCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return textCell(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value instanceof Date) return value;
  if (typeof value !== "object") return null;
  const cell = value as { error?: unknown; richText?: unknown; text?: unknown; formula?: unknown; sharedFormula?: unknown; result?: unknown };
  if (cell.error !== undefined) return null;
  if (Array.isArray(cell.richText)) {
    return textCell(cell.richText.map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text : "")).join(""));
  }
  if (cell.text !== undefined) return toRawCell(cell.text);
  if (cell.formula !== undefined || cell.sharedFormula !== undefined) return toRawCell(cell.result);
  return null;
}

/**
 * Reads the cells of one worksheet; merged cells carry their value into
 * every cell they cover. Cells beyond the size limits are counted but not
 * kept, so an absurd sheet fails with a clear error instead of filling memory.
 */
function readWorksheet(worksheet: ExcelJS.Worksheet): RawSheet {
  const rows: RawCell[][] = [];
  let lastRow = 0;
  let widest = 0;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: RawCell[] = [];
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const value = toRawCell(cell.value);
      if (value === null) return;
      lastRow = Math.max(lastRow, rowNumber);
      widest = Math.max(widest, columnNumber);
      if (columnNumber > IMPORT_LIMITS.maxColumnsPerSheet) return;
      while (cells.length < columnNumber - 1) cells.push(null);
      cells[columnNumber - 1] = value;
    });
    if (cells.length === 0 || rowNumber > IMPORT_LIMITS.maxRowsPerSheet) return;
    // Rows keep their Excel position so messages can name the row the user sees.
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  });
  if (lastRow > IMPORT_LIMITS.maxRowsPerSheet) throw tooManyRows(worksheet.name, lastRow);
  if (widest > IMPORT_LIMITS.maxColumnsPerSheet) throw tooManyColumns(worksheet.name, widest);
  return { name: worksheet.name, rows: trimSheet(rows) };
}

/** Reads an Excel workbook: every visible sheet, in tab order. */
async function readWorkbook(bytes: Uint8Array): Promise<RawWorkbook> {
  const entries = listZipEntries(bytes);
  if (entries) checkWorkbookArchive(entries);

  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs wants an ArrayBuffer of exactly the file; the upload may be a view into a larger one.
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  } catch {
    throw new ImportFileError(
      "unreadable-file",
      "We could not open this Excel file. It may be damaged or protected with a password. Open it in Excel, save a fresh copy as .xlsx (without a password) and upload that.",
    );
  }
  if (workbook.worksheets.length > IMPORT_LIMITS.maxSheets) throw tooManySheets(workbook.worksheets.length);

  const sheets: RawSheet[] = [];
  for (const worksheet of workbook.worksheets) {
    if (worksheet.state !== "visible") continue;
    sheets.push(readWorksheet(worksheet));
  }
  return { format: "xlsx", sheets, date1904: workbook.properties.date1904 === true };
}

/**
 * Reads an uploaded spreadsheet into raw rows.
 *
 * The format is decided by the file's first bytes and only then by its
 * extension. Excel workbooks (.xlsx) and delimited text (.csv, .tsv, .txt;
 * comma, semicolon, tab or pipe; UTF-8, UTF-16 or Windows-1252) are read;
 * hidden sheets are skipped. Cell text is trimmed and empty cells are null.
 *
 * @throws ImportFileError for empty, oversized, damaged or unsupported files
 *         (old .xls, .ods, Numbers, PDF) and for sheets beyond the row and
 *         column limits in `IMPORT_LIMITS`.
 */
export async function readSpreadsheet(file: SpreadsheetFile): Promise<RawWorkbook> {
  const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
  if (bytes.length === 0) throw new ImportFileError("empty-file", "This file is empty. Check that you picked the right file.");
  if (bytes.length > IMPORT_LIMITS.maxFileBytes) {
    const megabytes = IMPORT_LIMITS.maxFileBytes / (1024 * 1024);
    throw new ImportFileError(
      "file-too-large",
      `This file is larger than ${megabytes} MB. A timetable is normally far smaller: remove pictures and unused sheets, or save just the timetable as CSV.`,
    );
  }

  // A zip archive: "PK" followed by a local file header, or by the end record of an empty archive.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return readWorkbook(bytes);
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw unsupported("an old Excel file (.xls) or a password-protected workbook");
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) throw unsupported("a PDF");

  const extension = extensionOf(file.fileName);
  if (extension === "xlsx" || extension === "xlsm") {
    throw new ImportFileError("unreadable-file", `This file is named like an Excel workbook but is not one. ${SAVE_AS_HINT}`);
  }
  if (extension in UNSUPPORTED_EXTENSIONS) throw unsupported(UNSUPPORTED_EXTENSIONS[extension]);
  return readDelimitedText(bytes, file.fileName);
}
