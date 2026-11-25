import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { PrayerDay } from "@/lib/types";
import { generateSampleDays } from "../../../scripts/sample-timetable";
import { blankDay } from "./day";
import { diffTimetable } from "./diff";
import { buildTemplateCsv, buildTemplateXlsx, exportHeaders, toCsv, toXlsx } from "./export";
import { parseTimetable } from "./parse";
import { readSpreadsheet } from "./read";
import { MERGE_FIELDS, type ImportResult } from "./types";

const CANONICAL_HEADERS = [
  "Date",
  "Fajr Begins",
  "Fajr Jamaat",
  "Sunrise",
  "Dhuhr Begins",
  "Dhuhr Jamaat",
  "Asr Begins",
  "Asr Jamaat",
  "Maghrib Begins",
  "Maghrib Jamaat",
  "Isha Begins",
  "Isha Jamaat",
  "Jumuah 1",
  "Jumuah 2",
  "Jumuah 3",
  "Note",
];

/** A complete winter day. */
function day(date: string, changes: Partial<PrayerDay> = {}): PrayerDay {
  return {
    ...blankDay(date),
    fajrBegins: "06:25",
    fajrJamaat: "06:45",
    sunrise: "08:06",
    dhuhrBegins: "12:09",
    dhuhrJamaat: "13:00",
    asrBegins: "13:46",
    asrJamaat: "14:00",
    maghribBegins: "16:05",
    maghribJamaat: "16:10",
    ishaBegins: "17:38",
    ishaJamaat: "18:00",
    ...changes,
  };
}

/** Ten consecutive days that exercise everything an export has to carry. 1 and 8 January 2027 are Fridays. */
const TRICKY_DAYS: PrayerDay[] = [
  day("2027-01-01", { jumuah: ["13:15", "14:00"], note: "Bank holiday, New Year" }),
  day("2027-01-02", { note: 'The imam said "come early"' }),
  day("2027-01-03", { note: "=1+1" }),
  day("2027-01-04", { note: "-5 degrees outside" }),
  day("2027-01-05", { note: "+10 minutes from tomorrow; @ the main hall" }),
  day("2027-01-06", { note: "عيد مبارك" }),
  day("2027-01-07", { sunrise: null, ishaJamaat: null }),
  day("2027-01-08", { jumuah: ["12:45", "13:30", "14:15"], note: "Café open after Jumu'ah" }),
  { ...blankDay("2027-01-09"), fajrJamaat: "06:45" },
  day("2027-01-10", { note: "05:30" }),
];

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The files `scripts/generate-samples.ts` has written to a directory of the repository; other files there are left alone. */
function generatedFiles(directory: string, pattern: RegExp): { name: string; data: Uint8Array }[] {
  const folder = path.join(REPOSITORY_ROOT, directory);
  return readdirSync(folder)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => ({ name, data: new Uint8Array(readFileSync(path.join(folder, name))) }));
}

/** Imports exported bytes or text the way an upload is imported. */
async function reimport(fileName: string, content: string | Uint8Array, year?: number): Promise<ImportResult> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return parseTimetable(await readSpreadsheet({ fileName, data }), year === undefined ? {} : { year });
}

/** Opens exported workbook bytes with exceljs for inspection. */
async function open(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  return workbook;
}

/** The text of a cell note, however exceljs hands it back. */
function noteText(cell: ExcelJS.Cell): string {
  const note = cell.note;
  if (typeof note === "string") return note;
  return (note?.texts ?? []).map((part) => part.text).join("");
}

describe("exportHeaders", () => {
  it("lists the canonical columns", () => {
    expect(exportHeaders()).toEqual(CANONICAL_HEADERS);
    expect(exportHeaders(1)).toEqual([...CANONICAL_HEADERS.slice(0, 13), "Note"]);
    expect(exportHeaders(4).slice(12)).toEqual(["Jumuah 1", "Jumuah 2", "Jumuah 3", "Jumuah 4", "Note"]);
  });
});

