import { describe, expect, it } from "vitest";
import { detectDateOrder, isWeekdayName, parseDateCell, parseMonthName, readDateParts, readMonthYear, resolveDate } from "./date-cell";
import type { DateCellContext } from "./date-cell";
import type { RawCell } from "./types";

const DMY: DateCellContext = { dateOrder: "dmy" };
const MDY: DateCellContext = { dateOrder: "mdy" };

/** An Excel date cell as exceljs delivers it: midnight UTC of the date. */
function excelDate(year: number, month: number, day: number, ms = 0): Date {
  return new Date(Date.UTC(year, month - 1, day) + ms);
}

describe("parseDateCell: complete dates", () => {
  it.each([
    ["2027-01-31", "2027-01-31"],
    ["2027-1-5", "2027-01-05"],
    ["2027/01/31", "2027-01-31"],
    ["2027.01.31", "2027-01-31"],
    ["20270131", "2027-01-31"],
    ["2027-01-31T00:00:00.000Z", "2027-01-31"],
    ["2027-01-31 00:00:00", "2027-01-31"],
    ["31/01/2027", "2027-01-31"],
    ["31-01-2027", "2027-01-31"],
    ["31.01.2027", "2027-01-31"],
    ["31.01.2027.", "2027-01-31"],
    ["31 01 2027", "2027-01-31"],
    ["31/01/2027 00:00", "2027-01-31"],
    ["31-01-27", "2027-01-31"],
    ["1/2/27", "2027-02-01"],
    ["31 Jan 2027", "2027-01-31"],
    ["31 January 2027", "2027-01-31"],
    ["31-Jan-2027", "2027-01-31"],
    ["31-Jan-27", "2027-01-31"],
    ["31 Jan '27", "2027-01-31"],
    ["Jan 31, 2027", "2027-01-31"],
    ["January 31 2027", "2027-01-31"],
    ["2027 Jan 31", "2027-01-31"],
    ["Friday 1 January 2027", "2027-01-01"],
    ["Fri, 1st Jan 2027", "2027-01-01"],
    ["1st of January 2027", "2027-01-01"],
    ["Sunday, September 5, 2027", "2027-09-05"],
    ["5 Sept 2027", "2027-09-05"],
    ["٣١/٠١/٢٠٢٧", "2027-01-31"],
    ["  31/01/2027  ", "2027-01-31"],
  ])("reads %j as %s", (text, expected) => {
    expect(parseDateCell(text, DMY)).toBe(expected);
  });

  it("reads month-first dates when told to", () => {
    expect(parseDateCell("1/31/2027", MDY)).toBe("2027-01-31");
    expect(parseDateCell("01/02/2027", MDY)).toBe("2027-01-02");
    expect(parseDateCell("01/02/2027", DMY)).toBe("2027-02-01");
    expect(parseDateCell("01/02/27", MDY)).toBe("2027-01-02");
  });

  it("reads year-first two-digit dates when told to", () => {
    expect(parseDateCell("27-01-31", { dateOrder: "ymd" })).toBe("2027-01-31");
    // A four-digit year at the end still wins over the configured order.
    expect(parseDateCell("31-01-2027", { dateOrder: "ymd" })).toBe("2027-01-31");
  });

  it("recognises a four-digit year wherever it stands, regardless of the order", () => {
    expect(parseDateCell("2027-01-31", MDY)).toBe("2027-01-31");
    expect(parseDateCell("2027-12-01", MDY)).toBe("2027-12-01");
  });

  it("returns null for dates that do not exist or use the wrong order", () => {
    expect(parseDateCell("31/02/2027", DMY)).toBeNull();
    expect(parseDateCell("29/02/2027", DMY)).toBeNull();
    expect(parseDateCell("29/02/2028", DMY)).toBe("2028-02-29");
    expect(parseDateCell("1/31/2027", DMY)).toBeNull();
    expect(parseDateCell("31/01/2027", MDY)).toBeNull();
    expect(parseDateCell("00/01/2027", DMY)).toBeNull();
    expect(parseDateCell("2027-13-01", DMY)).toBeNull();
  });

  it.each(["", "   ", "hello", "Total", "5:30", "12345", "1/2/3/4", "32", "0", "31/01/1/2027", "0027-01-31", "31/01/3027", "1/2/7", "Jan 31 5", null, true])(
    "returns null for %j",
    (value) => {
      expect(parseDateCell(value as RawCell, { dateOrder: "dmy", year: 2027, month: 1 })).toBeNull();
    },
  );
});

