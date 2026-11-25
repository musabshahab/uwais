import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TIME_FIELDS, type PrayerDay } from "@/lib/types";
import { blankDay } from "./day";
import { parseTimetable } from "./parse";
import { readSpreadsheet } from "./read";
import {
  ISSUE_CODES,
  type ImportIssue,
  type ImportResult,
  type IssueCode,
  type IssueSeverity,
  type ParseOptions,
  type RawCell,
  type RawWorkbook,
} from "./types";

const HEADERS = [
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
] as const;
type Header = (typeof HEADERS)[number];
type RowChanges = Partial<Record<Header, RawCell>>;

/** The cells of a winter day in London; every test row starts from these. */
const USUAL_CELLS: Readonly<Record<Exclude<Header, "Date">, string>> = {
  "Fajr Begins": "06:25",
  "Fajr Jamaat": "06:45",
  Sunrise: "08:06",
  "Dhuhr Begins": "12:09",
  "Dhuhr Jamaat": "13:00",
  "Asr Begins": "13:46",
  "Asr Jamaat": "14:00",
  "Maghrib Begins": "16:05",
  "Maghrib Jamaat": "16:10",
  "Isha Begins": "17:38",
  "Isha Jamaat": "18:00",
};

/** Changes that empty every time cell of a row. */
const NO_TIMES: RowChanges = {
  "Fajr Begins": null,
  "Fajr Jamaat": null,
  Sunrise: null,
  "Dhuhr Begins": null,
  "Dhuhr Jamaat": null,
  "Asr Begins": null,
  "Asr Jamaat": null,
  "Maghrib Begins": null,
  "Maghrib Jamaat": null,
  "Isha Begins": null,
  "Isha Jamaat": null,
};

