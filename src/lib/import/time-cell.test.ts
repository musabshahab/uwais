import { describe, expect, it } from "vitest";
import type { RawCell, TimeCellField } from "./types";
import { isDittoText, isEmptyTimeText, parseTimeCell } from "./time-cell";

/** The time read from a cell, for the common case where only the time matters. */
function time(value: RawCell, field: TimeCellField = "fajrBegins"): string | null {
  return parseTimeCell(value, field).time;
}

/** An Excel time-only cell as exceljs delivers it: a moment on 1899-12-30, in UTC. */
function excelTime(hour: number, minute: number, second = 0, ms = 0): Date {
  return new Date(Date.UTC(1899, 11, 30, hour, minute, second, ms));
}

describe("parseTimeCell: text notations", () => {
  it.each([
    ["5:30", "05:30"],
    ["05:30", "05:30"],
    ["05:30:00", "05:30"],
    ["5.30", "05:30"],
    ["5 30", "05:30"],
    ["0530", "05:30"],
    ["530", "05:30"],
    ["5:30 AM", "05:30"],
    ["5:30am", "05:30"],
    ["5.30 a.m.", "05:30"],
    ["5:30 A.M", "05:30"],
    ["5:30a", "05:30"],
    ["  5:30  ", "05:30"],
    ["5 : 30", "05:30"],
    ["5：30", "05:30"],
    ["5∶30", "05:30"],
    ["5h30", "05:30"],
    ["5,30", "05:30"],
    ["05:30:00.000", "05:30"],
    ["0:05", "00:05"],
    ["00:00", "00:00"],
  ])("reads %j in a Fajr column as %s", (text, expected) => {
    const result = parseTimeCell(text, "fajrBegins");
    expect(result.time).toBe(expected);
    expect(result.issue).toBeUndefined();
  });

  it.each([
    ["5:30 PM", "17:30"],
    ["5:30pm", "17:30"],
    ["5.30 p.m.", "17:30"],
    ["5:30 p. m.", "17:30"],
    ["5:30P", "17:30"],
    ["530pm", "17:30"],
    ["17:30", "17:30"],
    ["1730", "17:30"],
    ["17.30", "17:30"],
    ["12:15 PM", "12:15"],
    ["12:15 AM", "00:15"],
    ["12 pm", "12:00"],
    ["7 pm", "19:00"],
  ])("honours an explicit marker or 24-hour value: %j is %s even in a Fajr column", (text, expected) => {
    const result = parseTimeCell(text, "fajrBegins");
    expect(result.time).toBe(expected);
    expect(result.adjustment).toBeNull();
  });

  it("normalises Arabic-Indic, Eastern Arabic and full-width digits", () => {
    expect(time("٥:٣٠")).toBe("05:30");
    expect(time("۵:۳۰")).toBe("05:30");
    expect(time("１７：４５", "asrBegins")).toBe("17:45");
    expect(time("٥:٣٠ م", "maghribBegins")).toBe("17:30");
    expect(time("٥:٣٠ ص", "maghribBegins")).toBe("05:30");
  });

  it("treats a single digit after a dot as tens of minutes, as spreadsheets drop the trailing zero", () => {
    expect(time("5.3")).toBe("05:30");
    expect(time("5.05")).toBe("05:05");
    // With a colon the digit is taken literally.
    expect(time("5:3")).toBe("05:03");
  });

  it("rounds seconds to the nearest minute", () => {
    expect(time("05:30:29")).toBe("05:30");
    expect(time("05:30:30")).toBe("05:31");
    expect(time("23:59:59", "ishaBegins")).toBe("23:59");
  });

  it("reads a bare hour", () => {
    expect(time("5")).toBe("05:00");
    expect(time("1", "dhuhrJamaat")).toBe("13:00");
  });
});

describe("parseTimeCell: empty and ditto cells", () => {
  it.each([null, "", "   ", "-", "--", "—", "–", "n/a", "N/A", "na", "nil", "none", "TBC"])("treats %j as no time, without an issue", (value) => {
    const result = parseTimeCell(value, "asrJamaat");
    expect(result).toEqual({ time: null, adjustment: null, ditto: false });
  });

  it("treats undefined (a row shorter than the header) as no time", () => {
    expect(parseTimeCell(undefined, "ishaJamaat").time).toBeNull();
  });

  it.each(['"', "''", "〃", "”", "ditto", "Ditto", "do"])("recognises %j as a ditto mark", (value) => {
    expect(parseTimeCell(value, "asrJamaat")).toEqual({ time: null, adjustment: null, ditto: true });
  });

  it("exposes the two text classifications", () => {
    expect(isEmptyTimeText(" N/A ")).toBe(true);
    expect(isEmptyTimeText("5:30")).toBe(false);
    expect(isDittoText(' " ')).toBe(true);
    expect(isDittoText("-")).toBe(false);
  });
});

