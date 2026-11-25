import { describe, expect, it } from "vitest";
import { liveTimetable, staticTimetable } from "@/lib/client/prayer-view";
import type { DisplayPayload } from "@/lib/types";
import { londonMs, makeDay, makeSettings, makeWeek, scheduleAt } from "./testing";
import { buildTvTimetable, dayHasTimes, timetableDayAt, type TimetableDay } from "./timetable";

/** The day the table shows at an instant of the sample week (Isha jamaat 19:30, 10 minutes in progress). */
function dayAt(
  nowMs: number,
  days = makeWeek(),
  settings = makeSettings(),
): TimetableDay {
  return timetableDayAt({
    nowMs,
    schedule: scheduleAt(nowMs, days, settings),
    inProgressMinutes: settings.tv.jamaatInProgressMinutes,
  });
}

describe("dayHasTimes", () => {
  it("is false for a missing row and for a row of blanks", () => {
    const blank = makeDay("2026-11-25", {
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
      jumuah: ["13:15"],
    });
    expect(dayHasTimes(null)).toBe(false);
    expect(dayHasTimes(undefined)).toBe(false);
    expect(dayHasTimes(blank)).toBe(false);
    expect(dayHasTimes({ ...blank, sunrise: "7.30" })).toBe(false);
  });

  it("is true as soon as one time is usable", () => {
    expect(dayHasTimes(makeDay("2026-11-25"))).toBe(true);
    expect(
      dayHasTimes({ ...makeDay("2026-11-25"), fajrBegins: null, ishaJamaat: "19:30" }),
    ).toBe(true);
  });
});

describe("timetableDayAt", () => {
  it("shows today all day, up to and through the Isha congregation", () => {
    expect(dayAt(londonMs(25, "00:00"))).toBe("today");
    expect(dayAt(londonMs(25, "03:00"))).toBe("today");
    expect(dayAt(londonMs(25, "12:00"))).toBe("today");
    expect(dayAt(londonMs(25, "17:45"))).toBe("today");
    expect(dayAt(londonMs(25, "19:29:59"))).toBe("today");
    expect(dayAt(londonMs(25, "19:30"))).toBe("today");
    expect(dayAt(londonMs(25, "19:39:59"))).toBe("today");
  });

  it("switches to tomorrow the moment the Isha congregation is no longer in progress", () => {
    expect(dayAt(londonMs(25, "19:40"))).toBe("tomorrow");
    expect(dayAt(londonMs(25, "21:00"))).toBe("tomorrow");
    expect(dayAt(londonMs(25, "23:59:59"))).toBe("tomorrow");
  });

  it("is today's again at midnight", () => {
    expect(dayAt(londonMs(26, "00:00"))).toBe("today");
    expect(dayAt(londonMs(26, "00:00:01"))).toBe("today");
  });

  it("follows the configured length of a congregation", () => {
    const long = makeSettings({}, { jamaatInProgressMinutes: 25 });
    expect(dayAt(londonMs(25, "19:54:59"), makeWeek(), long)).toBe("today");
    expect(dayAt(londonMs(25, "19:55"), makeWeek(), long)).toBe("tomorrow");
  });

  it("switches at the congregation time itself when the in-progress screen is off", () => {
    const off = makeSettings({}, { jamaatInProgressMinutes: 0 });
    expect(dayAt(londonMs(25, "19:29:59"), makeWeek(), off)).toBe("today");
    expect(dayAt(londonMs(25, "19:30"), makeWeek(), off)).toBe("tomorrow");
  });

  it("uses the start of Isha when the timetable has no Isha congregation", () => {
    const days = makeWeek().map((day) => ({ ...day, ishaJamaat: null }));
    expect(dayAt(londonMs(25, "17:54:59"), days)).toBe("today");
    expect(dayAt(londonMs(25, "17:55"), days)).toBe("tomorrow");
  });

  it("stays on today when tomorrow has no times", () => {
    const days = makeWeek().filter((day) => day.date !== "2026-11-26");
    expect(dayAt(londonMs(25, "22:00"), days)).toBe("today");
  });

  it("stays on today when today has no Isha time at all", () => {
    const days = makeWeek().map((day) => ({ ...day, ishaBegins: null, ishaJamaat: null }));
    expect(dayAt(londonMs(25, "23:00"), days)).toBe("today");
  });

  it("stays on today while a later event of the day is still to come", () => {
    // A timetable with a mistake: Maghrib entered after Isha.
    const days = makeWeek().map((day) => ({ ...day, maghribJamaat: "21:00" }));
    expect(dayAt(londonMs(25, "20:00"), days)).toBe("today");
    expect(dayAt(londonMs(25, "21:10"), days)).toBe("tomorrow");
  });

  it("stays on today while a congregation that began before midnight is in progress", () => {
    const days = makeWeek().map((day) => ({ ...day, ishaJamaat: "23:55" }));
    expect(dayAt(londonMs(25, "23:57"), days)).toBe("today");
    expect(dayAt(londonMs(26, "00:02"), days)).toBe("today");
    expect(dayAt(londonMs(26, "00:06"), days)).toBe("today");
  });

  it("treats a length that is not a number as none", () => {
    const schedule = scheduleAt(londonMs(25, "19:31"), makeWeek(), makeSettings({}, { jamaatInProgressMinutes: 0 }));
    expect(timetableDayAt({ nowMs: londonMs(25, "19:31"), schedule, inProgressMinutes: Number.NaN })).toBe("tomorrow");
    expect(timetableDayAt({ nowMs: londonMs(25, "19:31"), schedule, inProgressMinutes: -5 })).toBe("tomorrow");
  });
});

