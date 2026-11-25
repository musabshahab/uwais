import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_CONTENT_TYPES,
  EXPORT_FORMATS,
  attachmentDisposition,
  exportFileName,
  parseExportQuery,
} from "./export-request";

/** Parses a query string as the route does. */
function parse(query: string) {
  return parseExportQuery(new URLSearchParams(query));
}

describe("parseExportQuery", () => {
  it("serves csv when no format is named", () => {
    expect(DEFAULT_EXPORT_FORMAT).toBe("csv");
    expect(parse("year=2027")).toStrictEqual({
      ok: true,
      format: "csv",
      range: { from: "2027-01-01", to: "2027-12-31" },
    });
  });

  it.each(EXPORT_FORMATS)("accepts format=%s", (format) => {
    expect(parse(`format=${format}&year=2027`)).toMatchObject({ ok: true, format });
  });

  it.each([
    ["a calendar year", "year=2028", { from: "2028-01-01", to: "2028-12-31" }],
    ["a calendar month", "month=2028-02", { from: "2028-02-01", to: "2028-02-29" }],
    ["explicit dates", "from=2027-03-10&to=2027-04-09", { from: "2027-03-10", to: "2027-04-09" }],
    ["a single day", "from=2027-03-10&to=2027-03-10", { from: "2027-03-10", to: "2027-03-10" }],
    ["the longest range", "from=2027-01-01&to=2028-02-04", { from: "2027-01-01", to: "2028-02-04" }],
  ])("reads %s", (_name, query, range) => {
    expect(parse(`format=xlsx&${query}`)).toStrictEqual({ ok: true, format: "xlsx", range });
  });

  it.each([
    ["an unknown format", "format=pdf&year=2027", /format: ask for csv or xlsx/],
    ["a blank format", "format=&year=2027", /format: ask for csv or xlsx/],
    ["a format in capitals", "format=CSV&year=2027", /format: ask for csv or xlsx/],
    ["two formats", "format=csv&format=xlsx&year=2027", /"format" parameter was given more than once/],
    ["no period", "format=csv", /Ask for one of/],
    ["nothing at all", "", /Ask for one of/],
    ["a year and a month", "year=2027&month=2027-03", /Ask for one of/],
    ["a first day without a last", "from=2027-03-10", /Ask for one of/],
    ["a two-digit year", "year=27", /year: Enter a year as YYYY/],
    ["a year with a sign", "year=-2027", /year: Enter a year as YYYY/],
    ["year 0000", "year=0000", /year: Enter a year as YYYY/],
    ["two years", "year=2027&year=2028", /"year" parameter was given more than once/],
    ["a month that does not exist", "month=2027-13", /month: Enter a month as YYYY-MM/],
    ["a date that does not exist", "from=2027-02-30&to=2027-03-01", /from: Enter a date as YYYY-MM-DD/],
    ["a range that runs backwards", "from=2027-03-10&to=2027-03-01", /to: The end date must not be before/],
    ["a range that is too long", "from=2027-01-01&to=2028-02-05", /to: The date range can cover at most 400 days/],
  ])("refuses %s", (_name, query, message) => {
    const result = parse(query);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toMatch(message);
  });

  it("ignores parameters it does not know", () => {
    expect(parse("year=2027&download=1&utm_source=newsletter")).toMatchObject({ ok: true, format: "csv" });
  });
});

describe("exportFileName", () => {
  it.each([
    ["a calendar year", { from: "2027-01-01", to: "2027-12-31" }, "csv", "timetable-2027.csv"],
    ["a leap year", { from: "2028-01-01", to: "2028-12-31" }, "xlsx", "timetable-2028.xlsx"],
    ["a calendar month", { from: "2027-03-01", to: "2027-03-31" }, "xlsx", "timetable-2027-03.xlsx"],
    ["February of a leap year", { from: "2028-02-01", to: "2028-02-29" }, "csv", "timetable-2028-02.csv"],
    [
      "February cut a day short",
      { from: "2028-02-01", to: "2028-02-28" },
      "csv",
      "timetable-2028-02-01-to-2028-02-28.csv",
    ],
    [
      "part of a month",
      { from: "2027-03-10", to: "2027-03-31" },
      "csv",
      "timetable-2027-03-10-to-2027-03-31.csv",
    ],
    [
      "several months",
      { from: "2027-03-01", to: "2027-04-30" },
      "xlsx",
      "timetable-2027-03-01-to-2027-04-30.xlsx",
    ],
    [
      "twelve months that are not a calendar year",
      { from: "2027-04-01", to: "2028-03-31" },
      "csv",
      "timetable-2027-04-01-to-2028-03-31.csv",
    ],
    [
      "a single day",
      { from: "2027-03-10", to: "2027-03-10" },
      "csv",
      "timetable-2027-03-10-to-2027-03-10.csv",
    ],
  ] as const)("names %s", (_name, range, format, expected) => {
    const name = exportFileName(range, format);
    expect(name).toBe(expected);
    // Nothing a Content-Disposition header would need to quote or encode.
    expect(name).toMatch(/^[a-z0-9.-]+$/);
  });
});

describe("attachmentDisposition", () => {
  it("asks the browser to save the response under the file name", () => {
    expect(attachmentDisposition("timetable-2027.csv")).toBe('attachment; filename="timetable-2027.csv"');
  });
});

describe("EXPORT_CONTENT_TYPES", () => {
  it("declares the csv as UTF-8 text and the workbook as an Excel file", () => {
    expect(EXPORT_CONTENT_TYPES.csv).toBe("text/csv; charset=utf-8");
    expect(EXPORT_CONTENT_TYPES.xlsx).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});
