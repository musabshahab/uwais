import { describe, expect, it } from "vitest";
import { guessMapping } from "./columns";
import { detectTable } from "./detect";
import type { RawCell, RawSheet } from "./types";

/** A sheet from rows of cells. */
function sheet(rows: RawCell[][], name = "Sheet1"): RawSheet {
  return { name, rows };
}

/** The labels of the detected columns. */
function labels(rows: RawCell[][]): string[] {
  return detectTable(sheet(rows))?.columns.map((column) => column.label) ?? [];
}

const DATA_ROW: RawCell[] = [1, "Mon", "5:11", "5:45", "6:46", "12:18", "1:00"];

describe("detectTable: locating the header", () => {
  it("returns null for an empty sheet", () => {
    expect(detectTable(sheet([]))).toBeNull();
    expect(detectTable(sheet([[], [null, "  "], []]))).toBeNull();
  });

  it("finds a header in the first row", () => {
    const table = detectTable(sheet([["Date", "Fajr", "Sunrise", "Zuhr"], ["2027-01-01", "06:25", "08:06", "12:09"]]));
    expect(table).toMatchObject({ headerRowIndex: 0, headerRowCount: 1, dataStartIndex: 1, titles: [], repeatedHeaderRows: [] });
    expect(table?.columns.map((column) => [column.index, column.letter, column.label])).toEqual([
      [0, "A", "Date"],
      [1, "B", "Fajr"],
      [2, "C", "Sunrise"],
      [3, "D", "Zuhr"],
    ]);
  });

  it("skips title rows, blank rows and a merged title above the header", () => {
    const title = "Masjid Uwais - Prayer Timetable";
    const table = detectTable(
      sheet([
        [title, title, title, title],
        ["March 2027"],
        [],
        ["Jumu'ah 1:15", null, "Prayer times"],
        ["Date", "Fajr", "Sunrise", "Zuhr"],
        [1, "5:11", "6:46", "12:18"],
      ]),
    );
    expect(table).toMatchObject({ headerRowIndex: 4, headerRowCount: 1, dataStartIndex: 5 });
    expect(table?.titles).toEqual([title, "March 2027", "Jumu'ah 1:15 Prayer times"]);
  });

  it("is not fooled by a data row that mentions Friday and Jumu'ah", () => {
    const table = detectTable(
      sheet([
        ["Date", "Day", "Fajr", "Zuhr", "Note"],
        ["2027-01-01", "Friday", "6:25", "12:09", "Jumu'ah"],
        ["2027-01-02", "Saturday", "6:25", "12:09", null],
      ]),
    );
    expect(table).toMatchObject({ headerRowIndex: 0, headerRowCount: 1, repeatedHeaderRows: [] });
  });

  it("only looks for the header near the top of the sheet", () => {
    const filler: RawCell[][] = Array.from({ length: 30 }, (_, index) => [`line ${index}`]);
    const table = detectTable(sheet([...filler, ["Date", "Fajr", "Zuhr"], ["2027-01-01", "6:25", "12:09"]]));
    expect(table?.headerRowIndex).toBeNull();
  });

  it("describes a sheet without a recognisable header so it can be mapped by hand", () => {
    const table = detectTable(sheet([[], [2, 9, 5.45, 6.15], [2, 10, 5.44, 6.15]]));
    expect(table).toMatchObject({ headerRowIndex: null, headerRowCount: 0, dataStartIndex: 1, titles: [] });
    expect(table?.columns.map((column) => [column.letter, column.label, column.samples])).toEqual([
      ["A", "", ["2", "2"]],
      ["B", "", ["9", "10"]],
      ["C", "", ["5.45", "5.44"]],
      ["D", "", ["6.15", "6.15"]],
    ]);
  });

  it("reports header rows repeated inside the data", () => {
    const header: RawCell[] = ["Date", "Fajr", "Zuhr"];
    const table = detectTable(sheet([header, ["2027-01-01", "6:25", "12:09"], [], header, ["2027-01-02", "6:25", "12:09"], header]));
    expect(table?.repeatedHeaderRows).toEqual([3, 5]);
    // The repeated header's text is not taken for a sample value.
    expect(table?.columns[0].samples).toEqual(["2027-01-01", "2027-01-02"]);
  });
});

