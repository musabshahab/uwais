import { describe, expect, it } from "vitest";
import type { PrayerDay } from "@/lib/types";
import {
  MAX_MONTH_CHOICES,
  applyLocalChanges,
  coveredYears,
  exportMonthHref,
  exportYearHref,
  findDay,
  hasAnyTime,
  monthChoices,
  monthRows,
  readEditParam,
  readMonthParam,
  summariseMonth,
  timetableHref,
  withDeletedDays,
  withSavedDay,
  type LocalDayChanges,
} from "./month";

function day(date: string, overrides: Partial<PrayerDay> = {}): PrayerDay {
  return {
    date,
    fajrBegins: "05:00",
    fajrJamaat: "05:30",
    sunrise: "06:40",
    dhuhrBegins: "12:10",
    dhuhrJamaat: "13:00",
    asrBegins: "15:00",
    asrJamaat: "15:30",
    maghribBegins: "17:40",
    maghribJamaat: "17:45",
    ishaBegins: "19:00",
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

const BLANK_TIMES = {
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
};

describe("readMonthParam", () => {
  it("accepts a real month", () => {
    expect(readMonthParam("2027-03")).toBe("2027-03");
    expect(readMonthParam(" 2027-03 ")).toBe("2027-03");
    expect(readMonthParam(["2027-03", "2027-04"])).toBe("2027-03");
  });

  it("refuses everything else", () => {
    expect(readMonthParam(undefined)).toBeNull();
    expect(readMonthParam("")).toBeNull();
    expect(readMonthParam("2027-13")).toBeNull();
    expect(readMonthParam("2027-3")).toBeNull();
    expect(readMonthParam("2027-03-01")).toBeNull();
    expect(readMonthParam("<script>")).toBeNull();
  });
});

describe("monthRows", () => {
  it("has a row for every day of the month, stored or not", () => {
    const rows = monthRows("2027-02", [day("2027-02-01"), day("2027-02-28")], "2027-02-05");
    expect(rows).toHaveLength(28);
    expect(rows[0]).toMatchObject({ date: "2027-02-01", missing: false, friday: false, today: false });
    expect(rows[1]).toMatchObject({ date: "2027-02-02", day: null, missing: true });
    expect(rows[4]).toMatchObject({ date: "2027-02-05", friday: true, today: true, missing: true });
    expect(rows[27].day?.date).toBe("2027-02-28");
  });

  it("handles a leap February", () => {
    expect(monthRows("2028-02", [], "2026-01-01")).toHaveLength(29);
  });

  it("counts a day with only a note as missing its times", () => {
    const rows = monthRows("2027-03", [day("2027-03-10", { ...BLANK_TIMES, note: "Eid" })], "2027-03-01");
    expect(rows[9].day?.note).toBe("Eid");
    expect(rows[9].missing).toBe(true);
  });

  it("ignores stored days from other months", () => {
    const rows = monthRows("2027-03", [day("2027-02-28"), day("2027-04-01")], "2027-03-01");
    expect(rows.every((row) => row.day === null)).toBe(true);
  });

  it("summarises how complete the month is", () => {
    const rows = monthRows("2027-02", [day("2027-02-01"), day("2027-02-02")], "2027-02-05");
    expect(summariseMonth(rows)).toEqual({ total: 28, missing: 26 });
  });
});

describe("hasAnyTime", () => {
  it("needs just one time", () => {
    expect(hasAnyTime(day("2027-01-01"))).toBe(true);
    expect(hasAnyTime(day("2027-01-01", { ...BLANK_TIMES, ishaJamaat: "19:30" }))).toBe(true);
    expect(hasAnyTime(day("2027-01-01", { ...BLANK_TIMES, jumuah: ["13:15"], note: "x" }))).toBe(false);
  });
});

describe("monthChoices", () => {
  it("offers the covered months with one either side", () => {
    const choices = monthChoices(
      { firstDate: "2027-01-01", lastDate: "2027-03-31", totalDays: 90 },
      "2027-02",
      "2027-02",
    );
    expect(choices).toEqual(["2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });

  it("always includes the current month and the month on show", () => {
    expect(monthChoices({ firstDate: null, lastDate: null, totalDays: 0 }, "2026-11", "2026-11")).toEqual(["2026-11"]);
    expect(
      monthChoices({ firstDate: "2027-01-01", lastDate: "2027-01-31", totalDays: 31 }, "2026-11", "2029-06"),
    ).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2029-06"]);
  });

  it("stays bounded for an absurd range", () => {
    const choices = monthChoices({ firstDate: "1990-01-01", lastDate: "2090-12-31", totalDays: 1 }, "2026-11", "2026-11");
    expect(choices.length).toBeLessThanOrEqual(MAX_MONTH_CHOICES + 2);
  });
});

describe("addresses", () => {
  it("builds the editor and export addresses", () => {
    expect(timetableHref("2027-03")).toBe("/admin/timetable?month=2027-03");
    expect(exportMonthHref("csv", "2027-03")).toBe("/api/timetable/export?format=csv&month=2027-03");
    expect(exportYearHref("xlsx", 2027)).toBe("/api/timetable/export?format=xlsx&year=2027");
  });
});

describe("coveredYears", () => {
  it("lists every year the timetable touches", () => {
    expect(coveredYears({ firstDate: "2026-01-01", lastDate: "2027-12-31", totalDays: 730 })).toEqual([2026, 2027]);
    expect(coveredYears({ firstDate: "2027-03-01", lastDate: "2027-03-31", totalDays: 31 })).toEqual([2027]);
    expect(coveredYears({ firstDate: null, lastDate: null, totalDays: 0 })).toEqual([]);
  });
});

describe("findDay", () => {
  it("finds a stored day by date", () => {
    const days = [day("2027-01-01"), day("2027-01-02")];
    expect(findDay(days, "2027-01-02")?.date).toBe("2027-01-02");
    expect(findDay(days, "2027-01-03")).toBeNull();
  });
});

describe("readEditParam", () => {
  it("accepts a real date inside the month on show", () => {
    expect(readEditParam("2026-11-25", "2026-11")).toBe("2026-11-25");
    expect(readEditParam(["2026-11-01", "2026-11-02"], "2026-11")).toBe("2026-11-01");
  });

  it("ignores anything else", () => {
    expect(readEditParam("2026-12-01", "2026-11")).toBeNull();
    expect(readEditParam("2026-11-31", "2026-11")).toBeNull();
    expect(readEditParam("today", "2026-11")).toBeNull();
    expect(readEditParam(undefined, "2026-11")).toBeNull();
  });
});

describe("local changes", () => {
  const rows = monthRows("2027-03", [day("2027-03-01"), day("2027-03-02"), day("2027-03-03")], "2027-03-02");
  const none: LocalDayChanges = new Map();

  it("returns the same rows when nothing was changed here", () => {
    expect(applyLocalChanges(rows, none)).toBe(rows);
  });

  it("shows a saved day in place of the stored one", () => {
    const saved = day("2027-03-02", { fajrJamaat: "05:45", note: "Clocks go forward" });
    const shown = applyLocalChanges(rows, withSavedDay(none, saved));
    expect(shown[1].day).toBe(saved);
    expect(shown[1].today).toBe(true);
    expect(shown[0]).toBe(rows[0]);
  });

  it("fills a missing day once it has been added", () => {
    const shown = applyLocalChanges(rows, withSavedDay(none, day("2027-03-10")));
    expect(shown[9].missing).toBe(false);
    expect(summariseMonth(shown).missing).toBe(27);
  });

  it("treats a day saved without times as missing", () => {
    const shown = applyLocalChanges(rows, withSavedDay(none, day("2027-03-01", { ...BLANK_TIMES, note: "Closed" })));
    expect(shown[0].missing).toBe(true);
    expect(shown[0].day?.note).toBe("Closed");
  });

  it("empties every day of a deleted range, also past the end of the month", () => {
    const shown = applyLocalChanges(rows, withDeletedDays(none, "2027-03-02", "2027-04-02"));
    expect(shown[0].day).not.toBeNull();
    expect(shown[1]).toMatchObject({ day: null, missing: true });
    expect(shown[2]).toMatchObject({ day: null, missing: true });
  });

  it("keeps the latest change to a day", () => {
    const changes = withSavedDay(withDeletedDays(none, "2027-03-01", "2027-03-03"), day("2027-03-02"));
    const shown = applyLocalChanges(rows, changes);
    expect(shown.map((row) => row.missing).slice(0, 3)).toEqual([true, false, true]);
  });

  it("does not alter the changes it was given", () => {
    const first = withSavedDay(none, day("2027-03-01"));
    withDeletedDays(first, "2027-03-01", "2027-03-01");
    expect(first.get("2027-03-01")).not.toBeNull();
    expect(none.size).toBe(0);
  });
});
