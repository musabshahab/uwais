import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type DisplayPayload, type PrayerDay } from "@/lib/types";
import {
  browseWindow,
  canStepDay,
  eventArabic,
  noteForDate,
  relativeDayLabel,
  rowsForDate,
  selectDay,
  staticDayFacts,
} from "./home";

/** Wednesday 25 November 2026, 12:00 in London (on UTC in winter). */
const NOON = Date.UTC(2026, 10, 25, 12, 0, 0);

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

function payload(overrides: Partial<DisplayPayload> = {}): DisplayPayload {
  return {
    version: "test",
    serverNow: NOON,
    settings: {
      ...DEFAULT_SETTINGS,
      timezone: "Europe/London",
      tv: { ...DEFAULT_SETTINGS.tv },
      jumuah: [{ label: "Jumu'ah", time: "13:15" }],
    },
    days: [
      day("2026-11-24"),
      day("2026-11-25", { note: " Car park closed " }),
      day("2026-11-26", { asrJamaat: "14:15" }),
      day("2026-11-27"),
    ],
    announcements: [],
    coverage: { firstDate: "2026-01-01", lastDate: "2026-12-31", totalDays: 365 },
    ...overrides,
  };
}

describe("staticDayFacts", () => {
  it("reads the day from the moment the payload was produced, in the mosque's timezone", () => {
    expect(staticDayFacts(payload()).today).toBe("2026-11-25");
    // 23:30 UTC on the 25th is already the 26th in Karachi.
    const karachi = payload({ serverNow: Date.UTC(2026, 10, 25, 23, 30) });
    karachi.settings.timezone = "Asia/Karachi";
    expect(staticDayFacts(karachi).today).toBe("2026-11-26");
  });

  it("reports the congregation times that change tomorrow", () => {
    const { tomorrowChanges } = staticDayFacts(payload());
    expect(tomorrowChanges).toHaveLength(1);
    expect(tomorrowChanges[0]).toMatchObject({ key: "asr", from: "14:30", to: "14:15" });
  });

  it("advertises the coming Friday's Jumu'ah", () => {
    const { jumuah } = staticDayFacts(payload());
    expect(jumuah.date).toBe("2026-11-27");
    expect(jumuah.slots).toEqual([{ label: "Jumu'ah", time: "13:15" }]);
  });

  it("says when there is no timetable at all, or none for today", () => {
    expect(staticDayFacts(payload()).dataStatus).toBe("ok");
    expect(staticDayFacts(payload({ days: [] })).dataStatus).toBe("empty");
    expect(staticDayFacts(payload({ days: [day("2026-11-24"), day("2026-11-26")] })).dataStatus).toBe("missing-today");
  });
});

describe("browseWindow", () => {
  it("runs from yesterday to five weeks ahead of the day the payload was produced", () => {
    expect(browseWindow(payload(), "2026-11-25")).toEqual({ first: "2026-11-24", last: "2026-12-30" });
  });

  it("is cut back to what the timetable covers", () => {
    const short = payload({ coverage: { firstDate: "2026-11-25", lastDate: "2026-12-05", totalDays: 11 } });
    expect(browseWindow(short, "2026-11-25")).toEqual({ first: "2026-11-25", last: "2026-12-05" });
  });

  it("always includes today, even when the timetable has run out or the page is old", () => {
    const ended = payload({ coverage: { firstDate: "2026-01-01", lastDate: "2026-11-20", totalDays: 324 } });
    expect(browseWindow(ended, "2026-11-25")).toEqual({ first: "2026-11-24", last: "2026-11-25" });
    const notStarted = payload({ coverage: { firstDate: "2026-12-01", lastDate: "2026-12-31", totalDays: 31 } });
    expect(browseWindow(notStarted, "2026-11-25")).toEqual({ first: "2026-11-25", last: "2026-12-30" });
    // A page left open for six weeks: today has moved past the payload's window.
    expect(browseWindow(payload(), "2027-01-06")).toEqual({ first: "2026-11-24", last: "2027-01-06" });
  });

  it("keeps the payload's window when nothing has been published", () => {
    const empty = payload({ days: [], coverage: { firstDate: null, lastDate: null, totalDays: 0 } });
    expect(browseWindow(empty, "2026-11-25")).toEqual({ first: "2026-11-24", last: "2026-12-30" });
  });
});

