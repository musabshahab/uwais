import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type PrayerDay, type TimetableCoverage } from "@/lib/types";
import {
  MAX_LISTED_MONTHS,
  adjacentMonths,
  coverageTouchesYear,
  downloadHref,
  formatHijriMonths,
  hijriMonthsSpanned,
  isMonthInRange,
  listMonths,
  monthRows,
  navigableMonths,
  readMonthParam,
  resolveMonth,
  shiftMonth,
  timetableHref,
} from "./month";

const COVERAGE: TimetableCoverage = { firstDate: "2026-03-15", lastDate: "2027-02-10", totalDays: 333 };
const NO_COVERAGE: TimetableCoverage = { firstDate: null, lastDate: null, totalDays: 0 };

function day(date: string, overrides: Partial<PrayerDay> = {}): PrayerDay {
  return {
    date,
    fajrBegins: "05:40",
    fajrJamaat: "06:15",
    sunrise: "07:30",
    dhuhrBegins: "11:55",
    dhuhrJamaat: "12:30",
    asrBegins: "14:05",
    asrJamaat: "14:30",
    maghribBegins: "16:02",
    maghribJamaat: "16:07",
    ishaBegins: "17:45",
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

describe("shiftMonth", () => {
  it("moves across years in both directions", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });

  it("is null beyond the calendar the app supports", () => {
    expect(shiftMonth("9999-12", 1)).toBeNull();
    expect(shiftMonth("0001-01", -1)).toBeNull();
  });
});

describe("readMonthParam", () => {
  it("accepts one well-formed month", () => {
    expect(readMonthParam("2026-11")).toBe("2026-11");
  });

  it("rejects everything else", () => {
    expect(readMonthParam(undefined)).toBeNull();
    expect(readMonthParam("")).toBeNull();
    expect(readMonthParam("2026-13")).toBeNull();
    expect(readMonthParam("2026-1")).toBeNull();
    expect(readMonthParam("2026-11-25")).toBeNull();
    expect(readMonthParam("november")).toBeNull();
    expect(readMonthParam(["2026-11", "2026-12"])).toBeNull();
  });
});

describe("navigableMonths", () => {
  it("is the covered months with one month either side", () => {
    expect(navigableMonths(COVERAGE, "2026-11")).toEqual({ first: "2026-02", last: "2027-03" });
  });

  it("always reaches the current month, before or after the timetable", () => {
    expect(navigableMonths(COVERAGE, "2025-06")).toEqual({ first: "2025-06", last: "2027-03" });
    expect(navigableMonths(COVERAGE, "2028-01")).toEqual({ first: "2026-02", last: "2028-01" });
  });

  it("is the current month alone when nothing has been published", () => {
    expect(navigableMonths(NO_COVERAGE, "2026-11")).toEqual({ first: "2026-11", last: "2026-11" });
  });

  it("stops at the edge of the supported calendar", () => {
    const coverage: TimetableCoverage = { firstDate: "0001-01-05", lastDate: "9999-12-20", totalDays: 2 };
    expect(navigableMonths(coverage, "2026-11")).toEqual({ first: "0001-01", last: "9999-12" });
  });
});

describe("isMonthInRange and resolveMonth", () => {
  const range = { first: "2026-02", last: "2027-03" };

  it("includes both ends", () => {
    expect(isMonthInRange("2026-02", range)).toBe(true);
    expect(isMonthInRange("2027-03", range)).toBe(true);
    expect(isMonthInRange("2026-01", range)).toBe(false);
    expect(isMonthInRange("2027-04", range)).toBe(false);
  });

  it("shows the requested month when it can be opened", () => {
    expect(resolveMonth("2026-05", range, "2026-11")).toBe("2026-05");
  });

  it("falls back to the current month otherwise", () => {
    expect(resolveMonth(null, range, "2026-11")).toBe("2026-11");
    expect(resolveMonth("1999-01", range, "2026-11")).toBe("2026-11");
    expect(resolveMonth("2031-01", range, "2026-11")).toBe("2026-11");
  });
});

describe("adjacentMonths", () => {
  const range = { first: "2026-02", last: "2027-03" };

  it("gives the months either side inside the range", () => {
    expect(adjacentMonths("2026-12", range)).toEqual({ previous: "2026-11", next: "2027-01" });
  });

  it("is null at each end of the range", () => {
    expect(adjacentMonths("2026-02", range)).toEqual({ previous: null, next: "2026-03" });
    expect(adjacentMonths("2027-03", range)).toEqual({ previous: "2027-02", next: null });
  });

  it("has nowhere to go in a one-month range", () => {
    expect(adjacentMonths("2026-11", { first: "2026-11", last: "2026-11" })).toEqual({ previous: null, next: null });
  });
});

describe("listMonths", () => {
  it("lists every month of the range in order", () => {
    expect(listMonths({ first: "2026-11", last: "2027-02" }, "2026-11")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("is empty for a range that runs backwards", () => {
    expect(listMonths({ first: "2027-02", last: "2026-11" }, "2026-11")).toEqual([]);
  });

  it("cuts a very long range down to the months around the one on show", () => {
    const range = { first: "1990-01", last: "2090-12" };
    const months = listMonths(range, "2026-11");
    expect(months).toHaveLength(MAX_LISTED_MONTHS);
    expect(months).toContain("2026-11");
    expect(months[0]).toBe("2016-11");
    expect(months[months.length - 1]).toBe("2036-10");
  });

  it("keeps the window inside the range at either end", () => {
    const range = { first: "2020-01", last: "2029-12" };
    expect(listMonths(range, "2020-02", 12)).toEqual(listMonths({ first: "2020-01", last: "2020-12" }, "2020-02"));
    expect(listMonths(range, "2029-11", 12)).toEqual(listMonths({ first: "2029-01", last: "2029-12" }, "2029-11"));
  });
});

describe("timetableHref and downloadHref", () => {
  it("addresses a month of the timetable page", () => {
    expect(timetableHref("2026-11")).toBe("/timetable?month=2026-11");
  });

  it("addresses the export of a month or a year", () => {
    expect(downloadHref({ month: "2026-11" }, "csv")).toBe("/api/timetable/export?month=2026-11&format=csv");
    expect(downloadHref({ year: 2026 }, "xlsx")).toBe("/api/timetable/export?year=2026&format=xlsx");
    expect(downloadHref({ year: 987 }, "csv")).toBe("/api/timetable/export?year=0987&format=csv");
  });
});

describe("coverageTouchesYear", () => {
  it("is true for every year the timetable reaches into", () => {
    expect(coverageTouchesYear(COVERAGE, 2026)).toBe(true);
    expect(coverageTouchesYear(COVERAGE, 2027)).toBe(true);
  });

  it("is false outside it, and when nothing is published", () => {
    expect(coverageTouchesYear(COVERAGE, 2025)).toBe(false);
    expect(coverageTouchesYear(COVERAGE, 2028)).toBe(false);
    expect(coverageTouchesYear(NO_COVERAGE, 2026)).toBe(false);
  });
});

describe("hijriMonthsSpanned", () => {
  it("lists the Hijri months a calendar month touches, in order", () => {
    const spans = hijriMonthsSpanned("2026-11");
    expect(spans.map((span) => span.monthName)).toEqual(["Jumada al-Awwal", "Jumada al-Thani"]);
    expect(spans.every((span) => span.year === 1448)).toBe(true);
  });

  it("never lists the same month twice, and the months follow one another", () => {
    for (const month of ["2026-01", "2026-06", "2026-12", "2027-02", "2027-06"]) {
      const spans = hijriMonthsSpanned(month);
      expect(spans.length).toBeGreaterThanOrEqual(1);
      expect(spans.length).toBeLessThanOrEqual(3);
      for (let index = 1; index < spans.length; index += 1) {
        const before = spans[index - 1];
        const after = spans[index];
        expect(after.year * 12 + after.month).toBe(before.year * 12 + before.month + 1);
      }
    }
  });

  it("follows the mosque's moon-sighting adjustment", () => {
    const plain = hijriMonthsSpanned("2026-11", 0);
    const shifted = hijriMonthsSpanned("2026-11", 2);
    expect(shifted[0]).toEqual(plain[0]);
    // Two days later in the Hijri calendar: the month reaches at least as far as before.
    const last = (spans: typeof plain) => spans[spans.length - 1].year * 12 + spans[spans.length - 1].month;
    expect(last(shifted)).toBeGreaterThanOrEqual(last(plain));
  });
});

describe("formatHijriMonths", () => {
  const span = (monthName: string, year: number, month = 1) => ({ month, year, monthName });

  it("names one month with its year", () => {
    expect(formatHijriMonths([span("Ramadan", 1448)])).toBe("Ramadan 1448 AH");
  });

  it("writes a shared year once, at the end", () => {
    expect(formatHijriMonths([span("Jumada al-Awwal", 1448), span("Jumada al-Thani", 1448)])).toBe(
      "Jumada al-Awwal and Jumada al-Thani 1448 AH",
    );
    expect(formatHijriMonths([span("Rajab", 1448), span("Sha'ban", 1448), span("Ramadan", 1448)])).toBe(
      "Rajab, Sha'ban and Ramadan 1448 AH",
    );
  });

  it("gives each year when the months straddle a new year", () => {
    expect(formatHijriMonths([span("Dhu al-Hijjah", 1448), span("Muharram", 1449)])).toBe(
      "Dhu al-Hijjah 1448 and Muharram 1449 AH",
    );
  });

  it("is empty for no months", () => {
    expect(formatHijriMonths([])).toBe("");
  });
});

describe("monthRows", () => {
  const settings = { jumuah: DEFAULT_SETTINGS.jumuah };

  it("has one row for every day of the month, whatever the timetable holds", () => {
    expect(monthRows("2026-11", [], settings, "2026-11-25")).toHaveLength(30);
    expect(monthRows("2026-12", [], settings, "2026-11-25")).toHaveLength(31);
    expect(monthRows("2028-02", [], settings, "2026-11-25")).toHaveLength(29);
  });

  it("describes the day: weekday, day of the month, Friday and today", () => {
    const rows = monthRows("2026-11", [day("2026-11-25"), day("2026-11-27")], settings, "2026-11-25");
    expect(rows[24]).toMatchObject({ date: "2026-11-25", weekday: "Wed", dayOfMonth: 25, isFriday: false, isToday: true });
    expect(rows[26]).toMatchObject({ date: "2026-11-27", weekday: "Fri", dayOfMonth: 27, isFriday: true, isToday: false });
    expect(rows.filter((row) => row.isToday)).toHaveLength(1);
  });

  it("marks no row as today when today is in another month", () => {
    expect(monthRows("2026-12", [], settings, "2026-11-25").some((row) => row.isToday)).toBe(false);
  });

  it("carries the times of a day into its cells", () => {
    const [first] = monthRows("2026-11", [day("2026-11-01")], settings, "2026-11-25");
    expect(first.hasTimes).toBe(true);
    expect(first.fajr).toEqual({ begins: "05:40", jamaat: "06:15" });
    expect(first.sunrise).toBe("07:30");
    expect(first.dhuhr).toEqual({ begins: "11:55", jamaat: "12:30" });
    expect(first.isha).toEqual({ begins: "17:45", jamaat: "19:30" });
    expect(first.jumuah).toEqual([]);
  });

  it("shows a day the timetable does not have as a gap", () => {
    const rows = monthRows("2026-11", [day("2026-11-01")], settings, "2026-11-25");
    expect(rows[1]).toMatchObject({ date: "2026-11-02", hasTimes: false, sunrise: null, note: null });
    expect(rows[1].fajr).toEqual({ begins: null, jamaat: null });
  });

  it("treats a row without a single time as a gap, but keeps its note", () => {
    const empty = day("2026-11-03", {
      fajrBegins: null,
      fajrJamaat: null,
      sunrise: null,
      dhuhrBegins: null,
      dhuhrJamaat: null,
      asrBegins: null,
      asrJamaat: null,
      maghribBegins: null,
      maghribJamaat: null,
      ishaBegins: null,
      ishaJamaat: null,
      note: "  Mosque closed for repairs ",
    });
    const rows = monthRows("2026-11", [empty], settings, "2026-11-25");
    expect(rows[2]).toMatchObject({ hasTimes: false, note: "Mosque closed for repairs" });
  });

  it("keeps a partly filled row and leaves the missing times empty", () => {
    const partial = day("2026-11-04", { asrBegins: null, asrJamaat: null, sunrise: "not a time" });
    const rows = monthRows("2026-11", [partial], settings, "2026-11-25");
    expect(rows[3].hasTimes).toBe(true);
    expect(rows[3].asr).toEqual({ begins: null, jamaat: null });
    expect(rows[3].sunrise).toBeNull();
    expect(rows[3].maghrib).toEqual({ begins: "16:02", jamaat: "16:07" });
  });

  it("lists the default Jumu'ah times on a Friday and puts the first in the Dhuhr congregation", () => {
    const slots = [
      { label: "1st Jumu'ah", time: "12:45" },
      { label: "2nd Jumu'ah", time: "13:30" },
    ];
    const rows = monthRows("2026-11", [day("2026-11-27")], { jumuah: slots }, "2026-11-25");
    expect(rows[26].jumuah).toEqual(slots);
    expect(rows[26].dhuhr).toEqual({ begins: "11:55", jamaat: "12:45" });
  });

  it("prefers the Jumu'ah times set for that Friday", () => {
    const rows = monthRows(
      "2026-11",
      [day("2026-11-27", { jumuah: ["13:00"] })],
      { jumuah: [{ label: "Jumu'ah", time: "12:45" }] },
      "2026-11-25",
    );
    expect(rows[26].jumuah.map((slot) => slot.time)).toEqual(["13:00"]);
    expect(rows[26].dhuhr.jamaat).toBe("13:00");
  });

  it("has no Jumu'ah list on other days", () => {
    const rows = monthRows("2026-11", [day("2026-11-26", { jumuah: ["13:00"] })], settings, "2026-11-25");
    expect(rows[25].jumuah).toEqual([]);
    expect(rows[25].dhuhr.jamaat).toBe("12:30");
  });

  it("trims notes and drops blank ones", () => {
    const rows = monthRows(
      "2026-11",
      [day("2026-11-01", { note: " Clocks go back " }), day("2026-11-02", { note: "   " })],
      settings,
      "2026-11-25",
    );
    expect(rows[0].note).toBe("Clocks go back");
    expect(rows[1].note).toBeNull();
  });

  it("does not depend on the order of the stored rows, nor on rows of other months", () => {
    const rows = monthRows(
      "2026-11",
      [day("2026-12-01"), day("2026-11-02", { fajrJamaat: "06:00" }), day("2026-11-01"), day("2026-10-31")],
      settings,
      "2026-11-25",
    );
    expect(rows).toHaveLength(30);
    expect(rows[0].fajr.jamaat).toBe("06:15");
    expect(rows[1].fajr.jamaat).toBe("06:00");
    expect(rows[2].hasTimes).toBe(false);
  });
});