/** The day `row(date)` is read as. */
function usualDay(date: string, changes: Partial<PrayerDay> = {}): PrayerDay {
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

/** A data row under `HEADERS`, with some cells changed and cells for extra columns appended. */
function row(date: RawCell, changes: RowChanges = {}, extra: RawCell[] = []): RawCell[] {
  const cells: Record<string, RawCell> = { ...USUAL_CELLS, ...changes, Date: date };
  return [...HEADERS.map((header) => cells[header]), ...extra];
}

/** A sheet's rows: the canonical header (plus extra headings) and the data rows. */
function table(rows: RawCell[][], extraHeaders: string[] = []): RawCell[][] {
  return [[...HEADERS, ...extraHeaders], ...rows];
}

/** The rows of a table without one of its columns. */
function dropColumns(rows: RawCell[][], ...headers: Header[]): RawCell[][] {
  const dropped = headers.map((header) => HEADERS.indexOf(header));
  return rows.map((cells) => cells.filter((_, index) => !dropped.includes(index)));
}

/** A workbook from named sheets, in the order given. */
function book(...sheets: [name: string, rows: RawCell[][]][]): RawWorkbook {
  return { format: "xlsx", sheets: sheets.map(([name, rows]) => ({ name, rows })) };
}

/** Parses the rows of a single sheet called "Sheet1". */
function parse(rows: RawCell[][], options?: ParseOptions): ImportResult {
  return parseTimetable(book(["Sheet1", rows]), options);
}

/** The codes of a result's issues, in the order they are reported. */
function codes(result: ImportResult, severity?: IssueSeverity): IssueCode[] {
  return result.issues.filter((item) => severity === undefined || item.severity === severity).map((item) => item.code);
}

/** The one issue with a code; fails when there is none or more than one. */
function only(result: ImportResult, code: IssueCode): ImportIssue {
  const found = result.issues.filter((item) => item.code === code);
  expect(found).toHaveLength(1);
  return found[0];
}

/** Reads one of the hand-written fixture files the way an upload is read. */
async function fixture(fileName: string): Promise<RawWorkbook> {
  const data = readFileSync(fileURLToPath(new URL(`./__fixtures__/${fileName}`, import.meta.url)));
  return readSpreadsheet({ fileName, data: new Uint8Array(data) });
}

/** A simpler layout: begin times only, under bare prayer names. */
const SIMPLE_HEADERS: RawCell[] = ["Date", "Fajr", "Sunrise", "Zuhr", "Asr", "Maghrib", "Isha"];

function simpleRow(date: RawCell): RawCell[] {
  return [date, "06:25", "08:06", "12:09", "13:46", "16:05", "17:38"];
}

function simpleDay(date: string): PrayerDay {
  return { ...blankDay(date), fajrBegins: "06:25", sunrise: "08:06", dhuhrBegins: "12:09", asrBegins: "13:46", maghribBegins: "16:05", ishaBegins: "17:38" };
}

/** A sheet of one month the way mosques print it: day numbers 1 to `dayCount` and no month or year in the cells. */
function monthSheet(dayCount: number): RawCell[][] {
  return [SIMPLE_HEADERS, ...Array.from({ length: dayCount }, (_, index) => simpleRow(index + 1))];
}

/** Six consecutive days whose Fajr jamaat is only written on the day it changes. */
function changesOnlyRows(): RawCell[][] {
  return table([
    row("2027-01-01", { "Fajr Jamaat": "06:45" }),
    row("2027-01-02", { "Fajr Jamaat": null }),
    row("2027-01-03", { "Fajr Jamaat": "-" }),
    row("2027-01-04", { "Fajr Jamaat": "07:00" }),
    row("2027-01-05", { "Fajr Jamaat": null }),
    row("2027-01-06", { "Fajr Jamaat": null }),
  ]);
}

describe("parseTimetable: a clean file", () => {
  const result = parse(table([row("2027-01-01"), row("2027-01-02"), row("2027-01-03")]));

  it("turns every row into a day and has nothing to remark", () => {
    expect(result.days).toEqual([usualDay("2027-01-01"), usualDay("2027-01-02"), usualDay("2027-01-03")]);
    expect(result.issues).toEqual([]);
    expect(result.summary).toEqual({
      totalRows: 3,
      validDays: 3,
      errorRows: 0,
      skippedRows: 0,
      warnings: 0,
      firstDate: "2027-01-01",
      lastDate: "2027-01-03",
      missingDates: [],
      pmAssumedFields: [],
      dateOrderUsed: null,
    });
  });

  it("lists the rows with their place in the file", () => {
    expect(result.rows.map((item) => [item.sheet, item.rowNumber, item.status, item.date])).toEqual([
      ["Sheet1", 2, "ok", "2027-01-01"],
      ["Sheet1", 3, "ok", "2027-01-02"],
      ["Sheet1", 4, "ok", "2027-01-03"],
    ]);
    expect(result.rows[0].day).toEqual(result.days[0]);
  });

  it("describes the sheet and the mapping it guessed", () => {
    expect(result.format).toBe("xlsx");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]).toMatchObject({
      name: "Sheet1",
      status: "imported",
      headerRowNumber: 1,
      headerRowCount: 1,
      mappingSource: "guessed",
      ignoredColumns: [],
      unmappedColumns: [],
      dateOrder: null,
      rowCount: 3,
    });
    expect(result.sheets[0].columns.map((column) => column.label)).toEqual([...HEADERS]);
    expect(result.mapping).toEqual({ Sheet1: result.sheets[0].mapping });
    expect(result.mapping.Sheet1).toMatchObject({ date: 0, fajrBegins: 1, fajrJamaat: 2, sunrise: 3, ishaBegins: 10, ishaJamaat: 11, day: null, month: null, jumuah1: null, note: null });
    expect(result.mappedFields).toEqual([...TIME_FIELDS]);
  });

  it("sorts the days by date whatever order the rows are in", () => {
    const shuffled = parse(table([row("2027-01-03"), row("2027-01-01"), row("2027-01-02")]));
    expect(shuffled.days.map((day) => day.date)).toEqual(["2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(shuffled.issues).toEqual([]);
  });

  it("reads Excel date and time cells", () => {
    const excel = parse(
      table([
        row(new Date(Date.UTC(2027, 0, 1)), { "Fajr Begins": new Date(Date.UTC(1899, 11, 30, 6, 25)), "Dhuhr Jamaat": 13 / 24, "Isha Jamaat": 0.75 }),
        row(46389),
      ]),
    );
    expect(excel.days).toEqual([usualDay("2027-01-01"), usualDay("2027-01-02")]);
    expect(excel.issues).toEqual([]);
  });

  it("reads serial dates of a workbook that counts from 1904", () => {
    const workbook: RawWorkbook = { ...book(["Sheet1", table([row(44926), row(44927)])]), date1904: true };
    expect(parseTimetable(workbook).days.map((day) => day.date)).toEqual(["2027-01-01", "2027-01-02"]);
  });
});

describe("parseTimetable: the fixture files", () => {
  it("reads a month sheet with a two-row header, day numbers and 12-hour times without AM/PM", async () => {
    const result = parseTimetable(await fixture("March 2027.csv"));

    expect(result.days).toHaveLength(31);
    expect(result.days.map((day) => day.date)).toEqual(Array.from({ length: 31 }, (_, index) => `2027-03-${index < 9 ? "0" : ""}${index + 1}`));
    expect(result.days[0]).toEqual({
      ...blankDay("2027-03-01"),
      fajrBegins: "05:11",
      fajrJamaat: "05:45",
      sunrise: "06:46",
      dhuhrBegins: "12:18",
      dhuhrJamaat: "13:00",
      asrBegins: "15:05",
      asrJamaat: "15:30",
      maghribBegins: "17:43",
      maghribJamaat: "17:48",
      ishaBegins: "19:02",
      ishaJamaat: "19:30",
    });
    // The clocks go forward on the 28th: every time moves an hour and nothing is flagged.
    expect(result.days[27]).toMatchObject({ date: "2027-03-28", fajrBegins: "05:11", dhuhrBegins: "13:11", dhuhrJamaat: "13:30", ishaJamaat: "21:15" });
    expect(result.days[30]).toMatchObject({ date: "2027-03-31", fajrBegins: "05:03", asrBegins: "16:37", maghribJamaat: "19:40", ishaBegins: "20:47" });

    expect(codes(result, "error")).toEqual([]);
    expect(codes(result, "warning")).toEqual([]);
    expect(codes(result, "info")).toEqual(["pm-assumed", "row-skipped"]);
    expect(only(result, "row-skipped")).toMatchObject({ sheet: "March 2027", rowNumber: 38 });
    expect(result.summary).toMatchObject({ totalRows: 32, validDays: 31, errorRows: 0, skippedRows: 1, warnings: 0, missingDates: [] });
    expect(result.summary.pmAssumedFields).toEqual(["dhuhrBegins", "dhuhrJamaat", "asrBegins", "asrJamaat", "maghribBegins", "maghribJamaat", "ishaBegins", "ishaJamaat"]);
    expect(result.sheets[0]).toMatchObject({ name: "March 2027", headerRowNumber: 4, headerRowCount: 2 });
    // The "Date" column holds day numbers, so it is mapped as the day of the month; the weekday column is not needed.
    expect(result.mapping["March 2027"]).toMatchObject({ date: null, day: 0, month: null, fajrBegins: 2, fajrJamaat: 3, sunrise: 4, dhuhrBegins: 5, ishaJamaat: 12 });
  });

  it("reads an export of the Daily Prayer Time plugin", async () => {
    const result = parseTimetable(await fixture("daily-prayer-time-plugin.csv"));

    expect(result.days).toHaveLength(8);
    expect(result.days[0]).toEqual({
      ...blankDay("2027-02-05"),
      fajrBegins: "05:55",
      fajrJamaat: "06:30",
      sunrise: "07:33",
      dhuhrBegins: "12:19",
      dhuhrJamaat: "13:00",
      asrBegins: "14:32",
      asrJamaat: "15:30",
      maghribBegins: "17:00",
      maghribJamaat: "17:05",
      ishaBegins: "18:25",
      ishaJamaat: "18:45",
    });
    expect(result.summary).toMatchObject({ firstDate: "2027-02-05", lastDate: "2027-02-12", errorRows: 0, warnings: 0 });
    expect(codes(result)).toEqual(["asr-two-columns"]);
    expect(result.mapping["daily-prayer-time-plugin"]).toMatchObject({ date: 0, asrBegins: 6, asrJamaat: 8, ishaJamaat: 12 });
    expect(result.sheets[0].ignoredColumns.map((column) => column.index)).toEqual([7, 13, 14]);
    expect(result.sheets[0].unmappedColumns).toEqual([]);
  });

  it("reads a messy file and says exactly what is wrong with it", async () => {
    const result = parseTimetable(await fixture("messy.csv"), { year: 2027 });

    expect(result.days.map((day) => day.date)).toEqual([
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
      "2027-01-05",
      "2027-01-06",
      "2027-01-08",
      "2027-01-09",
      "2027-01-10",
    ]);
    expect(result.days[0]).toEqual(usualDay("2027-01-01", { note: "Bank holiday" }));
    // The second of the two rows for 9 January is the one that counts.
    expect(result.days[7]).toMatchObject({ date: "2027-01-09", ishaJamaat: "18:15", note: "Isha jamaat corrected" });

    const invalid = only(result, "time-invalid");
    expect(invalid).toMatchObject({ severity: "error", sheet: "messy", rowNumber: 13, field: "fajrJamaat" });
    expect(invalid.message).toContain('Row 13, "Fajr Jamaat" (column C)');
    expect(invalid.message).toContain('"6:4S AM"');

    const duplicate = only(result, "duplicate-date");
    expect(duplicate).toMatchObject({ severity: "warning", rowNumber: 16, field: "date" });
    expect(duplicate.message).toBe("Row 16 has the same date (9 Jan 2027) as row 15. The later row (16) is used.");

    expect(only(result, "row-skipped")).toMatchObject({ severity: "info", rowNumber: 19 });
    // 7 January is in the file, on the row with the error, so it is not reported as missing as well.
    expect(codes(result)).toEqual(["time-invalid", "duplicate-date", "row-skipped"]);

    expect(result.rows.map((item) => [item.rowNumber, item.status])).toEqual([
      [5, "ok"],
      [6, "ok"],
      [7, "ok"],
      [8, "ok"],
      [9, "ok"],
      [12, "ok"],
      [13, "error"],
      [14, "ok"],
      [15, "replaced"],
      [16, "ok"],
      [17, "ok"],
      [19, "skipped"],
    ]);
    expect(result.summary).toMatchObject({ totalRows: 12, validDays: 9, errorRows: 1, skippedRows: 1, warnings: 1, missingDates: [] });
    expect(result.sheets[0]).toMatchObject({ headerRowNumber: 4, headerRowCount: 1 });
  });

  it("returns plain data that survives JSON", async () => {
    const result = parseTimetable(await fixture("messy.csv"));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("parseTimetable: dates without a month or a year", () => {
  it("reads a workbook with a sheet per month and no years, for the year it is given", () => {
    const result = parseTimetable(book(["January", monthSheet(31)], ["February", monthSheet(28)], ["March", monthSheet(31)]), { year: 2027 });

    expect(result.days).toHaveLength(90);
    expect(result.days[0]).toEqual(simpleDay("2027-01-01"));
    expect(result.days[31]).toEqual(simpleDay("2027-02-01"));
    expect(result.days[89]).toEqual(simpleDay("2027-03-31"));
    expect(result.summary).toMatchObject({ validDays: 90, errorRows: 0, missingDates: [] });
    expect(result.sheets.map((sheet) => [sheet.name, sheet.status, sheet.rowCount])).toEqual([
      ["January", "imported", 31],
      ["February", "imported", 28],
      ["March", "imported", 31],
    ]);
    // A remark that holds for every sheet is made once, not once per sheet.
    expect(codes(result)).toEqual(["no-jamaat-columns"]);
    expect(only(result, "no-jamaat-columns").message).toMatch(/^Sheets "January", "February" and "March": No jamaat/);
  });

  it("asks for the year once when nothing gives it", () => {
    const result = parseTimetable(book(["January", monthSheet(31)], ["February", monthSheet(28)]));
    expect(result.days).toEqual([]);
    expect(codes(result, "error")).toEqual(["year-unknown"]);
    expect(only(result, "year-unknown")).toMatchObject({ sheet: null, rowNumber: null, field: "date" });
    expect(result.sheets.map((sheet) => sheet.status)).toEqual(["failed", "failed"]);
  });

  it("takes the year from a sheet name and carries it over New Year", () => {
    const result = parseTimetable(book(["November 2026", monthSheet(30)], ["December", monthSheet(31)], ["January", monthSheet(31)], ["Feb", monthSheet(28)]));
    expect(result.summary).toMatchObject({ validDays: 120, firstDate: "2026-11-01", lastDate: "2027-02-28", missingDates: [] });
    expect(result.days[30].date).toBe("2026-12-01");
    expect(result.days[61].date).toBe("2027-01-01");
    expect(codes(result, "error")).toEqual([]);
  });

  it("steps into the next year when the given year only fits the first sheet", () => {
    const result = parseTimetable(book(["December", monthSheet(31)], ["January", monthSheet(31)]), { year: 2026 });
    expect(result.summary).toMatchObject({ firstDate: "2026-12-01", lastDate: "2027-01-31", validDays: 62 });
  });

  it("takes month and year from a title row above the header", () => {
    const result = parse([["Prayer times - March 2027"], [], ...monthSheet(31)]);
    expect(result.summary).toMatchObject({ validDays: 31, firstDate: "2027-03-01", lastDate: "2027-03-31" });
  });

  it("cannot date day numbers when nothing names the month", () => {
    const result = parse(monthSheet(31), { year: 2027 });
    expect(result.days).toEqual([]);
    expect(codes(result, "error")).toEqual(["month-unknown"]);
    expect(only(result, "month-unknown").message).toContain('Name the sheet after its month (for example "March 2027")');
    expect(result.sheets[0].status).toBe("failed");
  });

  it("reads a sheet of 365 day numbers as a whole year starting in January", () => {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const rows = lengths.flatMap((length) => Array.from({ length }, (_, index) => simpleRow(index + 1)));
    const result = parse([SIMPLE_HEADERS, ...rows], { year: 2027 });
    expect(result.summary).toMatchObject({ validDays: 365, firstDate: "2027-01-01", lastDate: "2027-12-31", missingDates: [] });
    expect(result.days[59].date).toBe("2027-03-01");
  });

  it("moves to the next month when the day numbers start again", () => {
    const rows = [...monthSheet(31), ...Array.from({ length: 28 }, (_, index) => simpleRow(index + 1))];
    const result = parseTimetable(book(["January 2027", rows]));
    expect(result.summary).toMatchObject({ validDays: 59, firstDate: "2027-01-01", lastDate: "2027-02-28", missingDates: [] });
  });

  it("follows month headings written between the rows", () => {
    const result = parse([SIMPLE_HEADERS, ["January 2027"], simpleRow(30), simpleRow(31), [], ["February"], simpleRow(1), simpleRow(2)]);
    expect(result.days.map((day) => day.date)).toEqual(["2027-01-30", "2027-01-31", "2027-02-01", "2027-02-02"]);
    expect(codes(result, "info")).toEqual([]);
  });

  it("uses a month column, also when the month is only written on its first row", () => {
    const headers: RawCell[] = ["Month", "Day", "Fajr", "Sunrise", "Zuhr", "Asr", "Maghrib", "Isha"];
    const times = simpleRow(null).slice(1);
    const result = parse([headers, ["December", 30, ...times], [null, 31, ...times], ["January", 1, ...times], [null, 2, ...times]], { year: 2026 });
    expect(result.mapping.Sheet1).toMatchObject({ date: null, day: 1, month: 0 });
    expect(result.days.map((day) => day.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("completes dates written as day and month, across New Year", () => {
    const result = parse([SIMPLE_HEADERS, simpleRow("30 Dec"), simpleRow("31 Dec"), simpleRow("1 Jan"), simpleRow("Sat 2 Jan")], { year: 2026 });
    expect(result.days.map((day) => day.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(codes(result, "error")).toEqual([]);
  });

  it("lets a year written in the file win over the year it is given", () => {
    const result = parse([SIMPLE_HEADERS, simpleRow("Fri 1 Jan 2027"), simpleRow("Sat 2 Jan")], { year: 2026 });
    expect(result.days.map((day) => day.date)).toEqual(["2027-01-01", "2027-01-02"]);
  });

  it("rejects a day that the month does not have", () => {
    const result = parseTimetable(book(["February 2027", [SIMPLE_HEADERS, simpleRow(28), simpleRow(29), simpleRow(30)]]));
    expect(result.days.map((day) => day.date)).toEqual(["2027-02-28"]);
    const errors = result.issues.filter((item) => item.code === "date-invalid");
    expect(errors.map((item) => item.rowNumber)).toEqual([3, 4]);
    expect(errors[0].message).toBe('Row 3: "29" cannot be right, there is no day 29 in Feb 2027.');
  });
});

describe("parseTimetable: the order of day and month", () => {
  it("sees day-first dates from a day above 12", () => {
    const result = parse(table([row("12/01/2027"), row("13/01/2027")]));
    expect(result.days.map((day) => day.date)).toEqual(["2027-01-12", "2027-01-13"]);
    expect(result.summary.dateOrderUsed).toBe("dmy");
    expect(result.sheets[0].dateOrder).toBe("dmy");
    expect(result.issues).toEqual([]);
  });

  it("sees month-first dates from a second number above 12", () => {
    const result = parse(table([row("01/12/2027"), row("01/13/2027")]));
    expect(result.days.map((day) => day.date)).toEqual(["2027-01-12", "2027-01-13"]);
    expect(result.summary.dateOrderUsed).toBe("mdy");
    expect(result.issues).toEqual([]);
  });

  it("decides ambiguous dates by which order makes the rows consecutive days", () => {
    const british = parse(table([row("01/02/2027"), row("02/02/2027"), row("03/02/2027")]));
    expect(british.days.map((day) => day.date)).toEqual(["2027-02-01", "2027-02-02", "2027-02-03"]);
    const american = parse(table([row("02/01/2027"), row("02/02/2027"), row("02/03/2027")]));
    expect(american.days.map((day) => day.date)).toEqual(["2027-02-01", "2027-02-02", "2027-02-03"]);
    expect(british.issues).toEqual([]);
    expect(american.issues).toEqual([]);
  });

  it("assumes day-first and says so when the file does not decide", () => {
    const result = parse(table([row("01/02/2027")]));
    expect(result.days.map((day) => day.date)).toEqual(["2027-02-01"]);
    const warning = only(result, "date-order-assumed");
    expect(warning).toMatchObject({ severity: "warning", sheet: "Sheet1", field: "date" });
    expect(warning.message).toBe(
      'Dates such as "01/02/2027" can be read two ways. They were read as day/month/year. If that is wrong, choose the other date order and import again.',
    );
  });

  it("uses the order it is told without a warning", () => {
    const result = parse(table([row("01/02/2027")]), { dateOrder: "mdy" });
    expect(result.days.map((day) => day.date)).toEqual(["2027-01-02"]);
    expect(result.summary.dateOrderUsed).toBe("mdy");
    expect(result.issues).toEqual([]);
  });

  it("treats 'auto' like no choice", () => {
    expect(codes(parse(table([row("01/02/2027")]), { dateOrder: "auto" }))).toEqual(["date-order-assumed"]);
  });
});

describe("parseTimetable: rows that cannot be used", () => {
  it("reports a time it cannot read with row, column and value, and leaves that row out", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-02", { "Asr Jamaat": "2.75" }), row("2027-01-03")]));
    expect(result.days.map((day) => day.date)).toEqual(["2027-01-01", "2027-01-03"]);
    const error = only(result, "time-invalid");
    expect(error).toMatchObject({ severity: "error", sheet: "Sheet1", rowNumber: 3, field: "asrJamaat" });
    expect(error.message).toMatch(/^Row 3, "Asr Jamaat" \(column H\): "2\.75" /);
    expect(result.rows[1]).toMatchObject({ status: "error", date: "2027-01-02", day: null, issues: [error] });
    expect(result.summary).toMatchObject({ totalRows: 3, validDays: 2, errorRows: 1, missingDates: [] });
  });

  it("reports every bad cell of a row", () => {
    const result = parse(table([row("2027-01-01", { "Fajr Begins": "dawn", "Isha Jamaat": "25:00" })]));
    expect(result.issues.filter((item) => item.code === "time-invalid").map((item) => item.field)).toEqual(["fajrBegins", "ishaJamaat"]);
    expect(result.days).toEqual([]);
    // The row errors explain the empty result; no second error is piled on top.
    expect(codes(result, "error")).toEqual(["time-invalid", "time-invalid"]);
  });

  it("reports a row with times but no date", () => {
    const result = parse(table([row("2027-01-01"), row(null)]));
    const error = only(result, "date-missing");
    expect(error).toMatchObject({ severity: "error", rowNumber: 3, field: "date" });
    expect(error.message).toBe("Row 3 has times but no date, so it cannot be imported.");
    expect(result.rows[1]).toMatchObject({ status: "error", date: null });
  });

  it("reports a date it cannot read", () => {
    const result = parse(table([row("2027-01-01"), row("the day after")]));
    const error = only(result, "date-invalid");
    expect(error).toMatchObject({ severity: "error", rowNumber: 3, field: "date" });
    expect(error.message).toBe('Row 3: "the day after" is not a date we can read. Write dates like 2027-01-31 or 31/01/2027.');
  });

  it("skips footers and other rows without a date or times, and says which", () => {
    const result = parse(table([row("2027-01-01"), [], ["Jumu'ah is at 1:15 every Friday"], row("2027-01-02")]));
    expect(result.days).toHaveLength(2);
    const info = only(result, "row-skipped");
    expect(info).toMatchObject({ severity: "info", rowNumber: 4 });
    expect(info.message).toBe('Row 4 was skipped because it has no date and no times ("Jumu\'ah is at 1:15 every Friday").');
    expect(result.summary).toMatchObject({ totalRows: 3, skippedRows: 1, errorRows: 0 });
  });

  it("leaves out rows that have a date and no times, with one warning for all of them", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-02", NO_TIMES), row("2027-01-03", NO_TIMES), row("2027-01-04", NO_TIMES), row("2027-01-05")]));
    expect(result.days.map((day) => day.date)).toEqual(["2027-01-01", "2027-01-05"]);
    const warning = only(result, "rows-without-times");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 3 });
    expect(warning.message).toBe("3 rows (3-5) have a date but no times and were left out. Times already saved for those dates are kept.");
    expect(result.rows.map((item) => item.status)).toEqual(["ok", "no-times", "no-times", "no-times", "ok"]);
    // Those dates are in the file, so they are not also listed as missing.
    expect(codes(result)).toEqual(["rows-without-times"]);
    expect(result.summary).toMatchObject({ skippedRows: 3, missingDates: [] });
  });

  it("uses the later of two rows for the same date", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-02"), row("2027-01-01", { "Isha Jamaat": "18:30" })]));
    expect(result.days).toEqual([usualDay("2027-01-01", { ishaJamaat: "18:30" }), usualDay("2027-01-02")]);
    expect(only(result, "duplicate-date").message).toBe("Row 4 has the same date (1 Jan 2027) as row 2. The later row (4) is used.");
    expect(result.rows.map((item) => item.status)).toEqual(["replaced", "ok", "ok"]);
    expect(result.summary).toMatchObject({ totalRows: 3, validDays: 2, warnings: 1 });
  });

  it("finds a duplicate date on another sheet and names both sheets", () => {
    const result = parseTimetable(book(["A", table([row("2027-01-01")])], ["B", table([row("2027-01-01"), row("2027-01-02")])]));
    expect(only(result, "duplicate-date").message).toBe('Sheet "B", row 2 has the same date (1 Jan 2027) as sheet "A", row 2. The later row (2) is used.');
    expect(result.days).toHaveLength(2);
  });
});

describe("parseTimetable: times", () => {
  it("reads 12-hour times without AM/PM by the prayer they belong to, and mentions it", () => {
    const result = parse(
      table([row("2027-01-01", { "Dhuhr Jamaat": "1:00", "Asr Begins": "1:46", "Asr Jamaat": "2:00", "Maghrib Begins": "4:05", "Maghrib Jamaat": "4:10", "Isha Begins": "5:38", "Isha Jamaat": "6:00" })]),
    );
    expect(result.days).toEqual([usualDay("2027-01-01")]);
    expect(result.summary.pmAssumedFields).toEqual(["dhuhrJamaat", "asrBegins", "asrJamaat", "maghribBegins", "maghribJamaat", "ishaBegins", "ishaJamaat"]);
    const info = only(result, "pm-assumed");
    expect(info).toMatchObject({ severity: "info", sheet: null, rowNumber: null });
    expect(info.message).toContain("Dhuhr Jamaat, Asr Begins");
    expect(codes(result)).toEqual(["pm-assumed"]);
  });

  it("does not mention AM/PM when the file writes it", () => {
    const result = parse(table([row("2027-01-01", { "Dhuhr Jamaat": "1:00 PM", "Isha Jamaat": "6:00pm", "Fajr Begins": "6:25 a.m." })]));
    expect(result.days).toEqual([usualDay("2027-01-01")]);
    expect(result.issues).toEqual([]);
  });

  it("reads an Isha of 12:xx as just after midnight and warns once per column", () => {
    const summer = { "Maghrib Begins": "21:20", "Maghrib Jamaat": "21:25", "Isha Begins": "11:10" };
    const result = parse(table([row("2027-06-20", { ...summer, "Isha Jamaat": "11:45" }), row("2027-06-21", { ...summer, "Isha Jamaat": "12:00" }), row("2027-06-22", { ...summer, "Isha Jamaat": "12:05" })]));
    expect(result.days.map((day) => [day.ishaBegins, day.ishaJamaat])).toEqual([
      ["23:10", "23:45"],
      ["23:10", "00:00"],
      ["23:10", "00:05"],
    ]);
    const warning = only(result, "midnight-assumed");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 3, field: "ishaJamaat" });
    expect(warning.message).toBe(
      '"Isha Jamaat" (column L) has 2 times with an hour of 12 and no AM or PM (2 rows: 3-4). They were read as just after midnight (00:xx). If that is wrong, write the time with AM or PM.',
    );
    // An Isha after midnight still follows Maghrib; nothing else is flagged.
    expect(codes(result, "warning")).toEqual(["midnight-assumed"]);
  });

  it("repeats the time above for a ditto mark", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-02", { "Fajr Jamaat": '"', "Sunrise": "ditto" }), row("2027-01-03", { "Fajr Jamaat": "〃" })]));
    expect(result.days).toEqual([usualDay("2027-01-01"), usualDay("2027-01-02"), usualDay("2027-01-03")]);
    expect(result.issues).toEqual([]);
  });

  it("warns about a ditto mark with nothing above it", () => {
    const result = parse(table([row("2027-01-01", { "Fajr Jamaat": '"' }), row("2027-01-02")]));
    expect(result.days[0]).toEqual(usualDay("2027-01-01", { fajrJamaat: null }));
    const warning = only(result, "ditto-without-value");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 2, field: "fajrJamaat" });
    expect(warning.message).toBe('Row 2, "Fajr Jamaat" (column C): the ditto mark has no time above it to repeat, so the cell was left empty.');
  });

  it("leaves empty jamaat cells empty and suggests filling down when a column only lists changes", () => {
    const result = parse(changesOnlyRows());
    expect(result.days.map((day) => day.fajrJamaat)).toEqual(["06:45", null, null, "07:00", null, null]);
    const warning = only(result, "sparse-jamaat-column");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: null, field: "fajrJamaat" });
    expect(warning.message).toMatch(/^"Fajr Jamaat" \(column C\) is empty on 4 of 6 rows\./);
    expect(codes(result)).toEqual(["sparse-jamaat-column"]);
  });

  it("fills empty jamaat cells from the row above when asked to", () => {
    const result = parse(changesOnlyRows(), { fillDown: true });
    expect(result.days.map((day) => day.fajrJamaat)).toEqual(["06:45", "06:45", "06:45", "07:00", "07:00", "07:00"]);
    expect(only(result, "cells-filled-down").message).toBe("4 empty jamaat cells were filled with the time from the row above.");
    expect(codes(result)).toEqual(["cells-filled-down"]);
  });

  it("never fills begin times down, and does not fill across an unreadable row", () => {
    const result = parse(
      table([row("2027-01-01"), row("2027-01-02", { "Fajr Begins": null, "Fajr Jamaat": "7:6o" }), row("2027-01-03", { "Fajr Begins": null, "Fajr Jamaat": null })]),
      { fillDown: true },
    );
    expect(result.days).toEqual([usualDay("2027-01-01"), usualDay("2027-01-03", { fajrBegins: null })]);
    expect(codes(result, "error")).toEqual(["time-invalid"]);
  });

  it("does not call a jamaat column sparse because a few cells are empty", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-02", { "Isha Jamaat": null }), row("2027-01-03"), row("2027-01-04")]));
    expect(result.issues).toEqual([]);
    expect(result.days[1].ishaJamaat).toBeNull();
  });
});