describe("parseDateCell: Excel values", () => {
  it("reads a date cell by its UTC date, whatever the server timezone", () => {
    expect(parseDateCell(excelDate(2027, 1, 31), DMY)).toBe("2027-01-31");
    expect(parseDateCell(excelDate(2028, 2, 29), DMY)).toBe("2028-02-29");
    expect(parseDateCell(excelDate(2027, 12, 31), DMY)).toBe("2027-12-31");
  });

  it("absorbs floating-point noise around midnight and ignores a time of day", () => {
    expect(parseDateCell(excelDate(2027, 1, 31, -1), DMY)).toBe("2027-01-31");
    expect(parseDateCell(excelDate(2027, 1, 31, 1), DMY)).toBe("2027-01-31");
    expect(parseDateCell(new Date(Date.UTC(2027, 0, 31, 13, 30)), DMY)).toBe("2027-01-31");
  });

  it("rejects a bare time cell and an invalid Date", () => {
    expect(parseDateCell(new Date(Date.UTC(1899, 11, 30, 5, 30)), DMY)).toBeNull();
    expect(parseDateCell(new Date(Number.NaN), DMY)).toBeNull();
  });

  it("reads serial numbers in the 1900 date system", () => {
    // 46053 is 31 January 2026 in Excel.
    expect(parseDateCell(46053, DMY)).toBe("2026-01-31");
    expect(parseDateCell(46418, DMY)).toBe("2027-01-31");
    expect(parseDateCell(46418.75, DMY)).toBe("2027-01-31");
    expect(parseDateCell(46417.9999999999, DMY)).toBe("2027-01-31");
  });

  it("honours the 1904 date system for serial numbers", () => {
    expect(parseDateCell(46418 - 1462, { dateOrder: "dmy", date1904: true })).toBe("2027-01-31");
    expect(parseDateCell(46418, { dateOrder: "dmy", date1904: true })).toBe("2031-02-01");
  });

  it("only accepts serial numbers in a plausible range of years", () => {
    expect(parseDateCell(32873, DMY)).toBeNull(); // 31 December 1989
    expect(parseDateCell(32874, DMY)).toBe("1990-01-01");
    expect(parseDateCell(73415, DMY)).toBe("2100-12-31");
    expect(parseDateCell(73416, DMY)).toBeNull();
    expect(parseDateCell(400, DMY)).toBeNull();
    expect(parseDateCell(-5, DMY)).toBeNull();
    expect(parseDateCell(0.5, DMY)).toBeNull();
  });

  it("reads a number written as YYYYMMDD", () => {
    expect(parseDateCell(20270131, DMY)).toBe("2027-01-31");
    expect(parseDateCell(20271331, DMY)).toBeNull();
  });
});

describe("parseDateCell: dates that need context", () => {
  it("takes the year from the context for dates without one", () => {
    expect(parseDateCell("Fri 1 Jan", { dateOrder: "dmy", year: 2027 })).toBe("2027-01-01");
    expect(parseDateCell("1 Jan", { dateOrder: "dmy", year: 2027 })).toBe("2027-01-01");
    expect(parseDateCell("Jan 1", { dateOrder: "dmy", year: 2027 })).toBe("2027-01-01");
    expect(parseDateCell("31/01", { dateOrder: "dmy", year: 2027 })).toBe("2027-01-31");
    expect(parseDateCell("01/31", { dateOrder: "mdy", year: 2027 })).toBe("2027-01-31");
    expect(parseDateCell("1 Jan", DMY)).toBeNull();
  });

  it("takes month and year from the context for a bare day of the month", () => {
    const march: DateCellContext = { dateOrder: "dmy", year: 2027, month: 3 };
    expect(parseDateCell(14, march)).toBe("2027-03-14");
    expect(parseDateCell("14", march)).toBe("2027-03-14");
    expect(parseDateCell("14th", march)).toBe("2027-03-14");
    expect(parseDateCell("Fri 14", march)).toBe("2027-03-14");
    expect(parseDateCell("14Sun", march)).toBe("2027-03-14");
    expect(parseDateCell("Sunday 14th", march)).toBe("2027-03-14");
    expect(parseDateCell(14, { dateOrder: "dmy", year: 2027 })).toBeNull();
    expect(parseDateCell(14, { dateOrder: "dmy", month: 3 })).toBeNull();
  });

  it("checks the day against the month and year it lands in", () => {
    expect(parseDateCell(31, { dateOrder: "dmy", year: 2027, month: 4 })).toBeNull();
    expect(parseDateCell(29, { dateOrder: "dmy", year: 2027, month: 2 })).toBeNull();
    expect(parseDateCell(29, { dateOrder: "dmy", year: 2028, month: 2 })).toBe("2028-02-29");
    expect(parseDateCell("29 Feb", { dateOrder: "dmy", year: 2027 })).toBeNull();
    expect(parseDateCell("29 Feb", { dateOrder: "dmy", year: 2028 })).toBe("2028-02-29");
  });
});