describe("toCsv", () => {
  it("writes the header, ISO dates and 24-hour times, with CRLF line ends", () => {
    const csv = toCsv([day("2027-01-01", { jumuah: ["13:15"], note: "Eid" }), day("2027-01-02", { sunrise: null })]);
    expect(csv).toBe(
      [
        CANONICAL_HEADERS.join(","),
        "2027-01-01,06:25,06:45,08:06,12:09,13:00,13:46,14:00,16:05,16:10,17:38,18:00,13:15,,,Eid",
        "2027-01-02,06:25,06:45,,12:09,13:00,13:46,14:00,16:05,16:10,17:38,18:00,,,,",
        "",
      ].join("\r\n"),
    );
  });

  it("writes only the header for an empty timetable", () => {
    expect(toCsv([])).toBe(`${CANONICAL_HEADERS.join(",")}\r\n`);
  });

  it("sorts by date without reordering the caller's array", () => {
    const days = [day("2027-01-03"), day("2027-01-01"), day("2027-01-02")];
    const lines = toCsv(days).split("\r\n");
    expect(lines.slice(1, 4).map((line) => line.slice(0, 10))).toEqual(["2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(days.map((entry) => entry.date)).toEqual(["2027-01-03", "2027-01-01", "2027-01-02"]);
  });

  it("quotes notes with commas, quotes and line breaks", () => {
    const csv = toCsv([day("2027-01-01", { note: "Eid, in sha Allah" }), day("2027-01-02", { note: 'the "big" hall' }), day("2027-01-03", { note: "line one\nline two" })]);
    expect(csv).toContain(',"Eid, in sha Allah"\r\n');
    expect(csv).toContain(',"the ""big"" hall"\r\n');
    expect(csv).toContain(',"line one\nline two"\r\n');
  });

  it("guards notes that a spreadsheet would run as a formula", () => {
    const lines = toCsv([day("2027-01-01", { note: "=HYPERLINK(\"http://example.invalid\")" }), day("2027-01-02", { note: "+1" }), day("2027-01-03", { note: "-1" }), day("2027-01-04", { note: "@x" })]).split("\r\n");
    expect(lines[1].endsWith(`,"'=HYPERLINK(""http://example.invalid"")"`)).toBe(true);
    expect(lines[2].endsWith(`,"'+1"`)).toBe(true);
    expect(lines[3].endsWith(`,"'-1"`)).toBe(true);
    expect(lines[4].endsWith(`,"'@x"`)).toBe(true);
  });

  it("adds a byte-order mark only when asked", () => {
    expect(toCsv([day("2027-01-01")]).charCodeAt(0)).toBe("D".charCodeAt(0));
    const withMark = toCsv([day("2027-01-01")], { bom: true });
    expect(withMark.charCodeAt(0)).toBe(0xfeff);
    expect(withMark.slice(1)).toBe(toCsv([day("2027-01-01")]));
  });

  it("adds Jumu'ah columns when a day has more than three times", () => {
    const csv = toCsv([day("2027-01-01", { jumuah: ["12:30", "13:15", "14:00", "14:45"] }), day("2027-01-08", { jumuah: ["13:15"] })]);
    const [header, first, second] = csv.split("\r\n");
    expect(header.endsWith("Jumuah 1,Jumuah 2,Jumuah 3,Jumuah 4,Note")).toBe(true);
    expect(first.endsWith(",12:30,13:15,14:00,14:45,")).toBe(true);
    expect(second.endsWith(",13:15,,,,")).toBe(true);
  });
});

describe("toXlsx", () => {
  it("writes one sheet with a frozen, bold header and sensible widths", async () => {
    const workbook = await open(await toXlsx([day("2027-01-01")]));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Timetable"]);
    const sheet = workbook.worksheets[0];

    const header = sheet.getRow(1);
    expect(CANONICAL_HEADERS.map((_, index) => header.getCell(index + 1).value)).toEqual(CANONICAL_HEADERS);
    expect(header.getCell(1).font?.bold).toBe(true);
    expect(header.getCell(16).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1 });
    expect(sheet.getColumn(1).width).toBe(18);
    expect(sheet.getColumn(2).width).toBe(15);
    expect(sheet.getColumn(16).width).toBe(40);
  });

  it("writes real dates and keeps the times as text", async () => {
    const workbook = await open(await toXlsx([day("2027-01-01", { sunrise: null, jumuah: ["13:15"], note: "Eid" })]));
    const row = workbook.worksheets[0].getRow(2);

    const date = row.getCell(1);
    expect(date.value).toEqual(new Date(Date.UTC(2027, 0, 1)));
    expect(date.numFmt).toBe("ddd d mmm yyyy");
    expect(row.getCell(2).value).toBe("06:25");
    expect(row.getCell(2).numFmt).toBe("@");
    expect(row.getCell(4).value).toBeNull();
    expect(row.getCell(12).value).toBe("18:00");
    expect(row.getCell(13).value).toBe("13:15");
    expect(row.getCell(14).value).toBeNull();
    expect(row.getCell(16).value).toBe("Eid");
  });

  it("does not let a formula-like note become a formula", async () => {
    const workbook = await open(await toXlsx([day("2027-01-01", { note: "=1+1" })]));
    const cell = workbook.worksheets[0].getRow(2).getCell(16);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe("=1+1");
  });

  it("sorts the rows by date", async () => {
    const workbook = await open(await toXlsx([day("2027-01-03"), day("2027-01-01"), day("2027-01-02")]));
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(4);
    expect([2, 3, 4].map((rowNumber) => sheet.getRow(rowNumber).getCell(1).value)).toEqual([
      new Date(Date.UTC(2027, 0, 1)),
      new Date(Date.UTC(2027, 0, 2)),
      new Date(Date.UTC(2027, 0, 3)),
    ]);
  });

  it.each([
    ["Masjid Uwais 2027", "Masjid Uwais 2027"],
    ["Masjid: Uwais / 2027?", "Masjid Uwais 2027"],
    ["'Quoted'", "Quoted"],
    ["A very long mosque name that Excel would refuse as a tab", "A very long mosque name that Ex"],
    ["   ", "Timetable"],
    ["[]*", "Timetable"],
  ])("names the sheet after the title %j", async (title, sheetName) => {
    const workbook = await open(await toXlsx([day("2027-01-01")], { title }));
    expect(workbook.worksheets[0].name).toBe(sheetName);
    expect(workbook.worksheets[0].name.length).toBeLessThanOrEqual(31);
  });

  it("produces a zip container, as .xlsx files are", async () => {
    const bytes = await toXlsx([]);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect((await open(bytes)).worksheets[0].rowCount).toBe(1);
  });
});

describe("round trips", () => {
  it("reads its own CSV back as the same days without a single remark", async () => {
    const result = await reimport("export.csv", toCsv(TRICKY_DAYS));
    expect(result.issues).toEqual([]);
    expect(result.days).toEqual(TRICKY_DAYS);
    expect(result.mappedFields).toEqual([...MERGE_FIELDS]);
    expect(result.summary).toMatchObject({ validDays: 10, errorRows: 0, skippedRows: 0, warnings: 0, missingDates: [] });
  });

  it("reads its own CSV back when it starts with a byte-order mark", async () => {
    const result = await reimport("export.csv", toCsv(TRICKY_DAYS, { bom: true }));
    expect(result.issues).toEqual([]);
    expect(result.days).toEqual(TRICKY_DAYS);
  });

  it("reads its own workbook back as the same days without a single remark", async () => {
    const result = await reimport("export.xlsx", await toXlsx(TRICKY_DAYS, { title: "Masjid Uwais" }));
    expect(result.issues).toEqual([]);
    expect(result.days).toEqual(TRICKY_DAYS);
    expect(result.mappedFields).toEqual([...MERGE_FIELDS]);
    expect(result.sheets.map((sheet) => [sheet.name, sheet.status])).toEqual([["Masjid Uwais", "imported"]]);
  });

  it.each([2027, 2028])("round-trips a whole generated year (%i) through CSV and Excel", async (year) => {
    const days = generateSampleDays(year);

    const fromCsv = await reimport(`timetable-${year}.csv`, toCsv(days));
    expect(fromCsv.issues).toEqual([]);
    expect(fromCsv.days).toEqual(days);

    const fromXlsx = await reimport(`timetable-${year}.xlsx`, await toXlsx(days));
    expect(fromXlsx.issues).toEqual([]);
    expect(fromXlsx.days).toEqual(days);

    // Importing an export over the timetable it came from changes nothing.
    expect(diffTimetable(days, fromXlsx.days, fromXlsx.mappedFields)).toEqual({ added: [], changed: [], unchanged: days.length });
  });

  it("exports what it read from a hand-made sheet in a form it reads back identically", async () => {
    const fileName = "March 2027.csv";
    const data = readFileSync(fileURLToPath(new URL(`./__fixtures__/${fileName}`, import.meta.url)));
    const original = parseTimetable(await readSpreadsheet({ fileName, data: new Uint8Array(data) }));
    expect(original.days).toHaveLength(31);

    const again = await reimport("export.csv", toCsv(original.days));
    expect(again.days).toEqual(original.days);
    expect(again.issues).toEqual([]);
  });

  it("turns a line break in a note into a space", async () => {
    const result = await reimport("export.csv", toCsv([day("2027-01-01", { note: "line one\nline two" })]));
    expect(result.days[0].note).toBe("line one line two");
  });

  it("keeps the first three Jumu'ah times of a day that has more", async () => {
    const result = await reimport("export.csv", toCsv([day("2027-01-01", { jumuah: ["12:30", "13:15", "14:00", "14:45"] })]));
    expect(result.days[0].jumuah).toEqual(["12:30", "13:15", "14:00"]);
    expect(result.issues.map((item) => [item.severity, item.code])).toEqual([["info", "unmapped-columns"]]);
  });
});

describe("buildTemplateXlsx", () => {
  it("has a row for every day of the year and an instructions sheet", async () => {
    const workbook = await open(await buildTemplateXlsx({ year: 2027 }));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Timetable", "Instructions"]);

    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(366);
    expect(CANONICAL_HEADERS.map((_, index) => sheet.getRow(1).getCell(index + 1).value)).toEqual(CANONICAL_HEADERS);
    expect(sheet.getRow(2).getCell(1).value).toEqual(new Date(Date.UTC(2027, 0, 1)));
    expect(sheet.getRow(366).getCell(1).value).toEqual(new Date(Date.UTC(2027, 11, 31)));
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1 });
    for (const rowNumber of [2, 200, 366]) {
      for (let column = 2; column <= 16; column++) expect(sheet.getRow(rowNumber).getCell(column).value).toBeNull();
    }
  });

  it("has 366 rows in a leap year", async () => {
    const sheet = (await open(await buildTemplateXlsx({ year: 2028 }))).worksheets[0];
    expect(sheet.rowCount).toBe(367);
    expect(sheet.getRow(61).getCell(1).value).toEqual(new Date(Date.UTC(2028, 1, 29)));
  });

  it("explains every heading and guides what is typed", async () => {
    const sheet = (await open(await buildTemplateXlsx({ year: 2027 }))).worksheets[0];
    const header = sheet.getRow(1);
    for (let column = 1; column <= 16; column++) expect(noteText(header.getCell(column))).not.toBe("");
    expect(noteText(header.getCell(1))).toContain("please do not change them");
    expect(noteText(header.getCell(2))).toContain("When the time for this prayer starts");
    expect(noteText(header.getCell(3))).toContain("congregation");
    expect(noteText(header.getCell(4))).toContain("Sunrise");
    expect(noteText(header.getCell(13))).toContain("Only for a Friday");
    expect(noteText(header.getCell(16))).toContain("Optional short remark");

    // Time cells are text, so 05:30 stays 05:30, and Excel prompts for the format.
    const timeCell = sheet.getRow(2).getCell(2);
    expect(timeCell.numFmt).toBe("@");
    expect(timeCell.dataValidation).toMatchObject({ type: "textLength", operator: "between", allowBlank: true, errorStyle: "warning", promptTitle: "Time" });
    expect(sheet.getRow(366).getCell(15).dataValidation).toMatchObject({ type: "textLength", operator: "between" });
    expect(sheet.getRow(366).getCell(16).dataValidation).toMatchObject({ type: "textLength", operator: "lessThanOrEqual", errorStyle: "warning" });
    expect(sheet.getRow(2).getCell(1).dataValidation).toBeUndefined();
  });

  it("writes the instructions in plain sentences that name the year", async () => {
    const instructions = (await open(await buildTemplateXlsx({ year: 2027 }))).worksheets[1];
    const lines: string[] = [];
    instructions.eachRow((row) => lines.push(String(row.getCell(1).value ?? "")));
    expect(lines[0]).toBe("Prayer timetable template for 2027");
    expect(instructions.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(lines.join("\n")).toContain("There is one row for every day of 2027.");
    expect(lines.join("\n")).toContain("24-hour format");
    expect(lines.some((line) => line.startsWith("Save the file as an Excel workbook (.xlsx) or as CSV"))).toBe(true);
  });

  it("rejects a year that is not a calendar year", async () => {
    await expect(buildTemplateXlsx({ year: 0 })).rejects.toThrow(RangeError);
    await expect(buildTemplateXlsx({ year: 2027.5 })).rejects.toThrow(RangeError);
    expect(() => buildTemplateCsv({ year: 10000 })).toThrow(RangeError);
  });

  it("imports as 'nothing to import' while it is still blank", async () => {
    const result = await reimport("timetable-template.xlsx", await buildTemplateXlsx({ year: 2027 }));
    expect(result.days).toEqual([]);
    expect(result.issues.map((item) => [item.severity, item.code])).toEqual([
      ["error", "nothing-to-import"],
      ["warning", "rows-without-times"],
      ["info", "sheet-skipped"],
    ]);
    expect(result.issues[1].message).toMatch(/^Sheet "Timetable": 365 rows \(2-366\) have a date but no times and were left out\./);
    expect(result.sheets.map((sheet) => [sheet.name, sheet.status])).toEqual([
      ["Timetable", "imported"],
      ["Instructions", "skipped"],
    ]);
  });

  it("imports the days a volunteer has filled in and leaves the rest alone", async () => {
    const workbook = await open(await buildTemplateXlsx({ year: 2027 }));
    const sheet = workbook.worksheets[0];
    const times = ["06:25", "06:45", "08:06", "12:09", "13:00", "13:46", "14:00", "16:05", "16:10", "17:38", "18:00"];
    for (let rowNumber = 2; rowNumber <= 8; rowNumber++) {
      times.forEach((time, index) => {
        sheet.getRow(rowNumber).getCell(index + 2).value = time;
      });
    }
    // One cell typed the way Excel stores a time when the cell is not text, one with am/pm.
    const asTime = sheet.getRow(3).getCell(3);
    asTime.numFmt = "h:mm";
    asTime.value = 6.75 / 24;
    sheet.getRow(4).getCell(12).value = "6:00 pm";
    sheet.getRow(2).getCell(13).value = "13:15";
    sheet.getRow(2).getCell(16).value = "New Year's Day";

    const filled = new Uint8Array(await workbook.xlsx.writeBuffer());
    const result = await reimport("timetable-template.xlsx", filled);

    expect(result.days).toEqual([
      day("2027-01-01", { jumuah: ["13:15"], note: "New Year's Day" }),
      day("2027-01-02"),
      day("2027-01-03"),
      day("2027-01-04"),
      day("2027-01-05"),
      day("2027-01-06"),
      day("2027-01-07"),
    ]);
    expect(result.issues.map((item) => [item.severity, item.code])).toEqual([
      ["warning", "rows-without-times"],
      ["info", "sheet-skipped"],
    ]);
    expect(result.summary).toMatchObject({ validDays: 7, errorRows: 0, skippedRows: 358, missingDates: [] });
  });
});