describe("parseTimetable: Jumu'ah times and notes", () => {
  it("keeps Jumu'ah times on Fridays, in column order", () => {
    const result = parse(table([row("2027-01-01", {}, ["1:15", "2:00", null]), row("2027-01-02", {}, [null, null, null])], ["Jumuah 1", "Jumuah 2", "Jumuah 3"]));
    expect(result.days).toEqual([usualDay("2027-01-01", { jumuah: ["13:15", "14:00"] }), usualDay("2027-01-02")]);
    expect(result.mapping.Sheet1).toMatchObject({ jumuah1: 12, jumuah2: 13, jumuah3: 14 });
    expect(result.mappedFields).toEqual([...TIME_FIELDS, "jumuah"]);
    expect(result.summary.pmAssumedFields).toEqual(["jumuah"]);
  });

  it("ignores Jumu'ah times on other days and says so once", () => {
    const result = parse(table([row("2027-01-01", {}, ["13:15"]), row("2027-01-02", {}, ["13:15"]), row("2027-01-03", {}, ["13:15"])], ["Jumuah"]));
    expect(result.days.map((day) => day.jumuah)).toEqual([["13:15"], [], []]);
    const info = only(result, "jumuah-not-friday");
    expect(info).toMatchObject({ severity: "info", rowNumber: 3 });
    expect(info.message).toBe("Jumu'ah times on 2 rows that are not a Friday were ignored (3-4).");
  });

  it("imports a Friday row that only has a Jumu'ah time", () => {
    const result = parse(table([row("2027-01-01", NO_TIMES, ["13:30"])], ["Jumuah"]));
    expect(result.days).toEqual([{ ...blankDay("2027-01-01"), jumuah: ["13:30"] }]);
  });

  it("reports a Jumu'ah time it cannot read", () => {
    const result = parse(table([row("2027-01-01", {}, ["after Zuhr"])], ["Jumuah"]));
    expect(only(result, "time-invalid")).toMatchObject({ rowNumber: 2, field: "jumuah1" });
    expect(result.days).toEqual([]);
  });

  it("keeps notes, as text", () => {
    const result = parse(table([row("2027-01-01", {}, ["  Eid al-Fitr  "]), row("2027-01-02", {}, [null]), row("2027-01-03", {}, [1448])], ["Note"]));
    expect(result.days.map((day) => day.note)).toEqual(["Eid al-Fitr", null, "1448"]);
    expect(result.mappedFields).toEqual([...TIME_FIELDS, "note"]);
    expect(result.issues).toEqual([]);
  });

  it("removes the apostrophe our own export puts in front of a formula-like note", () => {
    const result = parse(table([row("2027-01-01", {}, ["'=SUM(A1:A9)"]), row("2027-01-02", {}, ["'Asr at the park"])], ["Note"]));
    expect(result.days.map((day) => day.note)).toEqual(["=SUM(A1:A9)", "'Asr at the park"]);
  });

  it("cuts a note that is too long and warns about it", () => {
    const result = parse(table([row("2027-01-01", {}, ["x".repeat(250)])], ["Note"]));
    expect(result.days[0].note).toBe("x".repeat(200));
    const warning = only(result, "note-truncated");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 2, field: "note" });
    expect(warning.message).toBe("Row 2: the note is longer than 200 characters and was cut short.");
    expect(result.rows[0].issues).toEqual([warning]);
  });
});