describe("selectDay", () => {
  const window = { first: "2026-11-24", last: "2026-12-30" };

  it("keeps a date inside the window", () => {
    expect(selectDay("2026-11-28", "2026-11-25", window)).toBe("2026-11-28");
    expect(selectDay("2026-11-24", "2026-11-25", window)).toBe("2026-11-24");
  });

  it("is null for today, which means follow today", () => {
    expect(selectDay("2026-11-25", "2026-11-25", window)).toBeNull();
  });

  it("pulls a date outside the window back to its edge", () => {
    expect(selectDay("2026-11-01", "2026-11-25", window)).toBe("2026-11-24");
    expect(selectDay("2027-03-01", "2026-11-25", window)).toBe("2026-12-30");
  });

  it("is null when the edge it is pulled back to is today", () => {
    expect(selectDay("2026-11-01", "2026-11-24", window)).toBeNull();
  });
});

describe("canStepDay", () => {
  const window = { first: "2026-11-24", last: "2026-12-30" };

  it("allows steps that stay inside the window", () => {
    expect(canStepDay("2026-11-25", -1, window)).toBe(true);
    expect(canStepDay("2026-11-25", 1, window)).toBe(true);
    expect(canStepDay("2026-12-29", 1, window)).toBe(true);
  });

  it("refuses steps past either edge", () => {
    expect(canStepDay("2026-11-24", -1, window)).toBe(false);
    expect(canStepDay("2026-12-30", 1, window)).toBe(false);
  });
});

describe("relativeDayLabel", () => {
  it("names today and the days next to it", () => {
    expect(relativeDayLabel("2026-11-25", "2026-11-25")).toBe("Today");
    expect(relativeDayLabel("2026-11-26", "2026-11-25")).toBe("Tomorrow");
    expect(relativeDayLabel("2026-11-24", "2026-11-25")).toBe("Yesterday");
  });

  it("counts the days otherwise, across months", () => {
    expect(relativeDayLabel("2026-11-27", "2026-11-25")).toBe("In 2 days");
    expect(relativeDayLabel("2026-12-30", "2026-11-25")).toBe("In 35 days");
    expect(relativeDayLabel("2026-11-20", "2026-11-25")).toBe("5 days ago");
  });
});

describe("rowsForDate", () => {
  it("gives the six rows of a day without live statuses", () => {
    const rows = rowsForDate(payload(), "2026-11-26");
    expect(rows.map((row) => row.key)).toEqual(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    expect(rows.every((row) => row.status === null)).toBe(true);
    expect(rows[3]).toMatchObject({ name: "Asr", begins: "14:05", jamaat: "14:15" });
  });

  it("presents Dhuhr as Jumu'ah on a Friday", () => {
    const dhuhr = rowsForDate(payload(), "2026-11-27")[2];
    expect(dhuhr).toMatchObject({ name: "Jumu'ah", isJumuah: true, begins: "11:55", jamaat: "13:15" });
  });

  it("gives empty rows for a day the payload does not have", () => {
    const rows = rowsForDate(payload(), "2026-12-25");
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.key !== "dhuhr").every((row) => row.begins === null && row.jamaat === null)).toBe(true);
  });
});

describe("noteForDate", () => {
  it("is the trimmed note of the day", () => {
    expect(noteForDate(payload(), "2026-11-25")).toBe("Car park closed");
  });

  it("is null without a note, for a blank note and for a day outside the payload", () => {
    expect(noteForDate(payload(), "2026-11-26")).toBeNull();
    expect(noteForDate(payload({ days: [day("2026-11-25", { note: "  " })] }), "2026-11-25")).toBeNull();
    expect(noteForDate(payload(), "2027-01-01")).toBeNull();
  });
});

describe("eventArabic", () => {
  const jumuah = "الجمعة";
  const dhuhr = "الظهر";

  it("keeps the event's own Arabic name for a congregation", () => {
    expect(eventArabic({ key: "dhuhr", kind: "jamaat", arabic: jumuah })).toBe(jumuah);
  });

  it("uses the prayer's Arabic name for the start of its time, also on a Friday", () => {
    expect(eventArabic({ key: "dhuhr", kind: "begins", arabic: jumuah })).toBe(dhuhr);
    expect(eventArabic({ key: "asr", kind: "begins", arabic: "x" })).not.toBe("x");
  });
});