describe("parseTimeCell: unreadable cells", () => {
  it.each(["abc", "5:3o", "25:10", "12:60", "5:30:99", "24:00", "5:30 xm", "12345", "5-30", "5:30 / 5:45", "after Maghrib", "45"])(
    "reports %j as an error that quotes the cell",
    (text) => {
      const result = parseTimeCell(text, "fajrBegins");
      expect(result.time).toBeNull();
      expect(result.issue?.severity).toBe("error");
      expect(result.issue?.code).toBe("time-invalid");
      expect(result.issue?.message).toContain(`"${text}"`);
    },
  );

  it.each([true, false])("rejects the boolean %j", (value) => {
    expect(parseTimeCell(value, "fajrBegins").issue?.code).toBe("time-invalid");
  });

  it.each([-0.5, Number.NaN, Number.POSITIVE_INFINITY, 24, 45, 99, 2360, 2400, 5.305, 5.75, 24.3])("rejects the number %j", (value) => {
    expect(parseTimeCell(value, "fajrBegins").issue?.code).toBe("time-invalid");
  });

  it("rejects an invalid Date", () => {
    expect(parseTimeCell(new Date(Number.NaN), "fajrBegins").issue?.code).toBe("time-invalid");
  });

  it("cuts very long cell text in the message", () => {
    const message = parseTimeCell("x".repeat(200), "fajrBegins").issue?.message ?? "";
    expect(message.length).toBeLessThan(140);
    expect(message).toContain("…");
  });
});

describe("parseTimeCell: Excel values", () => {
  it("reads a time cell (a Date on Excel's day zero) by its UTC clock", () => {
    expect(time(excelTime(5, 30))).toBe("05:30");
    expect(time(excelTime(17, 45), "asrBegins")).toBe("17:45");
  });

  it("reads the clock of a full date-time cell and ignores its date", () => {
    expect(time(new Date(Date.UTC(2027, 2, 1, 5, 30)))).toBe("05:30");
    // A 1904-system workbook puts bare times on 1904-01-01.
    expect(time(new Date(Date.UTC(1904, 0, 1, 5, 30)))).toBe("05:30");
  });

  it("rounds a Date to the nearest minute to absorb floating-point noise", () => {
    expect(time(excelTime(5, 29, 59, 999))).toBe("05:30");
    expect(time(excelTime(5, 30, 0, 1))).toBe("05:30");
    expect(time(excelTime(5, 30, 29))).toBe("05:30");
    expect(time(excelTime(5, 30, 31))).toBe("05:31");
    expect(time(excelTime(23, 59, 59, 999), "ishaJamaat")).toBe("23:59");
  });

  it("reads fractions of a day and rounds away floating-point noise", () => {
    expect(time(0.229166666)).toBe("05:30");
    expect(time(0.2291666667)).toBe("05:30");
    expect(time(0.25)).toBe("06:00");
    expect(time(0.75, "maghribBegins")).toBe("18:00");
    expect(time(0)).toBe("00:00");
    expect(time(0.99999, "ishaBegins")).toBe("23:59");
  });

  it("reads the time of day from a date-time serial number", () => {
    expect(time(46447.229166666)).toBe("05:30");
    expect(parseTimeCell(46447, "fajrBegins").issue?.code).toBe("time-invalid");
  });

  it("reads numbers typed with a dot as hours.minutes", () => {
    expect(time(5.3)).toBe("05:30");
    expect(time(5.05)).toBe("05:05");
    expect(time(17.45, "asrBegins")).toBe("17:45");
    expect(time(12.1, "dhuhrBegins")).toBe("12:10");
    expect(time(5.59)).toBe("05:59");
    expect(parseTimeCell(5.6, "fajrBegins").issue?.code).toBe("time-invalid");
  });

  it("reads whole numbers as an hour or as digits typed without a colon", () => {
    expect(time(5)).toBe("05:00");
    expect(time(23, "ishaBegins")).toBe("23:00");
    expect(time(530)).toBe("05:30");
    expect(time(1745, "asrBegins")).toBe("17:45");
    expect(time(100)).toBe("01:00");
  });
});