describe("parseTimetable: plausibility warnings", () => {
  it("warns when the times of a day are not in order", () => {
    const result = parse(table([row("2027-01-01", { Sunrise: "05:06" })]));
    expect(result.days).toHaveLength(1);
    const warning = only(result, "times-out-of-order");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 2, field: "sunrise" });
    expect(warning.message).toBe(
      "Row 2 (1 Jan 2027): Sunrise (05:06) is not later than Fajr Begins (06:25). Check for a time in the wrong column or a missing AM/PM.",
    );
    expect(result.rows[0]).toMatchObject({ status: "ok", issues: [warning] });
  });

  it("warns when a jamaat is before its prayer begins", () => {
    const result = parse(table([row("2027-01-01", { "Fajr Jamaat": "06:05" })]));
    const warning = only(result, "jamaat-before-begins");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 2, field: "fajrJamaat" });
    expect(warning.message).toBe("Row 2 (1 Jan 2027): Fajr Jamaat (06:05) is earlier than Fajr Begins (06:25).");
  });

  it("warns once about a time that jumps from one day to the next", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-02", { "Maghrib Begins": "17:05", "Maghrib Jamaat": "17:10" }), row("2027-01-03"), row("2027-01-04")]));
    const warning = only(result, "time-jump");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 3, field: "maghribBegins" });
    expect(warning.message).toBe(
      "Row 3 (2 Jan 2027): Maghrib Begins is 17:05, but 16:05 the day before. Check that the time is in the right row and has the right AM/PM.",
    );
    expect(codes(result)).toEqual(["time-jump"]);
  });

  it("words it differently when one time did not move with the clocks", () => {
    const summerTime = { "Fajr Begins": "07:25", "Fajr Jamaat": "07:45", Sunrise: "09:06", "Dhuhr Jamaat": "14:00", "Asr Begins": "14:46", "Asr Jamaat": "15:00", "Maghrib Begins": "17:05", "Maghrib Jamaat": "17:10", "Isha Begins": "18:38", "Isha Jamaat": "19:00" };
    const result = parse(table([row("2027-03-27"), row("2027-03-28", summerTime), row("2027-03-29", { ...summerTime, "Dhuhr Begins": "13:09" })]));
    const jumps = result.issues.filter((item) => item.code === "time-jump");
    expect(jumps.map((item) => [item.rowNumber, item.field])).toEqual([
      [3, "dhuhrBegins"],
      [4, "dhuhrBegins"],
    ]);
    expect(jumps[0].message).toBe(
      "Row 3 (28 Mar 2027): Dhuhr Begins is 12:09 and was 12:09 the day before, although the other times moved by an hour, as they do when the clocks change. Check this time.",
    );
    expect(jumps[1].message).toContain("Dhuhr Begins is 13:09, but 12:09 the day before.");
  });

  it("lists the dates missing between the first and the last day", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-02"), row("2027-01-05"), row("2027-01-06"), row("2027-01-10")]));
    const warning = only(result, "missing-dates");
    expect(warning).toMatchObject({ severity: "warning", sheet: null, rowNumber: null });
    expect(warning.message).toBe("5 dates between 1 Jan 2027 and 10 Jan 2027 are not in the file: 3 Jan 2027 to 4 Jan 2027 and 7 Jan 2027 to 9 Jan 2027.");
    expect(result.summary.missingDates).toEqual(["2027-01-03", "2027-01-04", "2027-01-07", "2027-01-08", "2027-01-09"]);
    expect(result.days).toHaveLength(5);
  });

  it("names a single missing date", () => {
    const result = parse(table([row("2027-01-01"), row("2027-01-03")]));
    expect(only(result, "missing-dates").message).toBe("1 date between 1 Jan 2027 and 3 Jan 2027 is not in the file: 2 Jan 2027.");
  });

  it("warns when the dates are years away from the year being imported", () => {
    const result = parse(table([row("2017-01-01"), row("2017-01-02")]), { year: 2027 });
    const warning = only(result, "dates-far-from-year");
    expect(warning).toMatchObject({ severity: "warning", rowNumber: 2, field: "date" });
    expect(warning.message).toBe("2 dates are more than 2 years away from 2027, starting with 1 Jan 2017 (row 2). Check the year in the file.");
    expect(result.days).toHaveLength(2);
    expect(codes(parse(table([row("2026-12-31"), row("2027-01-01")]), { year: 2027 }))).toEqual([]);
  });
});

