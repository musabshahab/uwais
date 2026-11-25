import { describe, expect, it } from "vitest";
import { addDays, minutesToTime, parseTimeToMinutes } from "@/lib/time/dates";
import type { PrayerDay, TimeField } from "@/lib/types";
import { MAX_DAILY_DRIFT_MINUTES, checkDay, findMissingDates, findTimeJumps } from "./checks";
import { blankDay } from "./day";

const BEGIN_FIELDS: readonly TimeField[] = ["fajrBegins", "sunrise", "dhuhrBegins", "asrBegins", "maghribBegins", "ishaBegins"];

/** A plausible winter day. */
function day(date: string, changes: Partial<PrayerDay> = {}): PrayerDay {
  return {
    ...blankDay(date),
    fajrBegins: "06:25",
    fajrJamaat: "06:45",
    sunrise: "08:06",
    dhuhrBegins: "12:09",
    dhuhrJamaat: "13:00",
    asrBegins: "13:46",
    asrJamaat: "14:00",
    maghribBegins: "16:05",
    maghribJamaat: "16:10",
    ishaBegins: "17:38",
    ishaJamaat: "18:00",
    ...changes,
  };
}

/** A day with some of its times moved by a number of minutes. */
function shifted(date: string, minutes: number, fields: readonly TimeField[] = BEGIN_FIELDS): PrayerDay {
  const moved = day(date);
  for (const field of fields) {
    const time = moved[field];
    if (time !== null) moved[field] = minutesToTime(parseTimeToMinutes(time) + minutes);
  }
  return moved;
}

/** Consecutive days from a start date, built by index. */
function run(start: string, count: number, build: (date: string, index: number) => PrayerDay): PrayerDay[] {
  return Array.from({ length: count }, (_, index) => build(addDays(start, index), index));
}

describe("checkDay", () => {
  it("finds nothing wrong with a day in order", () => {
    expect(checkDay(day("2027-01-01"))).toEqual([]);
    expect(checkDay(blankDay("2027-01-01"))).toEqual([]);
  });

  it.each<[string, Partial<PrayerDay>, TimeField, string]>([
    ["sunrise before Fajr", { sunrise: "06:00" }, "sunrise", "Sunrise (06:00) is not later than Fajr Begins (06:25)."],
    ["Dhuhr before sunrise", { dhuhrBegins: "00:09" }, "dhuhrBegins", "Dhuhr Begins (00:09) is not later than Sunrise (08:06)."],
    ["Asr in the morning (a missing PM)", { asrBegins: "01:46" }, "asrBegins", "Asr Begins (01:46) is not later than Dhuhr Begins (12:09)."],
    ["Maghrib before Asr", { maghribBegins: "04:05" }, "maghribBegins", "Maghrib Begins (04:05) is not later than Asr Begins (13:46)."],
    ["Isha before Maghrib", { ishaBegins: "05:38" }, "ishaBegins", "Isha Begins (05:38) is not later than Maghrib Begins (16:05)."],
    ["two times the same", { asrBegins: "12:09" }, "asrBegins", "Asr Begins (12:09) is not later than Dhuhr Begins (12:09)."],
  ])("reports %s", (_name, changes, field, text) => {
    const findings = checkDay(day("2027-01-01", { ...changes, fajrJamaat: null, dhuhrJamaat: null, asrJamaat: null, maghribJamaat: null, ishaJamaat: null }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: "times-out-of-order", field });
    expect(findings[0].message).toBe(`${text} Check for a time in the wrong column or a missing AM/PM.`);
  });

  it("reports only the first time that is out of place", () => {
    // Everything after a far too late Fajr is "earlier"; one remark is enough.
    const findings = checkDay(day("2027-01-01", { fajrBegins: "18:25", fajrJamaat: "18:45" }));
    expect(findings.map((finding) => [finding.code, finding.field])).toEqual([["times-out-of-order", "sunrise"]]);
  });

  it("compares across times that are missing", () => {
    const findings = checkDay({ ...blankDay("2027-01-01"), fajrBegins: "06:25", maghribBegins: "04:05" });
    expect(findings.map((finding) => finding.field)).toEqual(["maghribBegins"]);
    expect(findings[0].message).toContain("is not later than Fajr Begins (06:25)");
  });

  it("accepts an Isha after midnight, as in northern summers", () => {
    const summer = day("2027-06-21", { maghribBegins: "22:05", maghribJamaat: "22:10", ishaBegins: "23:50", ishaJamaat: "00:15", asrBegins: "17:30", asrJamaat: "18:00" });
    expect(checkDay(summer)).toEqual([]);
    expect(checkDay({ ...summer, ishaBegins: "00:20", ishaJamaat: "00:30" })).toEqual([]);
    // Past the small hours it is no longer the same night.
    expect(checkDay({ ...summer, ishaBegins: "04:30", ishaJamaat: null }).map((finding) => finding.code)).toEqual(["times-out-of-order"]);
  });

  it("reports each jamaat that is before its prayer begins", () => {
    const findings = checkDay(day("2027-01-01", { fajrJamaat: "06:05", ishaJamaat: "17:30" }));
    expect(findings.map((finding) => [finding.code, finding.field])).toEqual([
      ["jamaat-before-begins", "fajrJamaat"],
      ["jamaat-before-begins", "ishaJamaat"],
    ]);
    expect(findings[0].message).toBe("Fajr Jamaat (06:05) is earlier than Fajr Begins (06:25).");
  });

  it("allows a jamaat at the minute the prayer begins, and a jamaat without a begin time", () => {
    expect(checkDay(day("2027-01-01", { maghribJamaat: "16:05" }))).toEqual([]);
    expect(checkDay({ ...blankDay("2027-01-01"), fajrJamaat: "06:45", ishaJamaat: "18:00" })).toEqual([]);
  });

  it("reports both kinds of finding on the same day", () => {
    const findings = checkDay(day("2027-01-01", { sunrise: "06:00", dhuhrJamaat: "12:00" }));
    expect(findings.map((finding) => finding.code)).toEqual(["times-out-of-order", "jamaat-before-begins"]);
  });
});

