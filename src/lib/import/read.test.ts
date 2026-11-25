import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS, ImportFileError, isImportFileError, type ImportFileErrorCode } from "./errors";
import { readSpreadsheet } from "./read";
import type { RawCell, RawWorkbook } from "./types";

const encoder = new TextEncoder();

/** Reads CSV text as if it had been uploaded. */
function readCsv(text: string, fileName = "timetable.csv"): Promise<RawWorkbook> {
  return readSpreadsheet({ fileName, data: encoder.encode(text) });
}

/** The rows of the only sheet of a CSV text. */
async function csvRows(text: string): Promise<RawCell[][]> {
  return (await readCsv(text)).sheets[0].rows;
}

/** Builds an .xlsx file in memory. */
async function buildXlsx(build: (workbook: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Builds an .xlsx file and reads it back through the importer. */
async function readXlsx(build: (workbook: ExcelJS.Workbook) => void): Promise<RawWorkbook> {
  return readSpreadsheet({ fileName: "timetable.xlsx", data: await buildXlsx(build) });
}

/** The error `readSpreadsheet` rejects with; fails the test when it resolves or throws anything else. */
async function fileError(fileName: string, data: Uint8Array | ArrayBuffer): Promise<ImportFileError> {
  try {
    await readSpreadsheet({ fileName, data });
  } catch (error) {
    if (error instanceof ImportFileError) return error;
    throw new Error(`Expected an ImportFileError, got ${String(error)}`);
  }
  throw new Error("Expected readSpreadsheet to fail");
}

/**
 * A zip archive that only consists of its directory: enough for the checks
 * the importer makes before unpacking anything.
 */
function fakeZip(entries: readonly { name: string; size: number }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint32(24, entry.size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    chunks.push(local);
    directory.push(central);
    offset += local.length;
  }
  const directorySize = directory.reduce((total, chunk) => total + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  const all = [...chunks, ...directory, end];
  const bytes = new Uint8Array(all.reduce((total, chunk) => total + chunk.length, 0));
  let position = 0;
  for (const chunk of all) {
    bytes.set(chunk, position);
    position += chunk.length;
  }
  return bytes;
}

describe("readSpreadsheet: CSV", () => {
  it("reads a plain CSV file into one sheet named after the file", async () => {
    const workbook = await readCsv("Date,Fajr,Zuhr\n2027-01-01,06:25,12:09\n", "uploads/March 2027.csv");
    expect(workbook).toEqual({
      format: "csv",
      sheets: [{ name: "March 2027", rows: [["Date", "Fajr", "Zuhr"], ["2027-01-01", "06:25", "12:09"]] }],
    });
  });

  it("takes the sheet name from a Windows path too, and has a default", async () => {
    expect((await readCsv("a,b\n1,2", "C:\\Users\\imam\\Desktop\\Ramadan.CSV")).sheets[0].name).toBe("Ramadan");
    expect((await readCsv("a,b\n1,2", ".csv")).sheets[0].name).toBe("Sheet1");
  });

  it("strips a byte-order mark", async () => {
    const rows = await csvRows("\ufeffDate,Fajr\n2027-01-01,06:25");
    expect(rows[0][0]).toBe("Date");
  });

  it("accepts CRLF and bare CR line endings", async () => {
    const expected = [["Date", "Fajr"], ["2027-01-01", "06:25"], ["2027-01-02", "06:25"]];
    expect(await csvRows("Date,Fajr\r\n2027-01-01,06:25\r\n2027-01-02,06:25\r\n")).toEqual(expected);
    expect(await csvRows("Date,Fajr\r2027-01-01,06:25\r2027-01-02,06:25")).toEqual(expected);
  });

  it("drops trailing empty lines and trailing empty cells but keeps blank lines inside", async () => {
    const rows = await csvRows("Title,,,\n,,,\nDate,Fajr,,\n2027-01-01,06:25,,\n,,,\n\n\n");
    expect(rows).toEqual([["Title"], [], ["Date", "Fajr"], ["2027-01-01", "06:25"]]);
  });

  it("keeps row positions, so a row's index is its line number in Excel", async () => {
    const rows = await csvRows("Masjid\n\n\nDate,Fajr\n2027-01-01,06:25");
    expect(rows[3]).toEqual(["Date", "Fajr"]);
    expect(rows[4]).toEqual(["2027-01-01", "06:25"]);
  });

  it("reads quoted fields with commas, quotes and line breaks", async () => {
    const rows = await csvRows('Date,Note\n2027-01-01,"Eid, ""big"" day"\n2027-01-02,"two\nlines"\n');
    expect(rows[1]).toEqual(["2027-01-01", 'Eid, "big" day']);
    expect(rows[2]).toEqual(["2027-01-02", "two\nlines"]);
  });

  it("trims cells and turns empty ones into null", async () => {
    const rows = await csvRows("Date , Fajr ,Note\n 2027-01-01 ,,  \n");
    expect(rows).toEqual([["Date", "Fajr", "Note"], ["2027-01-01"]]);
    expect((await csvRows("a,b,c\n1,,3"))[1]).toEqual(["1", null, "3"]);
  });

  it.each([
    ["semicolons", ";"],
    ["tabs", "\t"],
    ["pipes", "|"],
  ])("detects %s as the delimiter", async (_name, delimiter) => {
    const text = [["Date", "Fajr", "Zuhr"], ["2027-01-01", "06:25", "12:09"], ["2027-01-02", "06:25", "12:09"]].map((row) => row.join(delimiter)).join("\n");
    expect(await csvRows(text)).toEqual([["Date", "Fajr", "Zuhr"], ["2027-01-01", "06:25", "12:09"], ["2027-01-02", "06:25", "12:09"]]);
  });

  it("detects the delimiter despite title rows and commas inside the cells", async () => {
    const text = ["Masjid Uwais, London", "Prayer times, March", "", "Date;Fajr;Zuhr", "1;5,30;12,15", "2;5,28;12,15", "3;5,26;12,15"].join("\n");
    const rows = await csvRows(text);
    expect(rows[0]).toEqual(["Masjid Uwais, London"]);
    expect(rows[3]).toEqual(["Date", "Fajr", "Zuhr"]);
    expect(rows[4]).toEqual(["1", "5,30", "12,15"]);
  });

  it("is not thrown off by commas in a quoted note column", async () => {
    const text = 'Date,Fajr,Note\n2027-01-01,06:25,"a; b; c; d; e; f"\n2027-01-02,06:25,"g; h; i; j; k; l"\n';
    expect((await csvRows(text))[1]).toEqual(["2027-01-01", "06:25", "a; b; c; d; e; f"]);
  });

  it("reads a single-column file", async () => {
    expect(await csvRows("Date\n2027-01-01\n")).toEqual([["Date"], ["2027-01-01"]]);
  });

  it("falls back to Windows-1252 when the bytes are not valid UTF-8", async () => {
    // "Date,Note\n2027-01-01,Fête – école" as Excel on Windows saves it: ê = EA, – = 96, é = E9.
    const head = Array.from(encoder.encode("Date,Note\n2027-01-01,F"));
    const bytes = new Uint8Array([...head, 0xea, 0x74, 0x65, 0x20, 0x96, 0x20, 0xe9, 0x63, 0x6f, 0x6c, 0x65]);
    const workbook = await readSpreadsheet({ fileName: "t.csv", data: bytes });
    expect(workbook.sheets[0].rows[1]).toEqual(["2027-01-01", "Fête – école"]);
  });

  it("keeps UTF-8 text intact, including Arabic", async () => {
    expect((await csvRows("Date,Note\n2027-01-01,عيد الفطر – Eid al-Fiṭr"))[1][1]).toBe("عيد الفطر – Eid al-Fiṭr");
  });

  it('reads the UTF-16 "Unicode Text" export of Excel', async () => {
    const text = "Date\tFajr\r\n2027-01-01\t06:25\r\n";
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let index = 0; index < text.length; index++) bytes[2 + index * 2] = text.charCodeAt(index);
    const workbook = await readSpreadsheet({ fileName: "t.txt", data: bytes });
    expect(workbook.sheets[0].rows).toEqual([["Date", "Fajr"], ["2027-01-01", "06:25"]]);
  });

  it("reads delimited text whatever the extension", async () => {
    for (const fileName of ["t.tsv", "t.txt", "t", "t.dat"]) {
      const workbook = await readSpreadsheet({ fileName, data: encoder.encode("Date\tFajr\n2027-01-01\t06:25") });
      expect(workbook.format).toBe("csv");
      expect(workbook.sheets[0].rows[1]).toEqual(["2027-01-01", "06:25"]);
    }
  });

  it("accepts an ArrayBuffer and a view into a larger buffer", async () => {
    const bytes = encoder.encode("xxxxDate,Fajr\n2027-01-01,06:25yyyy");
    const view = bytes.subarray(4, bytes.length - 4);
    expect((await readSpreadsheet({ fileName: "t.csv", data: view })).sheets[0].rows[0]).toEqual(["Date", "Fajr"]);
    const buffer = encoder.encode("Date,Fajr\n2027-01-01,06:25").buffer;
    expect((await readSpreadsheet({ fileName: "t.csv", data: buffer })).sheets[0].rows[0]).toEqual(["Date", "Fajr"]);
  });
});

describe("readSpreadsheet: XLSX", () => {
  it("reads values by type and keeps dates as Date objects", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("March");
      sheet.addRow(["Date", "Fajr", "Zuhr", "Asr", "Flag"]);
      const row = sheet.addRow([new Date(Date.UTC(2027, 2, 1)), new Date(Date.UTC(1899, 11, 30, 5, 30)), 0.5, "  3:05 ", true]);
      row.getCell(1).numFmt = "dd/mm/yyyy";
      row.getCell(2).numFmt = "h:mm";
    });
    expect(workbook.format).toBe("xlsx");
    expect(workbook.date1904).toBe(false);
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0].name).toBe("March");
    const [, row] = workbook.sheets[0].rows;
    expect(row[0]).toEqual(new Date(Date.UTC(2027, 2, 1)));
    // The exceljs quirk the parsers rely on: a bare time is a moment on 1899-12-30, in UTC.
    expect(row[1]).toEqual(new Date(Date.UTC(1899, 11, 30, 5, 30)));
    expect(row.slice(2)).toEqual([0.5, "3:05", true]);
  });

  it("delivers a number in a time-formatted cell as a Date and one in a general cell as a number", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("S");
      sheet.getCell("A1").value = 0.25;
      sheet.getCell("A1").numFmt = "h:mm AM/PM";
      sheet.getCell("B1").value = 0.25;
    });
    expect(workbook.sheets[0].rows[0]).toEqual([new Date(Date.UTC(1899, 11, 30, 6, 0)), 0.25]);
  });

  it("resolves formulas to their cached result, and to nothing when the result is an error or missing", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("S");
      sheet.getCell("A1").value = { formula: "B1+TIME(0,20,0)", result: 0.243055555 };
      sheet.getCell("B1").value = { formula: 'TEXT(A1,"hh:mm")', result: "05:50" };
      sheet.getCell("C1").value = { formula: "1/0", result: { error: "#DIV/0!" } };
      sheet.getCell("D1").value = { formula: "A1" };
      sheet.getCell("E1").value = { formula: "DATE(2027,3,1)", result: new Date(Date.UTC(2027, 2, 1)) };
      sheet.getCell("E1").numFmt = "dd/mm/yyyy";
      sheet.getCell("F1").value = "end";
    });
    expect(workbook.sheets[0].rows[0]).toEqual([0.243055555, "05:50", null, null, new Date(Date.UTC(2027, 2, 1)), "end"]);
  });

  it("flattens rich text and hyperlinks to their text and drops error values", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("S");
      sheet.getCell("A1").value = { richText: [{ text: "5:" }, { text: "45", font: { bold: true } }] };
      sheet.getCell("B1").value = { text: "Fajr", hyperlink: "https://example.org/fajr" };
      sheet.getCell("C1").value = { error: "#N/A" };
      sheet.getCell("D1").value = "end";
    });
    expect(workbook.sheets[0].rows[0]).toEqual(["5:45", "Fajr", null, "end"]);
  });

  it("carries the value of a merged cell into every cell it covers", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("S");
      sheet.getCell("A1").value = "Date";
      sheet.getCell("B1").value = "Fajr";
      sheet.mergeCells("B1:C1");
      sheet.mergeCells("A1:A2");
      sheet.getCell("B2").value = "Begins";
      sheet.getCell("C2").value = "Jama'ah";
      sheet.addRow([1, "5:11", "5:45"]);
      sheet.addRow([2, "5:09"]);
      // A jamaat time merged down over the days it applies to.
      sheet.mergeCells("C3:C4");
    });
    expect(workbook.sheets[0].rows).toEqual([
      ["Date", "Fajr", "Fajr"],
      ["Date", "Begins", "Jama'ah"],
      [1, "5:11", "5:45"],
      [2, "5:09", "5:45"],
    ]);
  });

  it("skips hidden and very hidden sheets", async () => {
    const workbook = await readXlsx((book) => {
      book.addWorksheet("Old", { state: "hidden" }).addRow(["old"]);
      book.addWorksheet("January").addRow(["jan"]);
      book.addWorksheet("Lookup", { state: "veryHidden" }).addRow(["lookup"]);
      book.addWorksheet("February").addRow(["feb"]);
    });
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["January", "February"]);
  });

  it("keeps rows at their Excel position and drops empty rows at the end", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("S");
      sheet.getCell("A1").value = "Masjid Uwais";
      sheet.getCell("B4").value = "Fajr";
      sheet.getCell("A4").value = "Date";
      sheet.getCell("C6").value = "x";
      sheet.getCell("A9").value = "   ";
      sheet.getCell("A10").font = { bold: true };
    });
    expect(workbook.sheets[0].rows).toEqual([["Masjid Uwais"], [], [], ["Date", "Fajr"], [], [null, null, "x"]]);
  });

  it("reports the 1904 date system and still reads its date cells correctly", async () => {
    const workbook = await readXlsx((book) => {
      book.properties.date1904 = true;
      const sheet = book.addWorksheet("S");
      sheet.getCell("A1").value = new Date(Date.UTC(2027, 2, 1));
      sheet.getCell("A1").numFmt = "dd/mm/yyyy";
      sheet.getCell("B1").value = new Date(Date.UTC(1904, 0, 1, 5, 30));
      sheet.getCell("B1").numFmt = "h:mm";
      sheet.getCell("C1").value = 44956;
    });
    expect(workbook.date1904).toBe(true);
    expect(workbook.sheets[0].rows[0]).toEqual([new Date(Date.UTC(2027, 2, 1)), new Date(Date.UTC(1904, 0, 1, 5, 30)), 44956]);
  });

  it("goes by the content, not the file name", async () => {
    const data = await buildXlsx((book) => {
      book.addWorksheet("S").addRow(["Date", "Fajr"]);
    });
    const workbook = await readSpreadsheet({ fileName: "timetable.csv", data });
    expect(workbook.format).toBe("xlsx");
    expect(workbook.sheets[0].rows).toEqual([["Date", "Fajr"]]);
  });

  it("returns no sheets for a workbook whose sheets are all hidden or empty", async () => {
    const hidden = await readXlsx((book) => {
      book.addWorksheet("Old", { state: "hidden" }).addRow(["old"]);
    });
    expect(hidden.sheets).toEqual([]);
    const empty = await readXlsx((book) => {
      book.addWorksheet("Blank");
    });
    expect(empty.sheets).toEqual([{ name: "Blank", rows: [] }]);
  });
});