describe("parseTimetable: columns", () => {
  it("imports begin times only and says that jamaat times are untouched", () => {
    const result = parse([SIMPLE_HEADERS, simpleRow("2027-01-01")]);
    expect(result.days).toEqual([simpleDay("2027-01-01")]);
    expect(result.mappedFields).toEqual(["fajrBegins", "sunrise", "dhuhrBegins", "asrBegins", "maghribBegins", "ishaBegins"]);
    expect(only(result, "no-jamaat-columns")).toMatchObject({ severity: "warning", sheet: "Sheet1", rowNumber: null });
  });

  it("imports jamaat times only", () => {
    const result = parse([
      ["Date", "Fajr Jamaat", "Zuhr Jamaat", "Asr Jamaat", "Maghrib Jamaat", "Isha Jamaat"],
      ["2027-01-01", "06:45", "13:00", "14:00", "16:10", "18:00"],
    ]);
    expect(result.days).toEqual([{ ...blankDay("2027-01-01"), fajrJamaat: "06:45", dhuhrJamaat: "13:00", asrJamaat: "14:00", maghribJamaat: "16:10", ishaJamaat: "18:00" }]);
    expect(result.mappedFields).toEqual(["fajrJamaat", "dhuhrJamaat", "asrJamaat", "maghribJamaat", "ishaJamaat"]);
    expect(codes(result)).toEqual(["no-begins-columns"]);
  });

  it("points out a prayer that lacks one of its two columns, or has none", () => {
    const oneMissing = parse(dropColumns(table([row("2027-01-01")]), "Maghrib Jamaat"));
    expect(only(oneMissing, "prayer-column-missing")).toMatchObject({ severity: "warning", field: "maghribJamaat" });
    expect(oneMissing.days[0].maghribJamaat).toBeNull();

    const prayerMissing = parse(dropColumns(table([row("2027-01-01")]), "Isha Begins", "Isha Jamaat"));
    expect(only(prayerMissing, "prayer-not-found").message).toContain("No column was found for Isha.");
  });

  it("uses the first of two columns with the same meaning", () => {
    const result = parse(table([row("2027-01-01", {}, ["18:30"])], ["Isha Jamaat"]));
    expect(result.days[0].ishaJamaat).toBe("18:00");
    expect(only(result, "duplicate-column")).toMatchObject({ severity: "warning", field: "ishaJamaat" });
    // The losing column is also listed among the columns that were left out.
    expect(only(result, "unmapped-columns").message).toBe('This column was not recognised and left out: "Isha Jamaat" (column M).');
  });

  it("says so when it had to assume which column is the begin time", () => {
    const result = parse([
      ["Date", "Fajr", "Fajr", "Zuhr", "Zuhr"],
      ["2027-01-01", "06:25", "06:45", "12:09", "13:00"],
    ]);
    expect(result.days[0]).toMatchObject({ fajrBegins: "06:25", fajrJamaat: "06:45", dhuhrBegins: "12:09", dhuhrJamaat: "13:00" });
    expect(result.issues.filter((item) => item.code === "column-role-assumed").map((item) => item.field)).toEqual(["fajrJamaat", "dhuhrJamaat"]);
  });

  it("uses the first Asr time when the file has both calculations", () => {
    const result = parse([
      ["Date", "Fajr", "Zuhr", "Asr Mithl 1", "Asr Mithl 2", "Maghrib", "Isha"],
      ["2027-01-01", "06:25", "12:09", "13:46", "14:20", "16:05", "17:38"],
    ]);
    expect(result.days[0].asrBegins).toBe("13:46");
    expect(only(result, "asr-two-columns")).toMatchObject({ severity: "info", field: "asrBegins" });
    expect(result.sheets[0].ignoredColumns.map((column) => column.index)).toEqual([4]);
  });

  it("lists columns it does not recognise and quietly ignores the ones it knows are not times", () => {
    const result = parse(table([row("2027-01-01", {}, ["Yusuf", "22 Rajab 1448"])], ["Volunteer on duty", "Hijri"]));
    expect(result.days).toEqual([usualDay("2027-01-01")]);
    const info = only(result, "unmapped-columns");
    expect(info).toMatchObject({ severity: "info", sheet: "Sheet1" });
    expect(info.message).toBe('This column was not recognised and left out: "Volunteer on duty" (column M).');
    expect(result.sheets[0].unmappedColumns.map((column) => column.index)).toEqual([12]);
    expect(result.sheets[0].ignoredColumns.map((column) => column.index)).toEqual([13]);
    expect(codes(result)).toEqual(["unmapped-columns"]);
  });

  it("warns when one sheet lacks a column the others have", () => {
    const january = table([row(1), row(2)]);
    const february = dropColumns(table([row(1), row(2)]), "Isha Jamaat");
    const result = parseTimetable(book(["January 2027", january], ["February 2027", february]));
    expect(result.days).toHaveLength(4);
    expect(result.days[2]).toEqual(usualDay("2027-02-01", { ishaJamaat: null }));
    expect(result.mappedFields).toEqual([...TIME_FIELDS]);
    const warning = only(result, "columns-differ-between-sheets");
    expect(warning).toMatchObject({ severity: "warning", sheet: "February 2027" });
    expect(warning.message).toBe('Sheet "February 2027" has no column for Isha Jamaat, unlike the other sheets. Its dates will be imported with that field empty.');
  });

  it("fails a sheet that has times but no date column", () => {
    const result = parse([
      ["Fajr", "Zuhr", "Asr", "Maghrib", "Isha"],
      ["06:25", "12:09", "13:46", "16:05", "17:38"],
    ]);
    expect(result.days).toEqual([]);
    expect(codes(result, "error")).toEqual(["no-date-column"]);
    expect(only(result, "no-date-column")).toMatchObject({ sheet: "Sheet1", field: "date" });
    expect(result.sheets[0].status).toBe("failed");
  });

  it("fails a sheet that has dates but no prayer columns", () => {
    const result = parse([
      ["Date", "Day", "Hijri"],
      ["2027-01-01", "Fri", "22 Rajab 1448"],
    ]);
    expect(codes(result, "error")).toEqual(["no-time-columns"]);
    expect(result.sheets[0].status).toBe("failed");
  });
});