describe("parseTimeCell: 12-hour values without AM/PM", () => {
  it.each<[TimeCellField, string, string]>([
    ["fajrBegins", "5:30", "05:30"],
    ["fajrJamaat", "11:59", "11:59"],
    ["sunrise", "7:45", "07:45"],
    ["dhuhrBegins", "11:50", "11:50"],
    ["dhuhrBegins", "12:10", "12:10"],
    ["dhuhrJamaat", "6:30", "06:30"],
    ["dhuhrJamaat", "10:00", "10:00"],
    ["jumuah", "12:30", "12:30"],
    ["asrBegins", "12:50", "12:50"],
    ["maghribJamaat", "12:05", "12:05"],
    ["ishaBegins", "1:05", "01:05"],
    ["ishaJamaat", "4:59", "04:59"],
  ])("keeps %s %j as %s", (field, text, expected) => {
    const result = parseTimeCell(text, field);
    expect(result.time).toBe(expected);
    expect(result.adjustment).toBeNull();
    expect(result.issue).toBeUndefined();
  });

  it.each<[TimeCellField, string, string]>([
    ["dhuhrBegins", "1:05", "13:05"],
    ["dhuhrJamaat", "1:15", "13:15"],
    ["dhuhrJamaat", "5:59", "17:59"],
    ["jumuah", "1:30", "13:30"],
    ["jumuah", "2:15", "14:15"],
    ["asrBegins", "1:45", "13:45"],
    ["asrBegins", "4:20", "16:20"],
    ["asrJamaat", "11:00", "23:00"],
    ["maghribBegins", "7:45", "19:45"],
    ["maghribJamaat", "9:35", "21:35"],
    ["ishaBegins", "5:00", "17:00"],
    ["ishaBegins", "9:10", "21:10"],
    ["ishaJamaat", "11:15", "23:15"],
  ])("moves %s %j to %s and records the adjustment", (field, text, expected) => {
    const result = parseTimeCell(text, field);
    expect(result.time).toBe(expected);
    expect(result.adjustment).toBe("pm");
    expect(result.issue).toBeUndefined();
  });

  it("reads 12:xx as just after midnight for Fajr and sunrise, silently", () => {
    for (const field of ["fajrBegins", "fajrJamaat", "sunrise"] as const) {
      const result = parseTimeCell("12:20", field);
      expect(result.time).toBe("00:20");
      expect(result.adjustment).toBe("midnight");
      expect(result.issue).toBeUndefined();
    }
  });

  it("reads 12:xx as just after midnight for Isha and flags it as a warning", () => {
    for (const field of ["ishaBegins", "ishaJamaat"] as const) {
      const result = parseTimeCell("12:10", field);
      expect(result.time).toBe("00:10");
      expect(result.adjustment).toBe("midnight");
      expect(result.issue?.severity).toBe("warning");
      expect(result.issue?.code).toBe("midnight-assumed");
      expect(result.issue?.message).toContain('"12:10"');
      expect(result.issue?.message).toContain("00:10");
    }
  });

  it("applies the same rules to Excel time cells, which lose the AM/PM the user meant", () => {
    // "1:15" typed into Excel is stored as 01:15.
    expect(parseTimeCell(excelTime(1, 15), "dhuhrJamaat")).toMatchObject({ time: "13:15", adjustment: "pm" });
    expect(parseTimeCell(0.3229166667, "maghribBegins")).toMatchObject({ time: "19:45", adjustment: "pm" });
    expect(parseTimeCell(7.45, "maghribBegins")).toMatchObject({ time: "19:45", adjustment: "pm" });
    expect(parseTimeCell(excelTime(12, 10), "ishaBegins")).toMatchObject({ time: "00:10", adjustment: "midnight" });
  });

  it("never adjusts a value with an hour of 0 or of 13 and above", () => {
    for (const field of ["dhuhrJamaat", "asrBegins", "maghribBegins", "ishaJamaat"] as const) {
      expect(parseTimeCell("00:20", field)).toMatchObject({ time: "00:20", adjustment: null });
      expect(parseTimeCell("13:05", field)).toMatchObject({ time: "13:05", adjustment: null });
      expect(parseTimeCell(excelTime(19, 45), field)).toMatchObject({ time: "19:45", adjustment: null });
    }
  });

  it("never adjusts a value with an explicit marker, whatever the column", () => {
    expect(parseTimeCell("1:15 AM", "dhuhrJamaat")).toMatchObject({ time: "01:15", adjustment: null });
    expect(parseTimeCell("7:45 am", "maghribBegins")).toMatchObject({ time: "07:45", adjustment: null });
    expect(parseTimeCell("12:10 AM", "ishaBegins")).toEqual({ time: "00:10", adjustment: null, ditto: false });
    expect(parseTimeCell("12:10 PM", "ishaBegins")).toEqual({ time: "12:10", adjustment: null, ditto: false });
  });
});