describe("readDateParts", () => {
  it("tells the kinds of content apart", () => {
    expect(readDateParts(null)).toEqual({ kind: "empty" });
    expect(readDateParts(undefined)).toEqual({ kind: "empty" });
    expect(readDateParts("  ")).toEqual({ kind: "empty" });
    expect(readDateParts("31/01/2027")).toEqual({ kind: "full", year: 2027, month: 1, day: 31 });
    expect(readDateParts("31 Jan")).toEqual({ kind: "month-day", month: 1, day: 31 });
    expect(readDateParts(7)).toEqual({ kind: "day", day: 7 });
    expect(readDateParts("March")).toEqual({ kind: "month", month: 3, year: null });
    expect(readDateParts("MARCH 2027")).toEqual({ kind: "month", month: 3, year: 2027 });
    expect(readDateParts("Jumu'ah at 1:15")).toEqual({ kind: "invalid" });
    expect(readDateParts(false)).toEqual({ kind: "invalid" });
  });

  it("accepts 29 February without a year and leaves the check to the caller", () => {
    expect(readDateParts("29 Feb")).toEqual({ kind: "month-day", month: 2, day: 29 });
    expect(readDateParts("30 Feb")).toEqual({ kind: "invalid" });
  });

  it("does not take a weekday name for a date", () => {
    expect(readDateParts("Monday")).toEqual({ kind: "invalid" });
  });
});

describe("resolveDate", () => {
  it("builds a date or returns null when a part is missing or impossible", () => {
    expect(resolveDate(2027, 3, 14)).toBe("2027-03-14");
    expect(resolveDate(undefined, 3, 14)).toBeNull();
    expect(resolveDate(2027, undefined, 14)).toBeNull();
    expect(resolveDate(2027, 2, 30)).toBeNull();
  });
});