describe("parseTimetable: a mapping chosen by the user", () => {
  it("reads only the chosen columns", () => {
    const result = parse(table([row("2027-01-01")]), { mapping: { Sheet1: { date: 0, fajrJamaat: 2, ishaJamaat: 11 } } });
    expect(result.days).toEqual([{ ...blankDay("2027-01-01"), fajrJamaat: "06:45", ishaJamaat: "18:00" }]);
    expect(result.mappedFields).toEqual(["fajrJamaat", "ishaJamaat"]);
    expect(result.sheets[0].mappingSource).toBe("provided");
    expect(result.mapping.Sheet1).toMatchObject({ date: 0, fajrBegins: null, fajrJamaat: 2, ishaJamaat: 11 });
    expect(result.sheets[0].unmappedColumns.map((column) => column.label)).toContain("Fajr Begins");
  });

  it("can swap columns the guess got wrong", () => {
    const result = parse(table([row("2027-01-01")]), { mapping: { Sheet1: { ...parse(table([row("2027-01-01")])).mapping.Sheet1, fajrBegins: 2, fajrJamaat: 1 } } });
    expect(result.days[0]).toMatchObject({ fajrBegins: "06:45", fajrJamaat: "06:25" });
    expect(codes(result)).toContain("jamaat-before-begins");
  });

  it("makes a sheet without a header row importable", () => {
    const rows: RawCell[][] = [
      ["2027-01-01", "6:25", "12:09"],
      ["2027-01-02", "6:25", "12:10"],
    ];
    const unaided = parse(rows);
    expect(unaided.days).toEqual([]);
    expect(codes(unaided, "error")).toEqual(["no-timetable-found"]);
    expect(only(unaided, "sheet-skipped").message).toContain("no header row with prayer names was found on it");
    // The columns are still described, so the mapping screen has something to show.
    expect(unaided.sheets[0].columns.map((column) => [column.letter, column.samples[0]])).toEqual([
      ["A", "2027-01-01"],
      ["B", "6:25"],
      ["C", "12:09"],
    ]);

    const mapped = parse(rows, { mapping: { "*": { date: 0, fajrBegins: 1, dhuhrBegins: 2 } } });
    expect(mapped.days).toEqual([
      { ...blankDay("2027-01-01"), fajrBegins: "06:25", dhuhrBegins: "12:09" },
      { ...blankDay("2027-01-02"), fajrBegins: "06:25", dhuhrBegins: "12:10" },
    ]);
    expect(codes(mapped, "error")).toEqual([]);
  });

  it("reads a headerless file of month, day and dotted 12-hour times once its columns are chosen", () => {
    // The layout of one public mosque file: no header, numbers only. Excel hands the cells over as numbers, CSV as text.
    const rows: RawCell[][] = [
      [2, 9, 5.45, 7.2, 12.2, 3.05, 5.1, 6.4],
      ["2", "10", "5.44", "7.19", "12.20", "3.06", "5.12", "6.41"],
    ];
    const mapping = { month: 0, day: 1, fajrBegins: 2, sunrise: 3, dhuhrBegins: 4, asrBegins: 5, maghribBegins: 6, ishaBegins: 7 };
    const result = parse(rows, { year: 2027, mapping: { "*": mapping } });
    expect(result.days).toEqual([
      { ...blankDay("2027-02-09"), fajrBegins: "05:45", sunrise: "07:20", dhuhrBegins: "12:20", asrBegins: "15:05", maghribBegins: "17:10", ishaBegins: "18:40" },
      { ...blankDay("2027-02-10"), fajrBegins: "05:44", sunrise: "07:19", dhuhrBegins: "12:20", asrBegins: "15:06", maghribBegins: "17:12", ishaBegins: "18:41" },
    ]);
    expect(codes(result, "error")).toEqual([]);
    expect(result.rows.map((item) => item.rowNumber)).toEqual([1, 2]);
  });

  it("applies '*' to every sheet that has no mapping of its own", () => {
    const sheetRows = table([row(1)]);
    const result = parseTimetable(book(["January 2027", sheetRows], ["February 2027", sheetRows]), {
      mapping: { "*": { date: 0, fajrBegins: 1 }, "February 2027": { date: 0, ishaBegins: 10 } },
    });
    expect(result.days).toEqual([
      { ...blankDay("2027-01-01"), fajrBegins: "06:25" },
      { ...blankDay("2027-02-01"), ishaBegins: "17:38" },
    ]);
    expect(result.mappedFields).toEqual(["fajrBegins", "ishaBegins"]);
  });

  it("leaves out a choice that points at a column the sheet does not have", () => {
    const result = parse(table([row("2027-01-01")]), { mapping: { Sheet1: { date: 0, fajrBegins: 1, ishaJamaat: 40 } } });
    expect(result.days).toEqual([{ ...blankDay("2027-01-01"), fajrBegins: "06:25" }]);
    const warning = only(result, "mapping-invalid");
    expect(warning).toMatchObject({ severity: "warning", sheet: "Sheet1", field: "ishaJamaat" });
    expect(warning.message).toBe("The column chosen for Isha Jamaat does not exist on this sheet, so it was left unmapped.");
    expect(result.mapping.Sheet1.ishaJamaat).toBeNull();
  });
});