describe("findTimeJumps", () => {
  it("finds nothing in times that drift a little every day", () => {
    const days = run("2027-01-01", 40, (date, index) => shifted(date, -index));
    expect(findTimeJumps(days)).toEqual([]);
    expect(findTimeJumps([])).toEqual([]);
    expect(findTimeJumps([day("2027-01-01")])).toEqual([]);
  });

  it(`allows a change of exactly ${MAX_DAILY_DRIFT_MINUTES} minutes and flags one minute more`, () => {
    const allowed = [day("2027-01-01"), shifted("2027-01-02", MAX_DAILY_DRIFT_MINUTES, ["asrBegins"])];
    expect(findTimeJumps(allowed)).toEqual([]);
    const tooMuch = [day("2027-01-01"), shifted("2027-01-02", MAX_DAILY_DRIFT_MINUTES + 1, ["asrBegins"])];
    expect(findTimeJumps(tooMuch)).toEqual([{ date: "2027-01-02", field: "asrBegins", previous: "13:46", current: "14:07", shift: 0 }]);
  });

  it("reports a single wrong value once, not again when the next day is back to normal", () => {
    const days = [day("2027-01-01"), day("2027-01-02", { maghribBegins: "17:05" }), day("2027-01-03"), day("2027-01-04")];
    expect(findTimeJumps(days)).toEqual([{ date: "2027-01-02", field: "maghribBegins", previous: "16:05", current: "17:05", shift: 0 }]);
  });

  it("reports both ends of a stretch of wrong values", () => {
    const days = [day("2027-01-01"), day("2027-01-02", { sunrise: "09:06" }), day("2027-01-03", { sunrise: "09:06" }), day("2027-01-04")];
    expect(findTimeJumps(days).map((jump) => [jump.date, jump.field])).toEqual([
      ["2027-01-02", "sunrise"],
      ["2027-01-04", "sunrise"],
    ]);
  });

  it("reports a lasting change once, on the day it starts", () => {
    const days = run("2027-01-01", 6, (date, index) => (index < 3 ? day(date) : day(date, { ishaBegins: "18:30" })));
    expect(findTimeJumps(days)).toEqual([{ date: "2027-01-04", field: "ishaBegins", previous: "17:38", current: "18:30", shift: 0 }]);
  });

  it.each([
    ["forward", 60],
    ["back", -60],
  ])("accepts every time moving an hour when the clocks go %s", (_name, minutes) => {
    const days = run("2027-03-26", 5, (date, index) => shifted(date, (index < 2 ? 0 : minutes) + index));
    expect(findTimeJumps(days)).toEqual([]);
  });

  it("flags a time that did not move with the clocks", () => {
    const days = run("2027-03-26", 4, (date, index) => (index < 2 ? day(date) : { ...shifted(date, 60), dhuhrBegins: "12:09" }));
    expect(findTimeJumps(days)).toEqual([{ date: "2027-03-28", field: "dhuhrBegins", previous: "12:09", current: "12:09", shift: 60 }]);
  });

  it("needs two times to agree before it believes in a clock change", () => {
    const fajrAndIsha = (date: string, minutes: number): PrayerDay => ({ ...blankDay(date), fajrBegins: minutesToTime(385 + minutes), ishaBegins: minutesToTime(1058 + minutes) });
    expect(findTimeJumps([fajrAndIsha("2027-03-27", 0), fajrAndIsha("2027-03-28", 60)])).toEqual([]);

    const fajrOnly = (date: string, minutes: number): PrayerDay => ({ ...blankDay(date), fajrBegins: minutesToTime(385 + minutes) });
    expect(findTimeJumps([fajrOnly("2027-03-27", 0), fajrOnly("2027-03-28", 60)]).map((jump) => jump.field)).toEqual(["fajrBegins"]);
  });

  it("does not take two wrong values out of six for a clock change", () => {
    const days = [day("2027-01-01"), shifted("2027-01-02", 60, ["asrBegins", "maghribBegins"])];
    expect(findTimeJumps(days).map((jump) => jump.field)).toEqual(["asrBegins", "maghribBegins"]);
  });

  it("only compares a day with the day directly before it", () => {
    const days = [day("2027-01-01"), day("2027-01-03", { maghribBegins: "17:05" }), day("2027-01-10", { maghribBegins: "16:20" })];
    expect(findTimeJumps(days)).toEqual([]);
  });

  it("ignores jamaat times, which change in steps", () => {
    const days = [day("2027-01-01"), day("2027-01-02", { fajrJamaat: "07:30", ishaJamaat: "19:00" })];
    expect(findTimeJumps(days)).toEqual([]);
  });

  it("follows Isha across midnight", () => {
    const days = [day("2027-06-01", { ishaBegins: "23:55" }), day("2027-06-02", { ishaBegins: "00:02" }), day("2027-06-03", { ishaBegins: "00:06" })];
    expect(findTimeJumps(days)).toEqual([]);
  });

  it("skips a time that is missing on either day", () => {
    const days = [day("2027-01-01", { asrBegins: null }), day("2027-01-02", { asrBegins: "15:46" }), day("2027-01-03", { asrBegins: null })];
    expect(findTimeJumps(days)).toEqual([]);
  });
});