describe("readSpreadsheet: limits", () => {
  it("rejects an empty file", async () => {
    const error = await fileError("t.csv", new Uint8Array(0));
    expect(error.code).toBe("empty-file");
  });

  it("rejects a file above the size limit and accepts one at the limit", async () => {
    const atLimit = new Uint8Array(IMPORT_LIMITS.maxFileBytes).fill(0x61);
    expect((await readSpreadsheet({ fileName: "t.csv", data: atLimit })).sheets[0].rows).toHaveLength(1);
    const error = await fileError("t.csv", new Uint8Array(IMPORT_LIMITS.maxFileBytes + 1).fill(0x61));
    expect(error.code).toBe("file-too-large");
    expect(error.message).toContain("5 MB");
  });

  it("rejects a CSV with too many rows and accepts one at the limit", async () => {
    const line = "2027-01-01,06:25\n";
    expect((await csvRows(line.repeat(IMPORT_LIMITS.maxRowsPerSheet))).length).toBe(IMPORT_LIMITS.maxRowsPerSheet);
    const error = await fileError("big.csv", encoder.encode(line.repeat(IMPORT_LIMITS.maxRowsPerSheet + 1)));
    expect(error.code).toBe("too-many-rows");
    expect(error.message).toContain("5001");
    expect(error.message).toContain('"big"');
  });

  it("rejects a CSV with too many columns and accepts one at the limit", async () => {
    const wide = (count: number) => Array.from({ length: count }, (_, index) => `c${index}`).join(",");
    expect((await csvRows(wide(IMPORT_LIMITS.maxColumnsPerSheet)))[0]).toHaveLength(IMPORT_LIMITS.maxColumnsPerSheet);
    const error = await fileError("wide.csv", encoder.encode(wide(IMPORT_LIMITS.maxColumnsPerSheet + 1)));
    expect(error.code).toBe("too-many-columns");
    expect(error.message).toContain("61");
  });

  it("rejects a worksheet with a value beyond the row or column limit", async () => {
    const tooLong = await buildXlsx((book) => {
      const sheet = book.addWorksheet("Long");
      sheet.getCell("A1").value = "Date";
      sheet.getCell(`A${IMPORT_LIMITS.maxRowsPerSheet + 1}`).value = "x";
    });
    const longError = await fileError("t.xlsx", tooLong);
    expect(longError.code).toBe("too-many-rows");
    expect(longError.message).toContain('"Long"');

    const tooWide = await buildXlsx((book) => {
      book.addWorksheet("Wide").getRow(1).getCell(IMPORT_LIMITS.maxColumnsPerSheet + 1).value = "x";
    });
    expect((await fileError("t.xlsx", tooWide)).code).toBe("too-many-columns");
  });

  it("accepts a worksheet exactly at the row and column limits", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("Edge");
      sheet.getRow(IMPORT_LIMITS.maxRowsPerSheet).getCell(IMPORT_LIMITS.maxColumnsPerSheet).value = "x";
    });
    const { rows } = workbook.sheets[0];
    expect(rows).toHaveLength(IMPORT_LIMITS.maxRowsPerSheet);
    expect(rows[rows.length - 1]).toHaveLength(IMPORT_LIMITS.maxColumnsPerSheet);
  });

  it("does not count styled but empty rows as content", async () => {
    const workbook = await readXlsx((book) => {
      const sheet = book.addWorksheet("Styled");
      sheet.getCell("A1").value = "Date";
      for (let row = 2; row <= IMPORT_LIMITS.maxRowsPerSheet + 50; row++) sheet.getCell(`A${row}`).font = { bold: true };
    });
    expect(workbook.sheets[0].rows).toEqual([["Date"]]);
  });

  it("rejects a workbook with too many sheets", async () => {
    const data = await buildXlsx((book) => {
      for (let index = 1; index <= IMPORT_LIMITS.maxSheets + 1; index++) book.addWorksheet(`S${index}`).addRow([index]);
    });
    const error = await fileError("t.xlsx", data);
    expect(error.code).toBe("too-many-sheets");
    expect(error.message).toContain("21");
  });

  it("accepts a workbook with exactly the maximum number of sheets", async () => {
    const workbook = await readXlsx((book) => {
      for (let index = 1; index <= IMPORT_LIMITS.maxSheets; index++) book.addWorksheet(`S${index}`).addRow([index]);
    });
    expect(workbook.sheets).toHaveLength(IMPORT_LIMITS.maxSheets);
  });

  it("rejects a workbook that would unpack to an enormous size, before unpacking it", async () => {
    const bomb = fakeZip([
      { name: "xl/workbook.xml", size: 1000 },
      { name: "xl/worksheets/sheet1.xml", size: IMPORT_LIMITS.maxUnzippedBytes },
    ]);
    const error = await fileError("t.xlsx", bomb);
    expect(error.code).toBe("file-too-large");
    expect(error.message).toContain("empty rows");
  });

  it("counts the sheets of an archive before unpacking it", async () => {
    const entries = Array.from({ length: IMPORT_LIMITS.maxSheets + 5 }, (_, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, size: 10 }));
    const error = await fileError("t.xlsx", fakeZip([{ name: "xl/workbook.xml", size: 10 }, ...entries]));
    expect(error.code).toBe("too-many-sheets");
  });
});