describe("parseTimetable: choosing and skipping sheets", () => {
  const timetable = table([row("2027-01-01")]);

  it("skips sheets that are not a timetable and mentions them", () => {
    const result = parseTimetable(book(["Timetable", timetable], ["Notes", [["Please check all times with the imam"], ["Printed by the committee"]]], ["Empty", [[], [null, " "]]]));
    expect(result.days).toEqual([usualDay("2027-01-01")]);
    expect(result.sheets.map((sheet) => [sheet.name, sheet.status])).toEqual([
      ["Timetable", "imported"],
      ["Notes", "skipped"],
      ["Empty", "skipped"],
    ]);
    const skipped = result.issues.filter((item) => item.code === "sheet-skipped");
    expect(skipped.map((item) => [item.severity, item.sheet])).toEqual([
      ["info", "Notes"],
      ["info", "Empty"],
    ]);
    expect(skipped[1].message).toBe('Sheet "Empty" is empty and was skipped.');
    expect(Object.keys(result.mapping)).toEqual(["Timetable", "Notes"]);
  });

  it("reads only the sheets it is asked to read", () => {
    const result = parseTimetable(book(["January 2027", table([row(1)])], ["February 2027", table([row(1)])]), { sheets: ["February 2027"] });
    expect(result.days.map((day) => day.date)).toEqual(["2027-02-01"]);
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(["February 2027"]);
  });

  it("reports a sheet that was asked for and does not exist", () => {
    const result = parseTimetable(book(["Timetable", timetable]), { sheets: ["Timetable", "March"] });
    const error = only(result, "sheet-not-found");
    expect(error).toMatchObject({ severity: "error", sheet: null });
    expect(error.message).toBe('The file has no sheet called "March".');
    expect(result.days).toHaveLength(1);
  });

  it("names the sheet in row messages only when the workbook has several", () => {
    const bad = table([row("2027-01-01", { "Fajr Begins": "x" })]);
    expect(only(parseTimetable(book(["Timetable", bad])), "time-invalid").message).toMatch(/^Row 2, /);
    expect(only(parseTimetable(book(["Timetable", bad], ["Notes", [["hello"]]])), "time-invalid").message).toMatch(/^Sheet "Timetable", row 2, /);
  });

  it("puts remarks about the whole file first, then follows the sheets and rows", () => {
    const first = table([row("2027-01-01", {}, ["x"]), row("2027-01-02", { "Fajr Jamaat": "1:99" }, [null])], ["Volunteer on duty"]);
    const second = table([row("2027-01-04", { "Dhuhr Jamaat": "1:00" })]);
    const result = parseTimetable(book(["A", first], ["B", second]));
    expect(result.issues.map((item) => [item.code, item.sheet, item.rowNumber])).toEqual([
      ["missing-dates", null, null],
      ["pm-assumed", null, null],
      ["unmapped-columns", "A", null],
      ["time-invalid", "A", 3],
    ]);
  });
});

describe("parseTimetable: files with nothing in them", () => {
  it.each<[string, RawWorkbook]>([
    ["no sheets", { format: "xlsx", sheets: [] }],
    ["only blank cells", book(["Sheet1", [[], [null, "  "]]], ["Sheet2", []])],
  ])("reports an empty file (%s)", (_name, workbook) => {
    const result = parseTimetable(workbook);
    expect(result.days).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.sheets).toEqual([]);
    expect(result.issues).toEqual([{ severity: "error", code: "empty-file", message: "This file has no rows in it. Check that you picked the right file.", sheet: null, rowNumber: null }]);
    expect(result.summary).toMatchObject({ totalRows: 0, validDays: 0, firstDate: null, lastDate: null, dateOrderUsed: null });
  });

  it("reports that no timetable was found in a file of prose", () => {
    const result = parse([["Welcome to the masjid"], ["Open every day from Fajr to Isha"]]);
    expect(codes(result, "error")).toEqual(["no-timetable-found"]);
    expect(only(result, "no-timetable-found")).toMatchObject({ sheet: null, rowNumber: null });
    expect(result.days).toEqual([]);
  });

  it("reports that a blank template has nothing to import", () => {
    const result = parse(table([row("2027-01-01", NO_TIMES), row("2027-01-02", NO_TIMES)]));
    expect(result.days).toEqual([]);
    expect(codes(result)).toEqual(["nothing-to-import", "rows-without-times"]);
    expect(only(result, "nothing-to-import")).toMatchObject({ severity: "error", sheet: null });
    expect(result.summary).toMatchObject({ totalRows: 2, validDays: 0, skippedRows: 2, firstDate: null, lastDate: null });
  });
});

