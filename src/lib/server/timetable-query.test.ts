import { describe, expect, it } from "vitest";
import { MAX_TIMETABLE_RANGE_DAYS } from "@/lib/db/schemas";
import { addDays } from "@/lib/time";
import { parseTimetableQuery } from "./timetable-query";

/** Parses a query string the way the route does. */
function parse(query: string) {
  return parseTimetableQuery(new URLSearchParams(query));
}

/** The refusal message for a query that must be refused. */
function refusal(query: string): string {
  const result = parse(query);
  if (result.ok) throw new Error(`Expected "${query}" to be refused`);
  return result.message;
}

describe("parseTimetableQuery", () => {
  it("widens a month to its first and last day", () => {
    expect(parse("month=2026-11")).toEqual({
      ok: true,
      range: { from: "2026-11-01", to: "2026-11-30" },
    });
    expect(parse("month=2028-02")).toEqual({
      ok: true,
      range: { from: "2028-02-01", to: "2028-02-29" },
    });
    expect(parse("month=2027-02")).toEqual({
      ok: true,
      range: { from: "2027-02-01", to: "2027-02-28" },
    });
  });

  it("widens a year to 1 January and 31 December", () => {
    expect(parse("year=2026")).toEqual({
      ok: true,
      range: { from: "2026-01-01", to: "2026-12-31" },
    });
  });

  it("accepts an explicit range, a single day included", () => {
    expect(parse("from=2026-11-24&to=2026-12-30")).toEqual({
      ok: true,
      range: { from: "2026-11-24", to: "2026-12-30" },
    });
    expect(parse("to=2026-11-24&from=2026-11-24")).toEqual({
      ok: true,
      range: { from: "2026-11-24", to: "2026-11-24" },
    });
  });

  it("accepts a range of exactly the maximum length and refuses one day more", () => {
    const from = "2026-01-01";
    const longest = addDays(from, MAX_TIMETABLE_RANGE_DAYS - 1);
    expect(parse(`from=${from}&to=${longest}`).ok).toBe(true);
    expect(refusal(`from=${from}&to=${addDays(longest, 1)}`)).toBe(
      `to: The date range can cover at most ${MAX_TIMETABLE_RANGE_DAYS} days.`,
    );
  });

  it("ignores parameters it does not know", () => {
    expect(parse("month=2026-11&callback=x&_=123").ok).toBe(true);
  });

  it.each([
    ["month=2026-13", "month: Enter a month as YYYY-MM."],
    ["month=2026-1", "month: Enter a month as YYYY-MM."],
    ["month=", "month: Enter a month as YYYY-MM."],
    ["month=2026-11-01", "month: Enter a month as YYYY-MM."],
    ["year=26", "year: Enter a year as YYYY."],
    ["year=0000", "year: Enter a year as YYYY."],
    ["year=20266", "year: Enter a year as YYYY."],
    ["year=2026%20", "year: Enter a year as YYYY."],
    ["from=2026-02-30&to=2026-03-01", "from: Enter a date as YYYY-MM-DD."],
    ["from=2026-02-01&to=tomorrow", "to: Enter a date as YYYY-MM-DD."],
    ["from=2026-03-02&to=2026-03-01", "to: The end date must not be before the start date."],
  ])("refuses %s", (query, message) => {
    expect(refusal(query)).toBe(message);
  });

  it.each([
    "",
    "from=2026-01-01",
    "to=2026-01-01",
    "month=2026-01&year=2026",
    "month=2026-01&from=2026-01-01&to=2026-01-31",
    "year=2026&to=2026-01-31",
    "date=2026-01-01",
  ])("explains what to send when the query is %j", (query) => {
    expect(refusal(query)).toMatch(/^Ask for one of: month=YYYY-MM, year=YYYY, or from=/);
  });

  it("refuses a repeated parameter instead of picking one", () => {
    expect(refusal("month=2026-01&month=2026-02")).toBe(
      'The "month" parameter was given more than once.',
    );
    expect(refusal("from=2026-01-01&to=2026-01-02&to=2026-01-03")).toBe(
      'The "to" parameter was given more than once.',
    );
  });
});