describe("findMissingDates", () => {
  it("finds nothing in a run without gaps", () => {
    expect(findMissingDates(["2027-01-01", "2027-01-02", "2027-01-03"], 10)).toEqual({ dates: [], total: 0, ranges: [] });
    expect(findMissingDates(["2027-01-01"], 10)).toEqual({ dates: [], total: 0, ranges: [] });
    expect(findMissingDates([], 10)).toEqual({ dates: [], total: 0, ranges: [] });
  });

  it("lists every skipped date and the gaps as ranges", () => {
    expect(findMissingDates(["2027-01-01", "2027-01-03", "2027-01-04", "2027-01-08"], 10)).toEqual({
      dates: ["2027-01-02", "2027-01-05", "2027-01-06", "2027-01-07"],
      total: 4,
      ranges: [
        { from: "2027-01-02", to: "2027-01-02" },
        { from: "2027-01-05", to: "2027-01-07" },
      ],
    });
  });

  it("crosses month and year ends, and knows leap years", () => {
    expect(findMissingDates(["2027-12-30", "2028-01-02"], 10).dates).toEqual(["2027-12-31", "2028-01-01"]);
    expect(findMissingDates(["2028-02-28", "2028-03-01"], 10).dates).toEqual(["2028-02-29"]);
    expect(findMissingDates(["2027-02-28", "2027-03-01"], 10).total).toBe(0);
  });

  it("counts everything but lists no more than the limit", () => {
    const missing = findMissingDates(["2027-01-01", "2027-03-01", "2027-03-03", "2027-03-05", "2027-03-07"], 3);
    expect(missing.total).toBe(58 + 3);
    expect(missing.dates).toEqual(["2027-01-02", "2027-01-03", "2027-01-04"]);
    expect(missing.ranges).toEqual([
      { from: "2027-01-02", to: "2027-02-28" },
      { from: "2027-03-02", to: "2027-03-02" },
      { from: "2027-03-04", to: "2027-03-04" },
    ]);
  });
});
