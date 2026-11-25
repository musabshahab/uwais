import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDateFull,
  formatDateRange,
  formatDateWithYear,
  formatDayOfMonth,
  formatList,
  formatTimestamp,
  plural,
} from "./text";

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(0, "day")).toBe("0 days");
    expect(plural(31, "day")).toBe("31 days");
  });

  it("accepts an irregular plural", () => {
    expect(plural(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("formatList", () => {
  it("joins as prose", () => {
    expect(formatList([])).toBe("");
    expect(formatList(["a"])).toBe("a");
    expect(formatList(["a", "b"])).toBe("a and b");
    expect(formatList(["a", "b", "c"])).toBe("a, b and c");
    expect(formatList(["a", "b", "c"], "or")).toBe("a, b or c");
  });
});

describe("formatBytes", () => {
  it("chooses a unit that reads naturally", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(840)).toBe("840 bytes");
    expect(formatBytes(320 * 1024)).toBe("320 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(7.44 * 1024 * 1024)).toBe("7.4 MB");
  });

  it("never throws on nonsense", () => {
    expect(formatBytes(Number.NaN)).toBe("0 bytes");
    expect(formatBytes(-5)).toBe("0 bytes");
  });
});

describe("date wording", () => {
  it("writes a full date without the weekday", () => {
    expect(formatDateFull("2026-11-25")).toBe("25 November 2026");
  });

  it("writes a compact date with the year", () => {
    expect(formatDateWithYear("2026-11-25")).toBe("Wed 25 Nov 2026");
  });

  it("writes a row label for a month grid", () => {
    expect(formatDayOfMonth("2027-01-01")).toBe("Fri 1");
  });

  it("says the year once when a range stays inside it", () => {
    expect(formatDateRange("2027-01-01", "2027-12-31")).toBe("1 January to 31 December 2027");
  });

  it("says both years when a range crosses new year", () => {
    expect(formatDateRange("2026-12-28", "2027-01-03")).toBe("28 December 2026 to 3 January 2027");
  });

  it("reads a one-day range as a date", () => {
    expect(formatDateRange("2027-03-05", "2027-03-05")).toBe("5 March 2027");
  });
});

describe("formatTimestamp", () => {
  it("shows the mosque's wall clock, not UTC", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST).
    expect(formatTimestamp("2026-06-30T23:30:00.000Z", "Europe/London", "24h")).toBe("Wed 1 Jul 2026, 00:30");
    expect(formatTimestamp("2026-06-30T23:30:00.000Z", "Asia/Karachi", "12h")).toBe("Wed 1 Jul 2026, 4:30 AM");
  });

  it("falls back to a placeholder for an unreadable timestamp", () => {
    expect(formatTimestamp("not a date", "Europe/London", "12h")).toBe("Unknown time");
    expect(formatTimestamp("", "Europe/London", "12h", "n/a")).toBe("n/a");
  });
});