describe("buildTemplateCsv", () => {
  it("has the header and one empty row per day", () => {
    const lines = buildTemplateCsv({ year: 2027 }).split("\r\n");
    expect(lines).toHaveLength(367);
    expect(lines[0]).toBe(CANONICAL_HEADERS.join(","));
    expect(lines[1]).toBe(`2027-01-01${",".repeat(15)}`);
    expect(lines[365]).toBe(`2027-12-31${",".repeat(15)}`);
    expect(lines[366]).toBe("");
    expect(buildTemplateCsv({ year: 2028 }).split("\r\n")).toHaveLength(368);
  });

  it("imports as 'nothing to import' while it is still blank", async () => {
    const result = await reimport("timetable-template.csv", buildTemplateCsv({ year: 2027 }));
    expect(result.days).toEqual([]);
    expect(result.issues.map((item) => item.code)).toEqual(["nothing-to-import", "rows-without-times"]);
    expect(result.summary).toMatchObject({ totalRows: 365, skippedRows: 365 });
  });
});

describe("the files written by scripts/generate-samples.ts", () => {
  it("has sample timetables for two years, as CSV and Excel, that import without a remark", async () => {
    const files = generatedFiles("samples", /^timetable-\d{4}\.(csv|xlsx)$/);
    const years = Array.from(new Set(files.map((file) => file.name.slice("timetable-".length, "timetable-".length + 4))));
    expect(years.length).toBeGreaterThanOrEqual(2);
    expect(files.map((file) => file.name)).toEqual(years.flatMap((year) => [`timetable-${year}.csv`, `timetable-${year}.xlsx`]));

    for (const file of files) {
      const year = Number(file.name.slice("timetable-".length, "timetable-".length + 4));
      const result = await reimport(file.name, file.data);
      expect([file.name, result.issues]).toEqual([file.name, []]);
      expect(result.days).toEqual(generateSampleDays(year));
    }
  });

  it("has a blank template for one whole year, as Excel and CSV", async () => {
    const files = generatedFiles("public/templates", /^timetable-template\.(csv|xlsx)$/);
    expect(files.map((file) => file.name)).toEqual(["timetable-template.csv", "timetable-template.xlsx"]);

    for (const file of files) {
      const result = await reimport(file.name, file.data);
      expect(result.days).toEqual([]);
      expect(result.issues.filter((item) => item.severity !== "info").map((item) => item.code)).toEqual(["nothing-to-import", "rows-without-times"]);
      const dates = result.rows.map((row) => row.date ?? "");
      expect([365, 366]).toContain(dates.length);
      expect(dates[0].slice(4)).toBe("-01-01");
      expect(dates[dates.length - 1]).toBe(`${dates[0].slice(0, 4)}-12-31`);
    }
  });
});