describe("buildTvTimetable", () => {
  const settings = makeSettings();

  function payload(overrides: Partial<DisplayPayload> = {}): DisplayPayload {
    return {
      version: "test",
      serverNow: londonMs(25, "12:00"),
      settings,
      days: makeWeek(),
      announcements: [],
      coverage: { firstDate: "2026-11-24", lastDate: "2026-11-28", totalDays: 5 },
      ...overrides,
    };
  }

  it("renders today's rows without statuses before the clock is known", () => {
    const table = buildTvTimetable({
      timetable: staticTimetable(payload()),
      schedule: null,
      settings,
      day: "today",
    });
    expect(table.day).toBe("today");
    expect(table.date).toBe("2026-11-25");
    expect(table.rows.map((row) => row.key)).toEqual([
      "fajr",
      "sunrise",
      "dhuhr",
      "asr",
      "maghrib",
      "isha",
    ]);
    expect(table.rows.every((row) => row.status === null)).toBe(true);
    expect(table.rows.every((row) => row.target === null && row.targetTime === null)).toBe(true);
    expect(table.showBegins).toBe(true);
    expect(table.showJamaat).toBe(true);
  });

  it("falls back to today when tomorrow is asked for before the clock is known", () => {
    const table = buildTvTimetable({
      timetable: staticTimetable(payload()),
      schedule: null,
      settings,
      day: "tomorrow",
    });
    expect(table.day).toBe("today");
    expect(table.date).toBe("2026-11-25");
  });

  it("keeps the live statuses of today's rows", () => {
    const schedule = scheduleAt(londonMs(25, "14:10"));
    const table = buildTvTimetable({
      timetable: liveTimetable(schedule),
      schedule,
      settings,
      day: "today",
    });
    expect(table.rows.map((row) => [row.key, row.status])).toEqual([
      ["fajr", "passed"],
      ["sunrise", "passed"],
      ["dhuhr", "passed"],
      ["asr", "current"],
      ["maghrib", "next"],
      ["isha", "upcoming"],
    ]);
  });

  it("shows tomorrow's times with Fajr marked as next", () => {
    const schedule = scheduleAt(londonMs(25, "21:00"));
    const table = buildTvTimetable({
      timetable: liveTimetable(schedule),
      schedule,
      settings,
      day: "tomorrow",
    });
    expect(table.day).toBe("tomorrow");
    expect(table.date).toBe("2026-11-26");
    expect(table.rows.map((row) => [row.key, row.status])).toEqual([
      ["fajr", "next"],
      ["sunrise", "upcoming"],
      ["dhuhr", "upcoming"],
      ["asr", "upcoming"],
      ["maghrib", "upcoming"],
      ["isha", "upcoming"],
    ]);
    // Thursday's Asr congregation is the changed one.
    expect(table.rows.filter((row) => row.key === "asr")[0].jamaat).toBe("14:15");
  });

  it("points at the time the countdown is heading for", () => {
    const targets = (time: string, day: TimetableDay = "today") => {
      const schedule = scheduleAt(londonMs(25, time));
      return buildTvTimetable({ timetable: liveTimetable(schedule), schedule, settings, day })
        .rows.filter((row) => row.target !== null)
        .map((row) => [row.key, row.target, row.targetTime]);
    };
    expect(targets("14:10")).toEqual([["asr", "jamaat", "14:30"]]);
    expect(targets("15:00")).toEqual([["maghrib", "begins", "16:02"]]);
    expect(targets("16:03")).toEqual([["maghrib", "jamaat", "16:07"]]);
    // After Isha the countdown is for tomorrow's Fajr: nothing in today's table, Fajr in tomorrow's.
    expect(targets("21:00")).toEqual([]);
    expect(targets("21:00", "tomorrow")).toEqual([["fajr", "begins", "05:40"]]);
  });

  it("points at the Jumu'ah slot the countdown is heading for", () => {
    const twoSlots = makeSettings({
      jumuah: [
        { label: "1st Jumu'ah", time: "12:30" },
        { label: "2nd Jumu'ah", time: "13:30" },
      ],
    });
    const schedule = scheduleAt(londonMs(27, "12:45"), makeWeek(), twoSlots);
    const table = buildTvTimetable({
      timetable: liveTimetable(schedule),
      schedule,
      settings: twoSlots,
      day: "today",
    });
    const jumuah = table.rows.filter((row) => row.key === "dhuhr")[0];
    expect(jumuah.target).toBe("jamaat");
    expect(jumuah.targetTime).toBe("13:30");
  });

  it("presents Friday's Dhuhr row as Jumu'ah with every slot, today and as tomorrow", () => {
    const twoSlots = makeSettings({
      jumuah: [
        { label: "1st Jumu'ah", time: "12:30" },
        { label: "2nd Jumu'ah", time: "13:30" },
      ],
    });
    const friday = scheduleAt(londonMs(27, "10:00"), makeWeek(), twoSlots);
    const today = buildTvTimetable({
      timetable: liveTimetable(friday),
      schedule: friday,
      settings: twoSlots,
      day: "today",
    });
    const jumuah = today.rows.filter((row) => row.key === "dhuhr")[0];
    expect(jumuah.isJumuah).toBe(true);
    expect(jumuah.name).toBe("Jumu'ah");
    expect(jumuah.begins).toBe("11:55");
    expect(jumuah.jumuahTimes).toEqual([
      { label: "1st Jumu'ah", time: "12:30" },
      { label: "2nd Jumu'ah", time: "13:30" },
    ]);

    const thursdayNight = scheduleAt(londonMs(26, "21:00"), makeWeek(), twoSlots);
    const tomorrow = buildTvTimetable({
      timetable: liveTimetable(thursdayNight),
      schedule: thursdayNight,
      settings: twoSlots,
      day: "tomorrow",
    });
    expect(tomorrow.date).toBe("2026-11-27");
    const ahead = tomorrow.rows.filter((row) => row.key === "dhuhr")[0];
    expect(ahead.isJumuah).toBe(true);
    expect(ahead.jumuahTimes.map((slot) => slot.time)).toEqual(["12:30", "13:30"]);
  });

  it("leaves the sunrise row out when the settings say so", () => {
    const hidden = makeSettings({}, { showSunrise: false });
    const table = buildTvTimetable({
      timetable: staticTimetable(payload({ settings: hidden })),
      schedule: null,
      settings: hidden,
      day: "today",
    });
    expect(table.rows.map((row) => row.key)).toEqual(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
  });

  it("leaves the sunrise row out when the timetable has no sunrise", () => {
    const days = makeWeek().map((day) => ({ ...day, sunrise: null }));
    const table = buildTvTimetable({
      timetable: staticTimetable(payload({ days })),
      schedule: null,
      settings,
      day: "today",
    });
    expect(table.rows.some((row) => row.key === "sunrise")).toBe(false);
  });

  it("switches off a column that would hold nothing but dashes", () => {
    const jamaatOnly = makeWeek().map((day) => ({
      ...day,
      fajrBegins: null,
      sunrise: null,
      dhuhrBegins: null,
      asrBegins: null,
      maghribBegins: null,
      ishaBegins: null,
    }));
    const onlyJamaat = buildTvTimetable({
      timetable: staticTimetable(payload({ days: jamaatOnly })),
      schedule: null,
      settings,
      day: "today",
    });
    expect(onlyJamaat.showBegins).toBe(false);
    expect(onlyJamaat.showJamaat).toBe(true);

    const beginsOnly = makeWeek().map((day) => ({
      ...day,
      fajrJamaat: null,
      dhuhrJamaat: null,
      asrJamaat: null,
      maghribJamaat: null,
      ishaJamaat: null,
    }));
    const onlyBegins = buildTvTimetable({
      timetable: staticTimetable(payload({ days: beginsOnly })),
      schedule: null,
      settings,
      day: "today",
    });
    expect(onlyBegins.showBegins).toBe(true);
    expect(onlyBegins.showJamaat).toBe(false);
  });

  it("keeps both columns for a day without any time", () => {
    const table = buildTvTimetable({
      timetable: staticTimetable(payload({ days: [] })),
      schedule: null,
      settings,
      day: "today",
    });
    expect(table.rows).toHaveLength(5);
    expect(table.showBegins).toBe(true);
    expect(table.showJamaat).toBe(true);
  });
});