describe("readSpreadsheet: unsupported and damaged files", () => {
  const OLE2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

  it.each<[string, string, Uint8Array, ImportFileErrorCode, string]>([
    ["a legacy .xls file", "old.xls", OLE2, "unsupported-format", ".xls"],
    ["a legacy .xls renamed to .xlsx", "old.xlsx", OLE2, "unsupported-format", ".xls"],
    ["a PDF", "timetable.pdf", encoder.encode("%PDF-1.7\n..."), "unsupported-format", "PDF"],
    ["a PDF renamed to .csv", "timetable.csv", encoder.encode("%PDF-1.7\n..."), "unsupported-format", "PDF"],
    ["an .ods file", "t.ods", fakeZip([{ name: "mimetype", size: 46 }, { name: "content.xml", size: 900 }]), "unsupported-format", ".ods"],
    ["a Numbers file", "t.numbers", fakeZip([{ name: "Index/Document.iwa", size: 900 }]), "unsupported-format", "Numbers"],
    ["a binary .xlsb workbook", "t.xlsb", fakeZip([{ name: "xl/workbook.bin", size: 900 }]), "unsupported-format", ".xlsb"],
    ["a Word document", "t.docx", fakeZip([{ name: "word/document.xml", size: 900 }]), "unsupported-format", "Word"],
    ["some other zip archive", "photos.zip", fakeZip([{ name: "a.jpg", size: 900 }]), "unsupported-format", "not a spreadsheet"],
    ["a text file named .ods", "t.ods", encoder.encode("a,b\n1,2"), "unsupported-format", ".ods"],
    ["a text file named .numbers", "t.numbers", encoder.encode("a,b\n1,2"), "unsupported-format", "Numbers"],
    ["binary data", "t.bin", new Uint8Array([1, 2, 0, 0, 5, 6, 0, 8]), "unsupported-format", "not a spreadsheet"],
    ["text named .xlsx", "t.xlsx", encoder.encode("Date,Fajr\n2027-01-01,06:25"), "unreadable-file", "not one"],
  ])("rejects %s with a friendly message", async (_name, fileName, data, code, hint) => {
    const error = await fileError(fileName, data);
    expect(error.code).toBe(code);
    expect(error.message).toContain(hint);
    expect(error.message).toMatch(/\.xlsx|CSV/);
  });

  it("turns a damaged workbook into a typed error instead of a library error", async () => {
    const good = await buildXlsx((book) => {
      book.addWorksheet("S").addRow(["Date", "Fajr"]);
    });
    const truncated = good.slice(0, Math.floor(good.length / 2));
    expect((await fileError("t.xlsx", truncated)).code).toBe("unreadable-file");

    const garbage = new Uint8Array(400).fill(0x37);
    garbage.set([0x50, 0x4b, 0x03, 0x04]);
    const error = await fileError("t.xlsx", garbage);
    expect(error.code).toBe("unreadable-file");
    expect(error.message).toContain("damaged");
  });

  it("rejects a zip that is an Excel workbook only by name", async () => {
    const error = await fileError("t.xlsx", fakeZip([{ name: "xl/workbook.xml", size: 100 }]));
    expect(error.code).toBe("unreadable-file");
  });
});

describe("ImportFileError", () => {
  it("carries a code and a message and is recognised by isImportFileError", () => {
    const error = new ImportFileError("too-many-rows", "Too long");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ImportFileError");
    expect(error.code).toBe("too-many-rows");
    expect(error.message).toBe("Too long");
    expect(isImportFileError(error)).toBe(true);
  });

  it("recognises an error that lost its prototype on the way", () => {
    expect(isImportFileError({ name: "ImportFileError", code: "empty-file", message: "x" })).toBe(true);
    expect(isImportFileError({ name: "ImportFileError", code: "something-else" })).toBe(false);
    expect(isImportFileError(new Error("boom"))).toBe(false);
    expect(isImportFileError(null)).toBe(false);
    expect(isImportFileError("ImportFileError")).toBe(false);
  });
});