/** One small file per issue code. The type makes sure a new code gets a scenario. */
const SCENARIOS: Readonly<Record<IssueCode, { severity: IssueSeverity; run: () => ImportResult }>> = {
  "empty-file": { severity: "error", run: () => parseTimetable({ format: "csv", sheets: [] }) },
  "no-timetable-found": { severity: "error", run: () => parse([["Welcome to the masjid"], ["Open every day"]]) },
  "nothing-to-import": { severity: "error", run: () => parse(table([row("2027-01-01", NO_TIMES)])) },
  "sheet-not-found": { severity: "error", run: () => parse(table([row("2027-01-01")]), { sheets: ["March"] }) },
  "no-date-column": { severity: "error", run: () => parse([["Fajr", "Zuhr", "Asr"], ["06:25", "12:09", "13:46"]]) },
  "no-time-columns": { severity: "error", run: () => parse([["Date", "Day", "Hijri"], ["2027-01-01", "Fri", "22 Rajab 1448"]]) },
  "month-unknown": { severity: "error", run: () => parse(monthSheet(31), { year: 2027 }) },
  "year-unknown": { severity: "error", run: () => parseTimetable(book(["March", monthSheet(31)])) },
  "date-missing": { severity: "error", run: () => parse(table([row(null)])) },
  "date-invalid": { severity: "error", run: () => parse(table([row("the day after")])) },
  "time-invalid": { severity: "error", run: () => parse(table([row("2027-01-01", { "Fajr Jamaat": "6:4S" })])) },
  "times-out-of-order": { severity: "warning", run: () => parse(table([row("2027-01-01", { Sunrise: "05:06" })])) },
  "jamaat-before-begins": { severity: "warning", run: () => parse(table([row("2027-01-01", { "Fajr Jamaat": "06:05" })])) },
  "time-jump": { severity: "warning", run: () => parse(table([row("2027-01-01"), row("2027-01-02", { Sunrise: "09:06" })])) },
  "duplicate-date": { severity: "warning", run: () => parse(table([row("2027-01-01"), row("2027-01-01")])) },
  "missing-dates": { severity: "warning", run: () => parse(table([row("2027-01-01"), row("2027-01-03")])) },
  "rows-without-times": { severity: "warning", run: () => parse(table([row("2027-01-01"), row("2027-01-02", NO_TIMES)])) },
  "dates-far-from-year": { severity: "warning", run: () => parse(table([row("2017-01-01")]), { year: 2027 }) },
  "date-order-assumed": { severity: "warning", run: () => parse(table([row("01/02/2027"), row("08/02/2027")])) },
  "midnight-assumed": { severity: "warning", run: () => parse(table([row("2027-06-21", { "Isha Begins": "23:10", "Isha Jamaat": "12:05" })])) },
  "no-jamaat-columns": { severity: "warning", run: () => parse([SIMPLE_HEADERS, simpleRow("2027-01-01")]) },
  "no-begins-columns": { severity: "warning", run: () => parse([["Date", "Fajr Jamaat", "Isha Jamaat"], ["2027-01-01", "06:45", "18:00"]]) },
  "prayer-column-missing": { severity: "warning", run: () => parse(dropColumns(table([row("2027-01-01")]), "Fajr Begins")) },
  "prayer-not-found": { severity: "warning", run: () => parse(dropColumns(table([row("2027-01-01")]), "Asr Begins", "Asr Jamaat")) },
  "duplicate-column": { severity: "warning", run: () => parse(table([row("2027-01-01", {}, ["06:26"])], ["Fajr Begins"])) },
  "column-role-assumed": { severity: "warning", run: () => parse([["Date", "Fajr", "Fajr"], ["2027-01-01", "06:25", "06:45"]]) },
  "columns-differ-between-sheets": {
    severity: "warning",
    run: () => parseTimetable(book(["January 2027", table([row(1)])], ["February 2027", dropColumns(table([row(1)]), "Sunrise")])),
  },
  "sparse-jamaat-column": { severity: "warning", run: () => parse(changesOnlyRows()) },
  "ditto-without-value": { severity: "warning", run: () => parse(table([row("2027-01-01", { "Asr Jamaat": "ditto" })])) },
  "mapping-invalid": { severity: "warning", run: () => parse(table([row("2027-01-01")]), { mapping: { Sheet1: { date: 0, fajrBegins: 1, sunrise: 99 } } }) },
  "note-truncated": { severity: "warning", run: () => parse(table([row("2027-01-01", {}, ["long ".repeat(60)])], ["Note"])) },
  "pm-assumed": { severity: "info", run: () => parse(table([row("2027-01-01", { "Isha Jamaat": "6:00" })])) },
  "asr-two-columns": { severity: "info", run: () => parse([["Date", "Zuhr", "Asr Mithl 1", "Asr Mithl 2"], ["2027-01-01", "12:09", "13:46", "14:20"]]) },
  "sheet-skipped": { severity: "info", run: () => parseTimetable(book(["Timetable", table([row("2027-01-01")])], ["Notes", [["Ask the imam"]]])) },
  "row-skipped": { severity: "info", run: () => parse(table([row("2027-01-01"), ["Times may change"]])) },
  "unmapped-columns": { severity: "info", run: () => parse(table([row("2027-01-01", {}, ["Yusuf"])], ["Volunteer on duty"])) },
  "jumuah-not-friday": { severity: "info", run: () => parse(table([row("2027-01-02", {}, ["13:15"])], ["Jumuah"])) },
  "cells-filled-down": { severity: "info", run: () => parse(changesOnlyRows(), { fillDown: true }) },
};

describe("parseTimetable: every issue code", () => {
  it.each(ISSUE_CODES.map((code) => [code, SCENARIOS[code].severity] as const))("can report %s, as %s", (code, severity) => {
    const found = SCENARIOS[code].run().issues.filter((item) => item.code === code);
    expect(found.length).toBeGreaterThan(0);
    for (const item of found) expect(item.severity).toBe(severity);
  });

  it.each(ISSUE_CODES)("keeps its promises about the result when it reports %s", (code) => {
    const result = SCENARIOS[code].run();

    // Messages are sentences for a volunteer, never a leaked value.
    for (const item of result.issues) {
      expect(item.message).toMatch(/^[A-Z"0-9].*[.)]$/);
      expect(item.message).not.toMatch(/undefined|null|NaN|\[object/);
    }
    // A row's own issues are all in the list of all issues.
    for (const item of result.rows) {
      for (const rowIssue of item.issues) expect(result.issues).toContain(rowIssue);
      expect(item.day !== null).toBe(item.status === "ok" || item.status === "replaced");
    }
    // One day per date, sorted, and exactly the rows that were neither replaced nor rejected.
    const dates = result.days.map((day) => day.date);
    expect(dates).toEqual(Array.from(new Set(dates)).sort());
    expect(dates).toEqual(result.rows.filter((item) => item.status === "ok").map((item) => item.date).sort());
    // The summary counts what the lists hold.
    expect(result.summary.validDays).toBe(result.days.length);
    expect(result.summary.totalRows).toBe(result.rows.length);
    expect(result.summary.warnings).toBe(result.issues.filter((item) => item.severity === "warning").length);
    expect(result.summary.firstDate).toBe(dates.length > 0 ? dates[0] : null);
    expect(result.summary.lastDate).toBe(dates.length > 0 ? dates[dates.length - 1] : null);
    // Nothing usable always comes with an error that says why.
    if (result.days.length === 0) expect(result.issues.some((item) => item.severity === "error")).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