describe("detectTable: multi-row headers", () => {
  it("joins a prayer row with the Begins / Jama'ah row below it (merged cells exported as blanks)", () => {
    const rows: RawCell[][] = [
      ["Date", "Day", "Fajr", null, "Sunrise", "Zuhr", null],
      [null, null, "Begins", "Jama'ah", null, "Begins", "Jama'ah"],
      DATA_ROW,
    ];
    expect(detectTable(sheet(rows))).toMatchObject({ headerRowIndex: 0, headerRowCount: 2, dataStartIndex: 2 });
    expect(labels(rows)).toEqual(["Date", "Day", "Fajr Begins", "Fajr Jama'ah", "Sunrise", "Zuhr Begins", "Zuhr Jama'ah"]);
  });

  it("joins the same header when merged cells were expanded (Excel)", () => {
    const rows: RawCell[][] = [
      ["Date", "Day", "Fajr", "Fajr", "Sunrise", "Zuhr", "Zuhr"],
      ["Date", "Day", "Begins", "Jama'ah", "Sunrise", "Begins", "Jama'ah"],
      DATA_ROW,
    ];
    expect(labels(rows)).toEqual(["Date", "Day", "Fajr Begins", "Fajr Jama'ah", "Sunrise", "Zuhr Begins", "Zuhr Jama'ah"]);
  });

  it("joins group headings above the prayer names (the reverse layout)", () => {
    const rows: RawCell[][] = [
      [null, "Beginning Time", null, null, "Jamaat Time", null],
      ["Date", "Fajr", "Sunrise", "Zuhr", "Fajr", "Zuhr"],
      ["2027-01-01", "6:25", "8:06", "12:09", "6:45", "1:00"],
    ];
    expect(detectTable(sheet(rows))).toMatchObject({ headerRowIndex: 0, headerRowCount: 2, dataStartIndex: 2 });
    expect(labels(rows)).toEqual(["Date", "Beginning Time Fajr", "Beginning Time Sunrise", "Beginning Time Zuhr", "Jamaat Time Fajr", "Jamaat Time Zuhr"]);
  });

  it("does not stretch a group heading over a column that is not part of the group", () => {
    const rows: RawCell[][] = [
      ["Date", "Isha", null, null, null],
      [null, "Begins", "Jama'ah", "Notes", "Zawal"],
      ["2027-01-01", "5:38", "6:00", null, "12:05"],
    ];
    expect(labels(rows)).toEqual(["Date", "Isha Begins", "Isha Jama'ah", "Notes", "Zawal"]);
  });

  it("joins up to three header rows", () => {
    const rows: RawCell[][] = [
      ["Date", "Fajr", null, "Zuhr", null],
      ["التاريخ", "الفجر", null, "الظهر", null],
      [null, "Begins", "Jama'ah", "Begins", "Jama'ah"],
      ["2027-01-01", "6:25", "6:45", "12:09", "1:00"],
    ];
    expect(detectTable(sheet(rows))).toMatchObject({ headerRowIndex: 0, headerRowCount: 3, dataStartIndex: 3 });
    const table = detectTable(sheet(rows));
    expect(table?.columns.map((column) => column.label)).toEqual(["Date التاريخ", "Fajr الفجر Begins", "الفجر Jama'ah", "Zuhr الظهر Begins", "الظهر Jama'ah"]);
    expect(guessMapping(table?.columns ?? [])).toMatchObject({ date: 0, fajrBegins: 1, fajrJamaat: 2, dhuhrBegins: 3, dhuhrJamaat: 4 });
  });

  it("does not take the first data row for a second header row", () => {
    const rows: RawCell[][] = [["Date", "Fajr", "Zuhr"], ["Fri 1 Jan", "6:25", "12:09"], ["Sat 2 Jan", "6:25", "12:09"]];
    expect(detectTable(sheet(rows))).toMatchObject({ headerRowCount: 1, dataStartIndex: 1 });
  });
});

describe("detectTable: describing columns", () => {
  it("lists a column that has values but no heading, and drops one that has neither", () => {
    const table = detectTable(sheet([["Date", "Fajr", null, null, "Zuhr"], ["2027-01-01", "6:25", null, "x", "12:09"]]));
    expect(table?.columns.map((column) => [column.index, column.label])).toEqual([
      [0, "Date"],
      [1, "Fajr"],
      [3, ""],
      [4, "Zuhr"],
    ]);
  });

  it("gives the first values of each column as samples, formatted as the user sees them", () => {
    const table = detectTable(
      sheet([
        ["Date", "Fajr", "Zuhr"],
        [new Date(Date.UTC(2027, 0, 1)), new Date(Date.UTC(1899, 11, 30, 6, 25)), 0.5],
        [new Date(Date.UTC(2027, 0, 2)), null, "12:10"],
        [new Date(Date.UTC(2027, 0, 3)), "6:24", "12:10"],
        [new Date(Date.UTC(2027, 0, 4)), "6:24", "12:11"],
      ]),
    );
    expect(table?.columns.map((column) => column.samples)).toEqual([
      ["2027-01-01", "2027-01-02", "2027-01-03"],
      ["06:25", "6:24", "6:24"],
      ["0.5", "12:10", "12:10"],
    ]);
  });

  it.each<[string, RawCell[], string]>([
    ["full dates as text", ["2027-01-01", "02/01/2027", "Sun 3 Jan"], "date"],
    ["Excel date cells", [new Date(Date.UTC(2027, 0, 1)), new Date(Date.UTC(2027, 0, 2))], "date"],
    ["Excel serial dates", [46388, 46389], "date"],
    ["day numbers", [1, 2, 3, "4", "5th"], "day-number"],
    ["day numbers fused with weekdays", ["1Fri", "2Sat", "Sun 3"], "day-number"],
    ["weekday names", ["Mon", "Tue", "Wednesday"], "weekday"],
    ["month names", ["January", "Jan", "Feb"], "month"],
    ["times", ["6:25", "6:24", new Date(Date.UTC(1899, 11, 30, 6, 25))], "other"],
    ["a mixture", ["Mon", 2, "2027-01-03", "x"], "other"],
    ["nothing", [null, null], "empty"],
  ])("recognises a column of %s", (_name, values, expected) => {
    const rows: RawCell[][] = [["Date", "Fajr"], ...values.map((value): RawCell[] => [value, "6:25"])];
    expect(detectTable(sheet(rows))?.columns[0].content).toBe(expected);
  });

  it("goes by the majority of the values, so a stray footer does not change the verdict", () => {
    const rows: RawCell[][] = [["Date", "Fajr"], [1, "6:25"], [2, "6:25"], [3, "6:24"], ["Jumu'ah at 1:15", null]];
    expect(detectTable(sheet(rows))?.columns[0].content).toBe("day-number");
  });
});
