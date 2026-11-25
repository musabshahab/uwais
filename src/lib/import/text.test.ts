import { describe, expect, it } from "vitest";
import {
  cellText,
  collapseSpaces,
  columnLetter,
  formatList,
  formatRowRanges,
  isBlankCell,
  normaliseDigits,
  normaliseLabel,
  pad2,
  plural,
  quote,
  shortDate,
} from "./text";

describe("normaliseDigits", () => {
  it("converts Arabic-Indic, Eastern Arabic and full-width digits", () => {
    expect(normaliseDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normaliseDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normaliseDigits("０１２３４５６７８９")).toBe("0123456789");
  });

  it("leaves everything else alone", () => {
    expect(normaliseDigits("Fajr ٥:٣٠ ص")).toBe("Fajr 5:30 ص");
    expect(normaliseDigits("")).toBe("");
  });
});

describe("collapseSpaces", () => {
  it("unifies odd spaces, collapses runs and trims", () => {
    expect(collapseSpaces("  5:30 PM \t\n")).toBe("5:30 PM");
    expect(collapseSpaces("﻿Date")).toBe("Date");
  });
});

describe("normaliseLabel", () => {
  it.each([
    ["Fajr Jama'ah", "fajr jamaah"],
    ["FAJR_JAMA’AH", "fajr jamaah"],
    ["fajrJamaah", "fajr jamaah"],
    ["  Fajr -- Jama`ah  ", "fajr jamaah"],
    ["ʿAṣr", "asr"],
    ["Jumu'ah (2nd)", "jumuah 2"],
    ["asr_mithl_1", "asr mithl 1"],
    ["Jummah3", "jummah 3"],
    ["1st Jumuah", "1 jumuah"],
    ["Day/Date", "day date"],
    ["الظُّهْر", "الظهر"],
    ["إقامة", "اقامة"],
    ["Jumuah ٢", "jumuah 2"],
    ["", ""],
    ["---", ""],
  ])("reduces %j to %j", (label, expected) => {
    expect(normaliseLabel(label)).toBe(expected);
  });
});

describe("isBlankCell", () => {
  it("is true for null, undefined and whitespace only", () => {
    expect(isBlankCell(null)).toBe(true);
    expect(isBlankCell(undefined)).toBe(true);
    expect(isBlankCell("   ")).toBe(true);
    expect(isBlankCell("-")).toBe(false);
    expect(isBlankCell(0)).toBe(false);
    expect(isBlankCell(false)).toBe(false);
  });
});

describe("cellText", () => {
  it("shows cells the way the user recognises them", () => {
    expect(cellText(null)).toBe("");
    expect(cellText("  5:30  pm ")).toBe("5:30 pm");
    expect(cellText(5.3)).toBe("5.3");
    expect(cellText(true)).toBe("true");
    expect(cellText(new Date(Date.UTC(2027, 0, 31)))).toBe("2027-01-31");
    expect(cellText(new Date(Date.UTC(2027, 0, 31, 13, 5)))).toBe("2027-01-31 13:05");
    expect(cellText(new Date(Date.UTC(1899, 11, 30, 5, 30)))).toBe("05:30");
    expect(cellText(new Date(Date.UTC(1904, 0, 1, 17, 45)))).toBe("17:45");
    expect(cellText(new Date(Number.NaN))).toBe("");
  });
});

describe("message helpers", () => {
  it("quotes and cuts long text", () => {
    expect(quote("5:3o")).toBe('"5:3o"');
    expect(quote("a".repeat(60))).toBe(`"${"a".repeat(39)}…"`);
  });

  it("joins lists as prose", () => {
    expect(formatList([])).toBe("");
    expect(formatList(["a"])).toBe("a");
    expect(formatList(["a", "b"])).toBe("a and b");
    expect(formatList(["a", "b", "c"])).toBe("a, b and c");
  });

  it("puts nouns in the right number", () => {
    expect(plural(1, "row")).toBe("1 row");
    expect(plural(0, "row")).toBe("0 rows");
    expect(plural(3, "row")).toBe("3 rows");
    expect(plural(2, "entry", "entries")).toBe("2 entries");
  });

  it("pads to two digits", () => {
    expect(pad2(5)).toBe("05");
    expect(pad2(12)).toBe("12");
  });

  it("names columns like Excel", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(52)).toBe("BA");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
  });

  it("compresses row numbers into ranges", () => {
    expect(formatRowRanges([5])).toBe("5");
    expect(formatRowRanges([3, 4, 5, 9])).toBe("3-5 and 9");
    expect(formatRowRanges([9, 3, 5, 4])).toBe("3-5 and 9");
    expect(formatRowRanges([2, 4, 6, 8, 10, 12])).toBe("2, 4, 6, 8 and 2 more");
    expect(formatRowRanges([2, 4, 6], 5)).toBe("2, 4 and 6");
  });

  it("formats a date for a message", () => {
    expect(shortDate("2027-03-05")).toBe("5 Mar 2027");
    expect(shortDate("2028-12-31")).toBe("31 Dec 2028");
  });
});