describe("detectDateOrder", () => {
  it("is day-first when a first number is above 12", () => {
    expect(detectDateOrder(["01/02/2027", "13/02/2027", "03/02/2027"])).toEqual({ order: "dmy", basis: "evidence" });
  });

  it("is month-first when a second number is above 12", () => {
    expect(detectDateOrder(["01/02/2027", "01/13/2027"])).toEqual({ order: "mdy", basis: "evidence" });
    expect(detectDateOrder(["1/31/2027"], "dmy")).toEqual({ order: "mdy", basis: "evidence" });
  });

  it("uses the run of consecutive days when no number is above 12", () => {
    const dayFirst = ["01/02/2027", "02/02/2027", "03/02/2027", "04/02/2027"];
    const monthFirst = ["02/01/2027", "02/02/2027", "02/03/2027", "02/04/2027"];
    expect(detectDateOrder(dayFirst)).toEqual({ order: "dmy", basis: "sequence" });
    expect(detectDateOrder(monthFirst)).toEqual({ order: "mdy", basis: "sequence" });
    // The fallback does not override what the sequence shows.
    expect(detectDateOrder(dayFirst, "mdy")).toEqual({ order: "dmy", basis: "sequence" });
  });

  it("falls back to the caller's default when the values do not decide", () => {
    expect(detectDateOrder(["01/02/2027"])).toEqual({ order: "dmy", basis: "default" });
    expect(detectDateOrder(["01/02/2027"], "mdy")).toEqual({ order: "mdy", basis: "default" });
    // Weekly rows: neither order makes them consecutive.
    expect(detectDateOrder(["01/02/2027", "08/02/2027"])).toEqual({ order: "dmy", basis: "default" });
  });

  it("reports that the order does not matter when no value depends on it", () => {
    expect(detectDateOrder(["2027-02-01", "2027-02-02"])).toEqual({ order: "dmy", basis: "none" });
    expect(detectDateOrder(["1 Feb 2027", new Date(Date.UTC(2027, 1, 2)), 46419, null, "Date"])).toEqual({ order: "dmy", basis: "none" });
    expect(detectDateOrder([])).toEqual({ order: "dmy", basis: "none" });
  });

  it("decides dates without a year the same way", () => {
    expect(detectDateOrder(["31/01", "01/02"])).toEqual({ order: "dmy", basis: "evidence" });
    expect(detectDateOrder(["01/02", "02/02", "03/02"])).toEqual({ order: "dmy", basis: "sequence" });
    expect(detectDateOrder(["02/01", "02/02", "02/03"])).toEqual({ order: "mdy", basis: "sequence" });
  });

  it("considers year-first only for dates written as three two-digit numbers", () => {
    // The Daily Prayer Time plugin's own sample file is written this way.
    expect(detectDateOrder(["18-01-01", "18-01-02", "18-01-03"])).toEqual({ order: "ymd", basis: "sequence" });
    expect(detectDateOrder(["27-01-30", "27-01-31", "27-02-01"])).toEqual({ order: "ymd", basis: "sequence" });
    // A first number above 31 can only be a year.
    expect(detectDateOrder(["32-01-30"])).toEqual({ order: "ymd", basis: "evidence" });
    // A UK file with two-digit years stays day-first.
    expect(detectDateOrder(["01/01/27", "02/01/27", "03/01/27"])).toEqual({ order: "dmy", basis: "sequence" });
    expect(detectDateOrder(["01/02/03"])).toEqual({ order: "dmy", basis: "default" });
  });

  it("ignores cells that are not numeric dates, such as a repeated header", () => {
    expect(detectDateOrder(["Date", "", "13/02/2027", "notes"])).toEqual({ order: "dmy", basis: "evidence" });
  });

  it("picks the order that reads the most values when the column is inconsistent", () => {
    expect(detectDateOrder(["13/02/2027", "14/02/2027", "02/15/2027"])).toEqual({ order: "dmy", basis: "evidence" });
  });
});

describe("readMonthYear", () => {
  it.each([
    ["March", 3, null],
    ["MAR", 3, null],
    ["Mar 2027", 3, 2027],
    ["March-2027", 3, 2027],
    ["2027 March", 3, 2027],
    ["Jan 27", 1, 2027],
    ["Jan-27", 1, 2027],
    ["Sept", 9, null],
    ["03", 3, null],
    ["12", 12, null],
    ["2027-03", 3, 2027],
    ["03-2027", 3, 2027],
    ["Prayer times - March 2027", 3, 2027],
    ["timetable-2027", null, 2027],
    ["Ramadan 1448 (Feb-Mar 2027)", 2, 2027],
    ["Sheet1", null, null],
    ["13", null, null],
    ["Timetable", null, null],
    ["", null, null],
  ])("reads %j as month %j, year %j", (text, month, year) => {
    expect(readMonthYear(text)).toEqual({ month, year });
  });

  it("does not take a small number next to a month for a year", () => {
    expect(readMonthYear("March 5")).toEqual({ month: 3, year: null });
  });

  it('only trusts the word "may" in short texts', () => {
    expect(readMonthYear("May")).toEqual({ month: 5, year: null });
    expect(readMonthYear("May 2027")).toEqual({ month: 5, year: 2027 });
    expect(readMonthYear("Jamaat times may change at short notice")).toEqual({ month: null, year: null });
  });

  it("ignores years that cannot be a timetable year", () => {
    expect(readMonthYear("Ramadan 1448")).toEqual({ month: null, year: null });
  });
});

describe("month and weekday names", () => {
  it("recognises month names and abbreviations", () => {
    expect(parseMonthName("January")).toBe(1);
    expect(parseMonthName(" sept. ")).toBe(9);
    expect(parseMonthName("DEC")).toBe(12);
    expect(parseMonthName("Mon")).toBeNull();
    expect(parseMonthName("")).toBeNull();
  });

  it("recognises weekday names and abbreviations", () => {
    expect(isWeekdayName("Fri")).toBe(true);
    expect(isWeekdayName("thurs.")).toBe(true);
    expect(isWeekdayName("SUNDAY")).toBe(true);
    expect(isWeekdayName("March")).toBe(false);
  });
});
