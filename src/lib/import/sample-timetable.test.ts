import { afterEach, describe, expect, it } from "vitest";
import { parseTimeToMinutes, toEpochDay } from "@/lib/time/dates";
import { PRAYERS, TIME_FIELDS, type PrayerDay, type TimeField } from "@/lib/types";
import { LONDON, generateSampleDays, type SampleLocation } from "../../../scripts/sample-timetable";
import { checkDay, findTimeJumps } from "./checks";

const NEW_YORK: SampleLocation = { latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" };
const KARACHI: SampleLocation = { latitude: 24.8607, longitude: 67.0011, timezone: "Asia/Karachi" };

/** Minutes since midnight of a field that must be present. */
function minutes(day: PrayerDay, field: TimeField): number {
  const time = day[field];
  if (time === null) throw new Error(`${day.date} has no ${field}`);
  return parseTimeToMinutes(time);
}

/** Whether a date is a Sunday. 1970-01-01, epoch day 0, was a Thursday. */
function isSunday(date: string): boolean {
  return (toEpochDay(date) + 4) % 7 === 0;
}

/** The day for a date. */
function on(days: readonly PrayerDay[], date: string): PrayerDay {
  const found = days.find((day) => day.date === date);
  if (!found) throw new Error(`No day for ${date}`);
  return found;
}

describe("generateSampleDays", () => {
  const london = generateSampleDays(2027);
  const originalZone = process.env.TZ;

  afterEach(() => {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  });

  it("covers every day of the year once, in order", () => {
    expect(london).toHaveLength(365);
    expect(london[0].date).toBe("2027-01-01");
    expect(london[364].date).toBe("2027-12-31");
    london.forEach((day, index) => expect(toEpochDay(day.date)).toBe(toEpochDay("2027-01-01") + index));
    expect(generateSampleDays(2028)).toHaveLength(366);
  });

  it("fills in every time as HH:mm and leaves Jumu'ah to the settings", () => {
    for (const day of london) {
      for (const field of TIME_FIELDS) expect(day[field]).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(day.jumuah).toEqual([]);
    }
  });

  it("matches London's real times at the turning points of the year", () => {
    expect(on(london, "2027-01-01")).toMatchObject({ fajrBegins: "06:25", sunrise: "08:06", dhuhrBegins: "12:09", asrBegins: "13:46", maghribBegins: "16:05", ishaBegins: "17:38" });
    // Longest day, in summer time: sunrise 04:43, sunset 21:21 (Maghrib a few minutes later).
    expect(on(london, "2027-06-21")).toMatchObject({ sunrise: "04:43", dhuhrBegins: "13:07", maghribBegins: "21:25" });
    // Shortest day: sunrise 08:04, sunset 15:53.
    expect(on(london, "2027-12-21")).toMatchObject({ sunrise: "08:04", dhuhrBegins: "12:03", maghribBegins: "15:56" });
  });

  it("is a timetable the plausibility checks find nothing wrong with", () => {
    for (const day of london) expect(checkDay(day)).toEqual([]);
    expect(findTimeJumps(london)).toEqual([]);
  });

  it("notes the two days the clocks change, and moves every time by an hour there", () => {
    expect(london.filter((day) => day.note !== null).map((day) => [day.date, day.note])).toEqual([
      ["2027-03-28", "Clocks go forward"],
      ["2027-10-31", "Clocks go back"],
    ]);
    expect(minutes(on(london, "2027-03-28"), "dhuhrBegins") - minutes(on(london, "2027-03-27"), "dhuhrBegins")).toBe(60);
    expect(minutes(on(london, "2027-10-31"), "dhuhrBegins") - minutes(on(london, "2027-10-30"), "dhuhrBegins")).toBe(-60);
  });

  it("sets jamaat times the way mosques do: quarter hours, never before the prayer begins", () => {
    for (const day of london) {
      for (const prayer of PRAYERS) {
        expect(minutes(day, prayer.jamaatField)).toBeGreaterThanOrEqual(minutes(day, prayer.beginsField));
      }
      for (const field of ["fajrJamaat", "dhuhrJamaat", "asrJamaat", "ishaJamaat"] as const) expect(minutes(day, field) % 15).toBe(0);
      expect(minutes(day, "fajrJamaat") - minutes(day, "fajrBegins")).toBeGreaterThanOrEqual(20);
      expect(minutes(day, "asrJamaat") - minutes(day, "asrBegins")).toBeGreaterThanOrEqual(10);
      expect(minutes(day, "ishaJamaat") - minutes(day, "ishaBegins")).toBeGreaterThanOrEqual(10);
      expect(minutes(day, "maghribJamaat") - minutes(day, "maghribBegins")).toBe(5);
    }
  });

  it("keeps Dhuhr jamaat fixed through winter time and through summer time", () => {
    const summer = (day: PrayerDay) => day.date >= "2027-03-28" && day.date < "2027-10-31";
    expect(new Set(london.filter((day) => !summer(day)).map((day) => day.dhuhrJamaat))).toEqual(new Set(["13:00"]));
    expect(new Set(london.filter(summer).map((day) => day.dhuhrJamaat))).toEqual(new Set(["13:30"]));
  });

  it("changes the Fajr, Asr and Isha jamaat only between weeks, which start on Sunday", () => {
    for (let index = 1; index < london.length; index++) {
      const previous = london[index - 1];
      const day = london[index];
      // The day of a clock change starts a group of its own within its week.
      if (isSunday(day.date) || day.note !== null) continue;
      expect([day.date, day.fajrJamaat, day.asrJamaat, day.ishaJamaat]).toEqual([day.date, previous.fajrJamaat, previous.asrJamaat, previous.ishaJamaat]);
    }
  });

  it("defaults to London and gives the same result every time", () => {
    expect(generateSampleDays(2027, LONDON)).toEqual(london);
    expect(generateSampleDays(2027)).toEqual(london);
  });

  it.each(["Pacific/Kiritimati", "America/Los_Angeles", "Asia/Kolkata"])("does not depend on the timezone of the machine (%s)", (zone) => {
    process.env.TZ = zone;
    // Proof that the switch took effect: local noon is no longer noon UTC.
    expect(new Date(2027, 0, 1, 12).getTimezoneOffset()).not.toBe(0);
    expect(generateSampleDays(2027)).toEqual(london);
  });

  it("writes the times of another place in that place's timezone", () => {
    const newYork = generateSampleDays(2027, NEW_YORK);
    expect(newYork.filter((day) => day.note !== null).map((day) => [day.date, day.note])).toEqual([
      ["2027-03-14", "Clocks go forward"],
      ["2027-11-07", "Clocks go back"],
    ]);
    expect(on(newYork, "2027-01-01")).toMatchObject({ fajrBegins: "05:45", sunrise: "07:20", dhuhrBegins: "12:05", maghribBegins: "16:42", dhuhrJamaat: "13:00" });
    expect(on(newYork, "2027-06-30")).toMatchObject({ sunrise: "05:28", dhuhrBegins: "13:05", dhuhrJamaat: "13:30" });
    for (const day of newYork) expect(checkDay(day)).toEqual([]);
    expect(findTimeJumps(newYork)).toEqual([]);
  });

  it("has no clock changes where there are none, and moves Dhuhr jamaat when 13:00 would be too early", () => {
    const karachi = generateSampleDays(2027, KARACHI);
    expect(karachi.filter((day) => day.note !== null)).toEqual([]);
    expect(new Set(karachi.map((day) => day.dhuhrJamaat))).toEqual(new Set(["13:15"]));
    expect(on(karachi, "2027-01-01")).toMatchObject({ fajrBegins: "05:55", sunrise: "07:17", dhuhrBegins: "12:40" });
  });
});
