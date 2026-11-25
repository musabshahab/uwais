import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  JUMUAH_LABEL,
  type JumuahSlot,
  type PrayerDay,
  type SiteSettings,
} from "@/lib/types";
import {
  type PrayerState,
  computePrayerState,
  getDayRow,
  prayerRowsForDay,
  resolveJumuahSlots,
} from "./schedule";
import { zonedDateTimeToEpochMs } from "./tz";

const MINUTE = 60000;
const HOUR = 3600000;

/** Epoch milliseconds of a UTC date-time written as `YYYY-MM-DDTHH:mm[:ss[.sss]]`. */
function utc(isoWithoutZone: string): number {
  return Date.parse(`${isoWithoutZone}Z`);
}

/** A realistic late-November day in London, with any column overridden. */
function makeDay(date: string, overrides: Partial<PrayerDay> = {}): PrayerDay {
  return {
    date,
    fajrBegins: "06:02",
    fajrJamaat: "06:30",
    sunrise: "07:36",
    dhuhrBegins: "11:53",
    dhuhrJamaat: "12:30",
    asrBegins: "13:52",
    asrJamaat: "14:15",
    maghribBegins: "16:00",
    maghribJamaat: "16:05",
    ishaBegins: "17:41",
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<SiteSettings> = {}): SiteSettings {
  return { ...DEFAULT_SETTINGS, timezone: "Europe/London", ...overrides };
}

const EMPTY_DAY: Partial<PrayerDay> = {
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

// 2026-11-25 is a Wednesday; London is on GMT, so wall times equal UTC.
const WEDNESDAY = "2026-11-25";
const THURSDAY = "2026-11-26";
const FRIDAY = "2026-11-27";
const SATURDAY = "2026-11-28";

const WEEK: PrayerDay[] = [
  makeDay("2026-11-24"),
  makeDay(WEDNESDAY),
  makeDay(THURSDAY, { fajrBegins: "06:03", sunrise: "07:37" }),
  makeDay(FRIDAY, { fajrBegins: "06:05", sunrise: "07:39" }),
  makeDay(SATURDAY, { fajrBegins: "06:06", sunrise: "07:40" }),
];

const SETTINGS = makeSettings();

function stateAt(
  isoWithoutZone: string,
  days: readonly PrayerDay[] = WEEK,
  settings: SiteSettings = SETTINGS,
): PrayerState {
  return computePrayerState({ days, settings, nowMs: utc(isoWithoutZone) });
}

/** Row statuses keyed by row, for compact assertions. */
function statuses(state: PrayerState): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of state.rows) result[row.key] = row.status;
  return result;
}

/** `key kind` of an event, or `none`. */
function label(event: PrayerState["next"]): string {
  return event ? `${event.key} ${event.kind}` : "none";
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

describe("getDayRow", () => {
  it("finds a row by date in a list of any order", () => {
    const shuffled = [WEEK[3], WEEK[0], WEEK[4], WEEK[1], WEEK[2]];
    expect(getDayRow(shuffled, THURSDAY)).toBe(WEEK[2]);
    expect(getDayRow(WEEK, WEDNESDAY)).toBe(WEEK[1]);
  });

  it("returns null when the date is not in the timetable", () => {
    expect(getDayRow(WEEK, "2026-12-25")).toBeNull();
    expect(getDayRow([], WEDNESDAY)).toBeNull();
  });
});

describe("resolveJumuahSlots", () => {
  const twoDefaults = {
    jumuah: [
      { label: "1st Jumu'ah", time: "12:45" },
      { label: "2nd Jumu'ah", time: "13:30" },
    ],
  };

  it("uses the default slots, with their labels, when the day has none of its own", () => {
    expect(resolveJumuahSlots(makeDay(FRIDAY), twoDefaults)).toEqual(twoDefaults.jumuah);
    expect(resolveJumuahSlots(null, twoDefaults)).toEqual(twoDefaults.jumuah);
  });

  it("orders default slots by time and labels blank ones", () => {
    const settings = {
      jumuah: [
        { label: " ", time: "13:30" },
        { label: "Khutbah", time: "12:45" },
        { label: "broken", time: "25:00" },
      ],
    };
    expect(resolveJumuahSlots(null, settings)).toEqual([
      { label: "Khutbah", time: "12:45" },
      { label: "2nd Jumu'ah", time: "13:30" },
    ]);
    // The settings themselves are left as the admin saved them.
    expect(settings.jumuah[0].time).toBe("13:30");
  });

  it("prefers the day's own times and gives them the default labels when the count matches", () => {
    const day = makeDay(FRIDAY, { jumuah: ["13:45", "13:00"] });
    expect(resolveJumuahSlots(day, twoDefaults)).toEqual([
      { label: "1st Jumu'ah", time: "13:00" },
      { label: "2nd Jumu'ah", time: "13:45" },
    ]);
  });

  it("numbers the day's own times when the count differs from the defaults", () => {
    const three = makeDay(FRIDAY, { jumuah: ["12:30", "13:15", "14:00"] });
    expect(resolveJumuahSlots(three, twoDefaults)).toEqual([
      { label: "1st Jumu'ah", time: "12:30" },
      { label: "2nd Jumu'ah", time: "13:15" },
      { label: "3rd Jumu'ah", time: "14:00" },
    ]);
    const one = makeDay(FRIDAY, { jumuah: ["13:00"] });
    expect(resolveJumuahSlots(one, twoDefaults)).toEqual([{ label: "Jumu'ah", time: "13:00" }]);
  });

  it("drops duplicate and malformed times from the day's own list", () => {
    const day = makeDay(FRIDAY, { jumuah: ["13:45", "1pm", "13:00", "13:45", ""] });
    expect(resolveJumuahSlots(day, { jumuah: [] }).map((slot) => slot.time)).toEqual(["13:00", "13:45"]);
    // Nothing usable left: fall through to the defaults.
    const garbage = makeDay(FRIDAY, { jumuah: ["1pm"] });
    expect(resolveJumuahSlots(garbage, twoDefaults)).toEqual(twoDefaults.jumuah);
  });

  it("falls back to the Dhuhr jamaat column when no Jumu'ah time is configured anywhere", () => {
    expect(resolveJumuahSlots(makeDay(FRIDAY), { jumuah: [] })).toEqual([
      { label: "Jumu'ah", time: "12:30" },
    ]);
    expect(resolveJumuahSlots(makeDay(FRIDAY, { dhuhrJamaat: null }), { jumuah: [] })).toEqual([]);
    expect(resolveJumuahSlots(null, { jumuah: [] })).toEqual([]);
  });
});

describe("prayerRowsForDay", () => {
  it("lists fajr, sunrise, dhuhr, asr, maghrib and isha for an ordinary day", () => {
    const rows = prayerRowsForDay(WEEK[1], SETTINGS, WEDNESDAY);
    expect(rows.map((row) => row.key)).toEqual(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    expect(rows.map((row) => row.name)).toEqual(["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]);
    expect(rows.map((row) => row.begins)).toEqual(["06:02", "07:36", "11:53", "13:52", "16:00", "17:41"]);
    expect(rows.map((row) => row.jamaat)).toEqual(["06:30", null, "12:30", "14:15", "16:05", "19:30"]);
    expect(rows.every((row) => !row.isJumuah && row.jumuahTimes.length === 0)).toBe(true);
    expect(rows[0].arabic).toBe("الفجر");
    expect(rows[1].arabic).toBe("الشروق");
  });

  it("presents Dhuhr as Jumu'ah on a Friday", () => {
    const rows = prayerRowsForDay(WEEK[3], SETTINGS, FRIDAY);
    expect(rows[2]).toEqual({
      key: "dhuhr",
      name: "Jumu'ah",
      arabic: JUMUAH_LABEL.arabic,
      begins: "11:53",
      jamaat: "13:15",
      isJumuah: true,
      jumuahTimes: [{ label: "Jumu'ah", time: "13:15" }],
    });
    expect(rows.filter((row) => row.isJumuah)).toHaveLength(1);
  });

  it("returns empty rows for a date without a timetable row, still showing Friday's default Jumu'ah", () => {
    const wednesday = prayerRowsForDay(null, SETTINGS, WEDNESDAY);
    expect(wednesday).toHaveLength(6);
    expect(wednesday.every((row) => row.begins === null && row.jamaat === null)).toBe(true);

    const friday = prayerRowsForDay(null, SETTINGS, FRIDAY);
    expect(friday[2].name).toBe("Jumu'ah");
    expect(friday[2].begins).toBeNull();
    expect(friday[2].jamaat).toBe("13:15");
  });

  it("treats malformed times as missing", () => {
    const day = makeDay(WEDNESDAY, { fajrBegins: "6am", asrJamaat: "25:00", sunrise: "" });
    const rows = prayerRowsForDay(day, SETTINGS, WEDNESDAY);
    expect(rows[0].begins).toBeNull();
    expect(rows[0].jamaat).toBe("06:30");
    expect(rows[1].begins).toBeNull();
    expect(rows[3].jamaat).toBeNull();
  });

  it("decides Friday from the date argument and rejects an invalid date", () => {
    expect(prayerRowsForDay(WEEK[1], SETTINGS, FRIDAY)[2].isJumuah).toBe(true);
    expect(() => prayerRowsForDay(WEEK[1], SETTINGS, "Friday")).toThrow(RangeError);
  });
});

describe("computePrayerState: clock", () => {
  it("reports the mosque's wall clock and calendar", () => {
    const state = stateAt("2026-11-25T11:40:07");
    expect(state.today).toBe(WEDNESDAY);
    expect(state.tomorrow).toBe(THURSDAY);
    expect(state.nowTime).toBe("11:40");
    expect(state.weekday).toBe(3);
    expect(state.isFriday).toBe(false);
    expect(state.timezone).toBe("Europe/London");
    expect(state.nowMs).toBe(utc("2026-11-25T11:40:07"));
    expect(state.clock).toEqual({
      date: WEDNESDAY,
      time: "11:40",
      hour: 11,
      minute: 40,
      second: 7,
      minutesOfDay: 700,
      secondsOfDay: 42007,
      weekday: 3,
    });
    expect(state.todayRow).toBe(WEEK[1]);
    expect(state.tomorrowRow).toBe(WEEK[2]);
    expect(state.dataStatus).toBe("ok");
  });

  it("takes today from the mosque's timezone, not from UTC", () => {
    const karachi = makeSettings({ timezone: "Asia/Karachi" });
    // 20:00 UTC on Wednesday is already 01:00 on Thursday in Karachi.
    const state = stateAt("2026-11-25T20:00:00", WEEK, karachi);
    expect(state.today).toBe(THURSDAY);
    expect(state.nowTime).toBe("01:00");
    expect(state.todayRow).toBe(WEEK[2]);
    expect(label(state.next)).toBe("fajr begins");
    // Thursday's Fajr at 06:03 in Karachi is 01:03 UTC.
    expect(state.next?.atMs).toBe(utc("2026-11-26T01:03:00"));
    expect(state.next?.secondsUntil).toBe(5 * 3600 + 3 * 60);

    const newYork = makeSettings({ timezone: "America/New_York" });
    // 03:00 UTC on Thursday is still 22:00 on Wednesday in New York.
    const evening = stateAt("2026-11-26T03:00:00", WEEK, newYork);
    expect(evening.today).toBe(WEDNESDAY);
    expect(evening.current?.key).toBe("isha");
    expect(evening.next?.date).toBe(THURSDAY);
    expect(evening.next?.atMs).toBe(utc("2026-11-26T11:03:00"));
  });

  it("keeps running in UTC when the device does not know the configured zone", () => {
    const state = stateAt("2026-11-25T11:40:00", WEEK, makeSettings({ timezone: "Mars/Phobos" }));
    expect(state.timezone).toBe("UTC");
    expect(state.nowTime).toBe("11:40");
    expect(label(state.next)).toBe("dhuhr begins");
  });

  it("rejects an invalid instant", () => {
    expect(() => computePrayerState({ days: WEEK, settings: SETTINGS, nowMs: Number.NaN })).toThrow(RangeError);
  });
});

describe("computePrayerState: current prayer and next event through the day", () => {
  it.each([
    ["00:00", "none", "fajr begins"],
    ["03:00", "none", "fajr begins"],
    ["06:01", "none", "fajr begins"],
    ["06:02", "fajr", "fajr jamaat"],
    ["06:10", "fajr", "fajr jamaat"],
    ["06:30", "fajr", "dhuhr begins"],
    ["07:35", "fajr", "dhuhr begins"],
    ["07:36", "none", "dhuhr begins"],
    ["09:00", "none", "dhuhr begins"],
    ["11:52", "none", "dhuhr begins"],
    ["11:53", "dhuhr", "dhuhr jamaat"],
    ["12:29", "dhuhr", "dhuhr jamaat"],
    ["12:30", "dhuhr", "asr begins"],
    ["13:51", "dhuhr", "asr begins"],
    ["13:52", "asr", "asr jamaat"],
    ["14:15", "asr", "maghrib begins"],
    ["15:59", "asr", "maghrib begins"],
    ["16:00", "maghrib", "maghrib jamaat"],
    ["16:05", "maghrib", "isha begins"],
    ["17:40", "maghrib", "isha begins"],
    ["17:41", "isha", "isha jamaat"],
    ["19:29", "isha", "isha jamaat"],
    ["19:30", "isha", "fajr begins"],
    ["23:59", "isha", "fajr begins"],
  ])("at %s the current prayer is %s and the next event is %s", (time, current, next) => {
    const state = stateAt(`${WEDNESDAY}T${time}:00`);
    expect(state.current ? state.current.key : "none").toBe(current);
    expect(label(state.next)).toBe(next);
  });

  it("counts down to Fajr before dawn", () => {
    const state = stateAt("2026-11-25T03:00:00");
    expect(state.current).toBeNull();
    expect(state.next).toEqual({
      key: "fajr",
      name: "Fajr",
      arabic: "الفجر",
      kind: "begins",
      time: "06:02",
      date: WEDNESDAY,
      atMs: utc("2026-11-25T06:02:00"),
      secondsUntil: 3 * 3600 + 2 * 60,
      isJumuah: false,
      label: null,
    });
    expect(state.nextBegins).toEqual(state.next);
    expect(label(state.nextJamaat)).toBe("fajr jamaat");
    expect(state.nextJamaat?.secondsUntil).toBe(3 * 3600 + 30 * 60);
    expect(statuses(state)).toEqual({
      fajr: "next",
      sunrise: "upcoming",
      dhuhr: "upcoming",
      asr: "upcoming",
      maghrib: "upcoming",
      isha: "upcoming",
    });
  });

  it("describes the Fajr window: it opens at Fajr and closes at sunrise", () => {
    const state = stateAt("2026-11-25T06:10:00");
    expect(state.current).toEqual({
      key: "fajr",
      name: "Fajr",
      arabic: "الفجر",
      isJumuah: false,
      startedAtMs: utc("2026-11-25T06:02:00"),
      endsAtMs: utc("2026-11-25T07:36:00"),
    });
    expect(state.next?.secondsUntil).toBe(20 * 60);
    expect(label(state.nextBegins)).toBe("dhuhr begins");
    expect(statuses(state)).toEqual({
      fajr: "current",
      sunrise: "upcoming",
      dhuhr: "next",
      asr: "upcoming",
      maghrib: "upcoming",
      isha: "upcoming",
    });
  });

  it("has no current prayer between sunrise and Dhuhr", () => {
    const state = stateAt("2026-11-25T09:00:00");
    expect(state.current).toBeNull();
    expect(statuses(state)).toEqual({
      fajr: "passed",
      sunrise: "passed",
      dhuhr: "next",
      asr: "upcoming",
      maghrib: "upcoming",
      isha: "upcoming",
    });
  });

  it("marks the prayer after the current one as next", () => {
    const state = stateAt("2026-11-25T12:00:00");
    expect(state.current?.endsAtMs).toBe(utc("2026-11-25T13:52:00"));
    expect(statuses(state)).toEqual({
      fajr: "passed",
      sunrise: "passed",
      dhuhr: "current",
      asr: "next",
      maghrib: "upcoming",
      isha: "upcoming",
    });
  });

  it("after the Isha jamaat counts down to tomorrow's Fajr with the right date and instant", () => {
    const state = stateAt("2026-11-25T21:00:00");
    expect(state.current).toEqual({
      key: "isha",
      name: "Isha",
      arabic: "العشاء",
      isJumuah: false,
      startedAtMs: utc("2026-11-25T17:41:00"),
      endsAtMs: utc("2026-11-26T00:00:00"),
    });
    expect(state.next).toMatchObject({
      key: "fajr",
      kind: "begins",
      time: "06:03",
      date: THURSDAY,
      atMs: utc("2026-11-26T06:03:00"),
      secondsUntil: 9 * 3600 + 3 * 60,
    });
    expect(state.nextBegins).toEqual(state.next);
    expect(state.nextJamaat).toMatchObject({ key: "fajr", kind: "jamaat", date: THURSDAY, time: "06:30" });
    expect(statuses(state)).toEqual({
      fajr: "passed",
      sunrise: "passed",
      dhuhr: "passed",
      asr: "passed",
      maghrib: "passed",
      isha: "current",
    });
  });

  it("does not carry yesterday's Isha past midnight", () => {
    const state = stateAt("2026-11-26T00:00:00");
    expect(state.today).toBe(THURSDAY);
    expect(state.current).toBeNull();
    expect(state.next).toMatchObject({ key: "fajr", date: THURSDAY, secondsUntil: 6 * 3600 + 3 * 60 });
    expect(statuses(state).fajr).toBe("next");
  });

  it("switches exactly at the event instant and rounds the countdown up to whole seconds", () => {
    const fajr = utc("2026-11-25T06:02:00");
    const at = (nowMs: number) => computePrayerState({ days: WEEK, settings: SETTINGS, nowMs });

    const justBefore = at(fajr - 1);
    expect(justBefore.current).toBeNull();
    expect(label(justBefore.next)).toBe("fajr begins");
    expect(justBefore.next?.secondsUntil).toBe(1);

    expect(at(fajr - 1000).next?.secondsUntil).toBe(1);
    expect(at(fajr - 1001).next?.secondsUntil).toBe(2);

    const exactly = at(fajr);
    expect(exactly.current?.key).toBe("fajr");
    expect(label(exactly.next)).toBe("fajr jamaat");
    expect(exactly.next?.secondsUntil).toBe(28 * 60);
  });

  it("when begins and jamaat coincide, both are behind us at that instant", () => {
    const days = [makeDay(WEDNESDAY, { maghribJamaat: "16:00" }), makeDay(THURSDAY)];
    const before = stateAt("2026-11-25T15:59:30", days);
    expect(label(before.next)).toBe("maghrib begins");
    expect(label(before.nextJamaat)).toBe("maghrib jamaat");
    expect(before.nextJamaat?.secondsUntil).toBe(30);
    expect(label(stateAt("2026-11-25T16:00:00", days).next)).toBe("isha begins");
  });
});

describe("computePrayerState: incomplete timetables", () => {
  it("on the last day of data shows today fully and nothing after the last event", () => {
    const days = [makeDay("2026-11-24"), makeDay(WEDNESDAY)];
    const afternoon = stateAt("2026-11-25T15:00:00", days);
    expect(afternoon.dataStatus).toBe("ok");
    expect(afternoon.tomorrowRow).toBeNull();
    expect(label(afternoon.next)).toBe("maghrib begins");
    expect(afternoon.tomorrowChanges).toEqual([]);

    const night = stateAt("2026-11-25T21:00:00", days);
    expect(night.current?.key).toBe("isha");
    expect(night.next).toBeNull();
    expect(night.nextJamaat).toBeNull();
    expect(night.nextBegins).toBeNull();
    expect(night.dataStatus).toBe("ok");
  });

  it("does not skip over a missing tomorrow to count down to a later day", () => {
    const days = [makeDay(WEDNESDAY), makeDay(FRIDAY)];
    expect(stateAt("2026-11-25T21:00:00", days).next).toBeNull();
  });

  it("copes with an empty timetable", () => {
    const state = stateAt("2026-11-25T12:00:00", []);
    expect(state.dataStatus).toBe("empty");
    expect(state.todayRow).toBeNull();
    expect(state.tomorrowRow).toBeNull();
    expect(state.rows.map((row) => row.key)).toEqual(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    expect(state.rows.every((row) => row.begins === null && row.jamaat === null)).toBe(true);
    expect(state.rows.every((row) => row.status === "upcoming")).toBe(true);
    expect(state.next).toBeNull();
    expect(state.nextJamaat).toBeNull();
    expect(state.nextBegins).toBeNull();
    expect(state.current).toBeNull();
    expect(state.jamaatInProgress).toBeNull();
    expect(state.tomorrowChanges).toEqual([]);
    expect(state.today).toBe(WEDNESDAY);
    expect(state.hijri.year).toBe(1448);
    expect(state.jumuah).toEqual({ date: FRIDAY, slots: [{ label: "Jumu'ah", time: "13:15" }] });
  });

  it("on a Friday without a row shows the default Jumu'ah but claims no prayer state from it", () => {
    const state = stateAt("2026-11-27T14:00:00", []);
    expect(state.rows[2]).toMatchObject({ name: "Jumu'ah", jamaat: "13:15", status: "upcoming" });
    expect(state.current).toBeNull();
    expect(state.next).toBeNull();
    expect(state.jamaatInProgress).toBeNull();
  });

  it("reports missing-today when the timetable has rows but none usable for today", () => {
    const otherDays = [makeDay(FRIDAY), makeDay(SATURDAY)];
    const noRow = stateAt("2026-11-25T12:00:00", otherDays);
    expect(noRow.dataStatus).toBe("missing-today");
    expect(noRow.todayRow).toBeNull();
    expect(noRow.next).toBeNull();

    const blankRow = makeDay(WEDNESDAY, EMPTY_DAY);
    const blank = stateAt("2026-11-25T12:00:00", [blankRow, makeDay(THURSDAY)]);
    expect(blank.dataStatus).toBe("missing-today");
    expect(blank.todayRow).toBe(blankRow);
    // Tomorrow is present, so there is still something to count down to.
    expect(blank.next).toMatchObject({ key: "fajr", date: THURSDAY });
  });

  it("treats a blank row like a missing one, also on a Friday with default Jumu'ah slots", () => {
    const blankFriday = makeDay(FRIDAY, EMPTY_DAY);
    const blankSaturday = makeDay(SATURDAY, EMPTY_DAY);
    const state = stateAt("2026-11-27T14:00:00", [makeDay(THURSDAY), blankFriday, blankSaturday]);
    expect(state.dataStatus).toBe("missing-today");
    expect(state.todayRow).toBe(blankFriday);
    expect(state.tomorrowRow).toBe(blankSaturday);
    expect(state.rows[2]).toMatchObject({ name: "Jumu'ah", jamaat: "13:15", status: "upcoming" });
    expect(state.current).toBeNull();
    expect(state.next).toBeNull();

    // Thursday evening: a countdown to Friday's default Jumu'ah would skip Fajr.
    const thursdayNight = stateAt("2026-11-26T21:00:00", [makeDay(THURSDAY), blankFriday]);
    expect(thursdayNight.next).toBeNull();
    expect(thursdayNight.jumuah).toEqual({ date: FRIDAY, slots: [{ label: "Jumu'ah", time: "13:15" }] });

    // A row that only carries Jumu'ah times has no prayer times either.
    const onlyJumuah = makeDay(FRIDAY, { ...EMPTY_DAY, jumuah: ["13:00"] });
    const fridayNoon = stateAt("2026-11-27T12:00:00", [onlyJumuah]);
    expect(fridayNoon.dataStatus).toBe("missing-today");
    expect(fridayNoon.rows[2].jamaat).toBe("13:00");
    expect(fridayNoon.next).toBeNull();
  });

  it("when only tomorrow has a row, counts down to tomorrow's first event", () => {
    const state = stateAt("2026-11-25T12:00:00", [makeDay(THURSDAY)]);
    expect(state.dataStatus).toBe("missing-today");
    expect(state.next).toMatchObject({ key: "fajr", kind: "begins", date: THURSDAY, time: "06:02" });
  });

  it("works with a jamaat-only timetable: a prayer is current from its jamaat", () => {
    const jamaatOnly: Partial<PrayerDay> = {
      fajrBegins: null,
      sunrise: null,
      dhuhrBegins: null,
      asrBegins: null,
      maghribBegins: null,
      ishaBegins: null,
    };
    const days = [makeDay(WEDNESDAY, jamaatOnly), makeDay(THURSDAY, jamaatOnly)];

    const morning = stateAt("2026-11-25T09:00:00", days);
    // Without a sunrise time the Fajr window runs until the next known time.
    expect(morning.current).toMatchObject({ key: "fajr", endsAtMs: utc("2026-11-25T12:30:00") });
    expect(label(morning.next)).toBe("dhuhr jamaat");
    expect(morning.nextBegins).toBeNull();
    // A row without any time is only "passed" once a later row has started.
    expect(statuses(morning)).toEqual({
      fajr: "current",
      sunrise: "upcoming",
      dhuhr: "next",
      asr: "upcoming",
      maghrib: "upcoming",
      isha: "upcoming",
    });

    const night = stateAt("2026-11-25T22:00:00", days);
    expect(night.next).toMatchObject({ key: "fajr", kind: "jamaat", date: THURSDAY });
  });

  it("when a prayer is missing, the previous window runs to the next known prayer", () => {
    const days = [makeDay(WEDNESDAY, { asrBegins: null, asrJamaat: null }), makeDay(THURSDAY)];
    const state = stateAt("2026-11-25T15:00:00", days);
    expect(state.current).toMatchObject({ key: "dhuhr", endsAtMs: utc("2026-11-25T16:00:00") });
    expect(statuses(state)).toEqual({
      fajr: "passed",
      sunrise: "passed",
      dhuhr: "current",
      asr: "upcoming",
      maghrib: "next",
      isha: "upcoming",
    });
    // From the instant Maghrib starts, the empty Asr row is behind us.
    expect(statuses(stateAt("2026-11-25T15:59:59", days)).asr).toBe("upcoming");
    expect(statuses(stateAt("2026-11-25T16:00:00", days))).toEqual({
      fajr: "passed",
      sunrise: "passed",
      dhuhr: "passed",
      asr: "passed",
      maghrib: "current",
      isha: "next",
    });
  });

  it("ignores malformed times instead of throwing", () => {
    const days = [
      makeDay(WEDNESDAY, { dhuhrBegins: "noon", dhuhrJamaat: "25:61", jumuah: ["??"] }),
      makeDay(THURSDAY),
    ];
    const state = stateAt("2026-11-25T09:00:00", days);
    expect(state.rows[2]).toMatchObject({ begins: null, jamaat: null, status: "upcoming" });
    expect(label(state.next)).toBe("asr begins");
    expect(statuses(state).asr).toBe("next");
  });

  it("counts down in real chronological order even when a column is out of sequence", () => {
    // An Isha jamaat entered as ten past midnight is read as 00:10 on the row's own date.
    const days = [makeDay(WEDNESDAY, { ishaJamaat: "00:10" }), makeDay(THURSDAY, { ishaJamaat: "00:10" })];
    const afterMidnight = stateAt("2026-11-25T00:05:00", days);
    expect(afterMidnight.next).toMatchObject({ key: "isha", kind: "jamaat", date: WEDNESDAY, secondsUntil: 300 });
    const lateEvening = stateAt("2026-11-25T23:50:00", days);
    expect(lateEvening.next).toMatchObject({ key: "isha", kind: "jamaat", date: THURSDAY, secondsUntil: 1200 });
  });
});

describe("computePrayerState: Friday", () => {
  it("replaces the Dhuhr jamaat with the default Jumu'ah slot", () => {
    const morning = stateAt("2026-11-27T10:00:00");
    expect(morning.isFriday).toBe(true);
    expect(morning.rows[2]).toEqual({
      key: "dhuhr",
      name: "Jumu'ah",
      arabic: JUMUAH_LABEL.arabic,
      begins: "11:53",
      jamaat: "13:15",
      isJumuah: true,
      jumuahTimes: [{ label: "Jumu'ah", time: "13:15" }],
      status: "next",
    });
    expect(morning.next).toMatchObject({
      key: "dhuhr",
      name: "Jumu'ah",
      kind: "begins",
      time: "11:53",
      isJumuah: true,
    });

    // The row's own Dhuhr jamaat (12:30) is not an event on a Friday.
    const afterDhuhrBegins = stateAt("2026-11-27T12:35:00");
    expect(afterDhuhrBegins.current).toMatchObject({ key: "dhuhr", name: "Jumu'ah", isJumuah: true });
    expect(afterDhuhrBegins.next).toEqual({
      key: "dhuhr",
      name: "Jumu'ah",
      arabic: JUMUAH_LABEL.arabic,
      kind: "jamaat",
      time: "13:15",
      date: FRIDAY,
      atMs: utc("2026-11-27T13:15:00"),
      secondsUntil: 40 * 60,
      isJumuah: true,
      label: "Jumu'ah",
    });
    expect(label(stateAt("2026-11-27T13:15:00").next)).toBe("asr begins");
  });

  it("counts down to each of several default Jumu'ah slots in turn", () => {
    const settings = makeSettings({
      jumuah: [
        { label: "1st Jumu'ah", time: "12:45" },
        { label: "2nd Jumu'ah", time: "13:30" },
      ],
    });
    const first = stateAt("2026-11-27T12:00:00", WEEK, settings);
    expect(first.rows[2].jamaat).toBe("12:45");
    expect(first.rows[2].jumuahTimes).toEqual(settings.jumuah);
    expect(first.next).toMatchObject({ kind: "jamaat", time: "12:45", label: "1st Jumu'ah" });

    const second = stateAt("2026-11-27T12:45:00", WEEK, settings);
    expect(second.next).toMatchObject({ kind: "jamaat", time: "13:30", label: "2nd Jumu'ah", secondsUntil: 45 * 60 });
    expect(second.nextJamaat).toEqual(second.next);

    expect(label(stateAt("2026-11-27T13:30:00", WEEK, settings).next)).toBe("asr begins");
  });

  it("uses the Friday row's own Jumu'ah times over the defaults", () => {
    const days = [makeDay(THURSDAY), makeDay(FRIDAY, { jumuah: ["13:40", "12:50"] }), makeDay(SATURDAY)];
    const state = stateAt("2026-11-27T12:00:00", days);
    expect(state.rows[2].jumuahTimes).toEqual([
      { label: "1st Jumu'ah", time: "12:50" },
      { label: "2nd Jumu'ah", time: "13:40" },
    ]);
    expect(state.rows[2].jamaat).toBe("12:50");
    expect(state.next).toMatchObject({ time: "12:50", label: "1st Jumu'ah" });
    expect(stateAt("2026-11-27T13:00:00", days).next).toMatchObject({ time: "13:40", label: "2nd Jumu'ah" });
  });

  it("leaves Dhuhr alone on other days, whatever Jumu'ah times the row carries", () => {
    const days = [makeDay(WEDNESDAY, { jumuah: ["13:40"] }), makeDay(THURSDAY)];
    const state = stateAt("2026-11-25T12:00:00", days);
    expect(state.rows[2]).toMatchObject({ name: "Dhuhr", jamaat: "12:30", isJumuah: false, jumuahTimes: [] });
    expect(state.next).toMatchObject({ key: "dhuhr", kind: "jamaat", time: "12:30", isJumuah: false, label: null });
  });

  it("names tomorrow's events Jumu'ah when tomorrow is a Friday", () => {
    const days = [
      makeDay(THURSDAY, { ...EMPTY_DAY, fajrBegins: "06:03" }),
      makeDay(FRIDAY, { ...EMPTY_DAY, dhuhrBegins: "11:53" }),
    ];
    const state = stateAt("2026-11-26T20:00:00", days);
    expect(state.next).toMatchObject({ key: "dhuhr", name: "Jumu'ah", kind: "begins", date: FRIDAY, isJumuah: true });
    expect(state.nextJamaat).toMatchObject({ name: "Jumu'ah", time: "13:15", date: FRIDAY });
  });
});

describe("computePrayerState: jamaat in progress", () => {
  const dhuhrJamaat = utc("2026-11-25T12:30:00");
  const at = (nowMs: number, settings: SiteSettings = SETTINGS, days: readonly PrayerDay[] = WEEK) =>
    computePrayerState({ days, settings, nowMs }).jamaatInProgress;

  it("starts at the jamaat instant and lasts the configured minutes", () => {
    expect(at(dhuhrJamaat - 1)).toBeNull();
    expect(at(dhuhrJamaat)).toEqual({
      key: "dhuhr",
      name: "Dhuhr",
      arabic: "الظهر",
      isJumuah: false,
      label: null,
      startedAtMs: dhuhrJamaat,
      endsAtMs: dhuhrJamaat + 10 * MINUTE,
      secondsRemaining: 600,
    });
    expect(at(dhuhrJamaat + 4 * MINUTE + 30000)?.secondsRemaining).toBe(330);
    expect(at(dhuhrJamaat + 10 * MINUTE - 1)?.secondsRemaining).toBe(1);
    expect(at(dhuhrJamaat + 10 * MINUTE)).toBeNull();
  });

  it("is not triggered by a prayer merely beginning", () => {
    expect(at(utc("2026-11-25T11:53:00"))).toBeNull();
    expect(at(utc("2026-11-25T11:58:00"))).toBeNull();
  });

  it("follows the configured duration and can be switched off", () => {
    const withMinutes = (minutes: number) =>
      makeSettings({ tv: { ...DEFAULT_SETTINGS.tv, jamaatInProgressMinutes: minutes } });
    expect(at(dhuhrJamaat + 4 * MINUTE, withMinutes(5))?.endsAtMs).toBe(dhuhrJamaat + 5 * MINUTE);
    expect(at(dhuhrJamaat + 5 * MINUTE, withMinutes(5))).toBeNull();
    expect(at(dhuhrJamaat + 20 * MINUTE, withMinutes(25))?.secondsRemaining).toBe(300);
    expect(at(dhuhrJamaat, withMinutes(0))).toBeNull();
    expect(at(dhuhrJamaat, withMinutes(-5))).toBeNull();
    expect(at(dhuhrJamaat, withMinutes(Number.NaN))).toBeNull();
  });

  it("when two windows overlap, reports the congregation that started last", () => {
    const settings = makeSettings({ tv: { ...DEFAULT_SETTINGS.tv, jamaatInProgressMinutes: 240 } });
    expect(at(utc("2026-11-25T16:30:00"), settings)?.key).toBe("maghrib");
    expect(at(utc("2026-11-25T15:00:00"), settings)?.key).toBe("asr");
  });

  it("on a Friday runs after every Jumu'ah slot, and not after the row's Dhuhr jamaat", () => {
    const settings = makeSettings({
      jumuah: [
        { label: "1st Jumu'ah", time: "12:45" },
        { label: "2nd Jumu'ah", time: "13:30" },
      ],
    });
    expect(at(utc("2026-11-27T12:30:00"), settings)).toBeNull();
    expect(at(utc("2026-11-27T12:50:00"), settings)).toMatchObject({
      key: "dhuhr",
      name: "Jumu'ah",
      isJumuah: true,
      label: "1st Jumu'ah",
      secondsRemaining: 300,
    });
    expect(at(utc("2026-11-27T12:55:00"), settings)).toBeNull();
    expect(at(utc("2026-11-27T13:30:00"), settings)).toMatchObject({ label: "2nd Jumu'ah", secondsRemaining: 600 });
    expect(at(utc("2026-11-27T13:40:00"), settings)).toBeNull();
  });

  it("keeps a late congregation on screen across midnight when yesterday's row is available", () => {
    const lateIsha = makeDay(WEDNESDAY, { ishaBegins: "22:30", ishaJamaat: "23:55" });
    const days = [lateIsha, makeDay(THURSDAY)];
    expect(at(utc("2026-11-25T23:58:00"), SETTINGS, days)?.secondsRemaining).toBe(420);
    expect(at(utc("2026-11-26T00:02:00"), SETTINGS, days)).toMatchObject({
      key: "isha",
      startedAtMs: utc("2026-11-25T23:55:00"),
      endsAtMs: utc("2026-11-26T00:05:00"),
      secondsRemaining: 180,
    });
    expect(at(utc("2026-11-26T00:05:00"), SETTINGS, days)).toBeNull();
    // Without yesterday's row there is nothing to go on.
    expect(at(utc("2026-11-26T00:02:00"), SETTINGS, [makeDay(THURSDAY)])).toBeNull();
  });
});

describe("computePrayerState: tomorrow's changes", () => {
  it("lists each jamaat time that differs tomorrow", () => {
    const days = [
      makeDay(WEDNESDAY),
      makeDay(THURSDAY, { asrJamaat: "14:00", maghribJamaat: "16:04", ishaBegins: "17:40" }),
    ];
    expect(stateAt("2026-11-25T09:00:00", days).tomorrowChanges).toEqual([
      { key: "asr", name: "Asr", arabic: "العصر", from: "14:15", to: "14:00" },
      { key: "maghrib", name: "Maghrib", arabic: "المغرب", from: "16:05", to: "16:04" },
    ]);
  });

  it("is empty when nothing changes, and ignores changes to beginning times", () => {
    expect(stateAt("2026-11-25T09:00:00").tomorrowChanges).toEqual([]);
  });

  it("skips a prayer whose jamaat time is missing or malformed on either day", () => {
    const days = [
      makeDay(WEDNESDAY, { fajrJamaat: null, asrJamaat: "2pm" }),
      makeDay(THURSDAY, { asrJamaat: "14:00", ishaJamaat: null, dhuhrJamaat: "12:45" }),
    ];
    expect(stateAt("2026-11-25T09:00:00", days).tomorrowChanges).toEqual([
      { key: "dhuhr", name: "Dhuhr", arabic: "الظهر", from: "12:30", to: "12:45" },
    ]);
  });

  it("ignores Dhuhr on both sides of a Friday, where Jumu'ah replaces it", () => {
    const days = [
      makeDay(THURSDAY, { dhuhrJamaat: "12:30", ishaJamaat: "19:30" }),
      makeDay(FRIDAY, { dhuhrJamaat: "13:15", ishaJamaat: "19:15" }),
      makeDay(SATURDAY, { dhuhrJamaat: "12:30", ishaJamaat: "19:15" }),
    ];
    expect(stateAt("2026-11-26T09:00:00", days).tomorrowChanges).toEqual([
      { key: "isha", name: "Isha", arabic: "العشاء", from: "19:30", to: "19:15" },
    ]);
    expect(stateAt("2026-11-27T09:00:00", days).tomorrowChanges).toEqual([]);
  });

  it("is empty when tomorrow or today has no row", () => {
    expect(stateAt("2026-11-25T09:00:00", [makeDay(WEDNESDAY)]).tomorrowChanges).toEqual([]);
    expect(stateAt("2026-11-25T09:00:00", [makeDay(THURSDAY)]).tomorrowChanges).toEqual([]);
  });
});

describe("computePrayerState: Hijri date", () => {
  // 2026-02-17 is 29 Sha'ban 1447; Ramadan starts on the 18th (Umm al-Qura).
  const days = [
    makeDay("2026-02-17", { maghribBegins: "17:21", maghribJamaat: "17:26" }),
    makeDay("2026-02-18", { maghribBegins: "17:23", maghribJamaat: "17:28" }),
  ];
  const hijriAt = (iso: string, overrides: Partial<SiteSettings> = {}, timetable = days) => {
    const { hijri } = stateAt(iso, timetable, makeSettings(overrides));
    return `${hijri.day} ${hijri.monthName} ${hijri.year}`;
  };

  it("moves to the next Hijri day when Maghrib begins", () => {
    expect(hijriAt("2026-02-17T17:20:59")).toBe("29 Sha'ban 1447");
    expect(hijriAt("2026-02-17T17:21:00")).toBe("1 Ramadan 1447");
    expect(hijriAt("2026-02-17T23:59:59")).toBe("1 Ramadan 1447");
    expect(hijriAt("2026-02-18T00:00:00")).toBe("1 Ramadan 1447");
    expect(hijriAt("2026-02-18T17:23:00")).toBe("2 Ramadan 1447");
  });

  it("changes at midnight when the Maghrib roll is off", () => {
    expect(hijriAt("2026-02-17T20:00:00", { hijriRollAtMaghrib: false })).toBe("29 Sha'ban 1447");
    expect(hijriAt("2026-02-18T00:00:00", { hijriRollAtMaghrib: false })).toBe("1 Ramadan 1447");
  });

  it("applies the moon-sighting adjustment", () => {
    expect(hijriAt("2026-02-18T12:00:00", { hijriAdjustment: -1 })).toBe("29 Sha'ban 1447");
    expect(hijriAt("2026-02-18T12:00:00", { hijriAdjustment: 1 })).toBe("2 Ramadan 1447");
    expect(hijriAt("2026-02-18T18:00:00", { hijriAdjustment: -1 })).toBe("1 Ramadan 1447");
  });

  it("rolls at the Maghrib jamaat for jamaat-only timetables, and at midnight without any Maghrib time", () => {
    const jamaatOnly = [makeDay("2026-02-17", { maghribBegins: null, maghribJamaat: "17:26" })];
    expect(hijriAt("2026-02-17T17:25:00", {}, jamaatOnly)).toBe("29 Sha'ban 1447");
    expect(hijriAt("2026-02-17T17:26:00", {}, jamaatOnly)).toBe("1 Ramadan 1447");
    expect(hijriAt("2026-02-17T22:00:00", {}, [])).toBe("29 Sha'ban 1447");
  });
});

describe("computePrayerState: Jumu'ah to advertise", () => {
  const twoSlots: JumuahSlot[] = [
    { label: "1st Jumu'ah", time: "12:45" },
    { label: "2nd Jumu'ah", time: "13:30" },
  ];
  const settings = makeSettings({ jumuah: twoSlots });

  it("points at the coming Friday with the default slots", () => {
    expect(stateAt("2026-11-25T12:00:00", WEEK, settings).jumuah).toEqual({ date: FRIDAY, slots: twoSlots });
    expect(stateAt("2026-11-26T23:59:00", WEEK, settings).jumuah.date).toBe(FRIDAY);
  });

  it("uses that Friday row's own times when it has them", () => {
    const days = [makeDay(WEDNESDAY), makeDay(FRIDAY, { jumuah: ["13:00"] })];
    expect(stateAt("2026-11-25T12:00:00", days, settings).jumuah).toEqual({
      date: FRIDAY,
      slots: [{ label: "Jumu'ah", time: "13:00" }],
    });
  });

  it("stays on today until the last Jumu'ah has started, then moves to next week", () => {
    expect(stateAt("2026-11-27T08:00:00", WEEK, settings).jumuah).toEqual({ date: FRIDAY, slots: twoSlots });
    // Between the two congregations the second is still to come.
    expect(stateAt("2026-11-27T13:00:00", WEEK, settings).jumuah.date).toBe(FRIDAY);
    expect(stateAt("2026-11-27T13:29:59", WEEK, settings).jumuah.date).toBe(FRIDAY);
    expect(stateAt("2026-11-27T13:30:00", WEEK, settings).jumuah).toEqual({ date: "2026-12-04", slots: twoSlots });
    expect(stateAt("2026-11-28T10:00:00", WEEK, settings).jumuah.date).toBe("2026-12-04");
  });

  it("reads next Friday's row when the timetable reaches that far", () => {
    const days = [...WEEK, makeDay("2026-12-04", { jumuah: ["12:40", "13:20"] })];
    expect(stateAt("2026-11-27T15:00:00", days, settings).jumuah).toEqual({
      date: "2026-12-04",
      slots: [
        { label: "1st Jumu'ah", time: "12:40" },
        { label: "2nd Jumu'ah", time: "13:20" },
      ],
    });
  });

  it("has no slots when none are configured and the Friday row offers no Dhuhr jamaat", () => {
    const state = stateAt("2026-11-25T12:00:00", [makeDay(WEDNESDAY)], makeSettings({ jumuah: [] }));
    expect(state.jumuah).toEqual({ date: FRIDAY, slots: [] });
  });
});

describe("computePrayerState: daylight saving time (Europe/London)", () => {
  const springDays = [
    makeDay("2027-03-27", { fajrBegins: "04:20", fajrJamaat: "05:00", ishaBegins: "19:50", ishaJamaat: "20:15" }),
    makeDay("2027-03-28", { fajrBegins: "05:17", fajrJamaat: "05:45", ishaBegins: "20:52", ishaJamaat: "21:15" }),
    makeDay("2027-03-29", { fajrBegins: "05:14", fajrJamaat: "05:45" }),
  ];
  const autumnDays = [
    makeDay("2026-10-24", { fajrBegins: "06:05", fajrJamaat: "06:30", ishaBegins: "19:20", ishaJamaat: "19:45" }),
    makeDay("2026-10-25", { fajrBegins: "05:07", fajrJamaat: "05:45", ishaBegins: "18:18", ishaJamaat: "19:00" }),
    makeDay("2026-10-26", { fajrBegins: "05:09", fajrJamaat: "05:45" }),
  ];

  it("counts down correctly across the night the clocks go forward (2027-03-28)", () => {
    // 23:00 GMT on Saturday. Fajr on Sunday is 05:17 BST, which is 04:17 GMT:
    // 5 h 17 min away, not the 6 h 17 min that wall-clock subtraction suggests.
    const state = stateAt("2027-03-27T23:00:00", springDays);
    expect(state.nowTime).toBe("23:00");
    expect(state.next).toMatchObject({
      key: "fajr",
      kind: "begins",
      date: "2027-03-28",
      time: "05:17",
      atMs: utc("2027-03-28T04:17:00"),
      secondsUntil: 5 * 3600 + 17 * 60,
    });
    expect(state.nextJamaat?.secondsUntil).toBe(5 * 3600 + 45 * 60);
    // Midnight itself is unaffected: the Isha window still closes at 00:00 GMT.
    expect(state.current).toMatchObject({ key: "isha", endsAtMs: utc("2027-03-28T00:00:00") });
  });

  it("keeps counting smoothly through the missing hour", () => {
    const beforeJump = stateAt("2027-03-28T00:59:59", springDays);
    const afterJump = stateAt("2027-03-28T01:00:00", springDays);
    expect(beforeJump.nowTime).toBe("00:59");
    expect(afterJump.nowTime).toBe("02:00");
    expect(beforeJump.next?.secondsUntil).toBe(3 * 3600 + 17 * 60 + 1);
    expect(afterJump.next?.secondsUntil).toBe(3 * 3600 + 17 * 60);
    expect(afterJump.today).toBe("2027-03-28");
  });

  it("ends the short day at the right instant", () => {
    // Sunday 28 March is 23 hours long: it ends at 23:00 UTC.
    const state = stateAt("2027-03-28T22:30:00", springDays);
    expect(state.nowTime).toBe("23:30");
    expect(state.current).toMatchObject({ key: "isha", endsAtMs: utc("2027-03-28T23:00:00") });
    expect(state.next).toMatchObject({ date: "2027-03-29", atMs: utc("2027-03-29T04:14:00") });
    expect(stateAt("2027-03-28T23:00:00", springDays).today).toBe("2027-03-29");
  });

  it("counts down correctly across the night the clocks go back (2026-10-25)", () => {
    // 23:00 BST on Saturday is 22:00 UTC. Fajr on Sunday is 05:07 GMT:
    // 7 h 7 min away, not the 6 h 7 min that wall-clock subtraction suggests.
    const state = stateAt("2026-10-24T22:00:00", autumnDays);
    expect(state.nowTime).toBe("23:00");
    expect(state.today).toBe("2026-10-24");
    expect(state.next).toMatchObject({
      key: "fajr",
      date: "2026-10-25",
      time: "05:07",
      atMs: utc("2026-10-25T05:07:00"),
      secondsUntil: 7 * 3600 + 7 * 60,
    });
    expect(state.current).toMatchObject({ key: "isha", endsAtMs: utc("2026-10-24T23:00:00") });
  });

  it("tells the two passes through the repeated hour apart", () => {
    const firstPass = stateAt("2026-10-25T00:30:00", autumnDays);
    const secondPass = stateAt("2026-10-25T01:30:00", autumnDays);
    expect(firstPass.nowTime).toBe("01:30");
    expect(secondPass.nowTime).toBe("01:30");
    expect(firstPass.next?.secondsUntil).toBe(4 * 3600 + 37 * 60);
    expect(secondPass.next?.secondsUntil).toBe(3 * 3600 + 37 * 60);
  });

  it("does not fire an event twice when its wall time repeats", () => {
    // A congregation at 01:30 on the night the clocks go back happens at the first 01:30.
    const days = [
      makeDay("2026-10-25", { ...EMPTY_DAY, ishaJamaat: "01:30", fajrBegins: "05:07" }),
      makeDay("2026-10-26"),
    ];
    const first = utc("2026-10-25T00:30:00");
    const at = (nowMs: number) => computePrayerState({ days, settings: SETTINGS, nowMs });
    expect(at(first - 60000).next).toMatchObject({ key: "isha", kind: "jamaat", secondsUntil: 60 });
    expect(at(first).jamaatInProgress).toMatchObject({ key: "isha", startedAtMs: first });
    expect(at(first + 10 * MINUTE).jamaatInProgress).toBeNull();
    // One hour later the clocks read 01:30 again; nothing restarts.
    const second = at(first + HOUR);
    expect(second.nowTime).toBe("01:30");
    expect(second.jamaatInProgress).toBeNull();
    expect(label(second.next)).toBe("fajr begins");
  });

  it("ends the long day at the right instant", () => {
    // Sunday 25 October is 25 hours long: it started at 23:00 UTC on Saturday.
    const state = stateAt("2026-10-25T23:30:00", autumnDays);
    expect(state.today).toBe("2026-10-25");
    expect(state.current).toMatchObject({ key: "isha", endsAtMs: utc("2026-10-26T00:00:00") });
    expect(state.next).toMatchObject({ date: "2026-10-26", secondsUntil: 5 * 3600 + 39 * 60 });
  });

  it("handles other zones' transitions too (America/New_York, Australia/Sydney)", () => {
    const newYork = makeSettings({ timezone: "America/New_York" });
    const usDays = [makeDay("2026-03-07"), makeDay("2026-03-08", { fajrBegins: "06:02" })];
    // 23:00 EST on 7 March is 04:00 UTC on the 8th; Fajr at 06:02 EDT is 10:02 UTC.
    const us = stateAt("2026-03-08T04:00:00", usDays, newYork);
    expect(us.nowTime).toBe("23:00");
    expect(us.next).toMatchObject({ atMs: utc("2026-03-08T10:02:00"), secondsUntil: 6 * 3600 + 2 * 60 });

    const sydney = makeSettings({ timezone: "Australia/Sydney" });
    const auDays = [makeDay("2026-04-04"), makeDay("2026-04-05", { fajrBegins: "05:02" })];
    // 23:00 AEDT on 4 April is 12:00 UTC; Fajr at 05:02 AEST on the 5th is 19:02 UTC on the 4th.
    const au = stateAt("2026-04-04T12:00:00", auDays, sydney);
    expect(au.nowTime).toBe("23:00");
    expect(au.next).toMatchObject({ atMs: utc("2026-04-04T19:02:00"), secondsUntil: 7 * 3600 + 2 * 60 });
  });
});

describe("computePrayerState: invariants", () => {
  const sampleDays: [string, readonly PrayerDay[], string][] = [
    ["an ordinary day", WEEK, WEDNESDAY],
    ["a Friday", WEEK, FRIDAY],
    [
      "the day the clocks go forward",
      [makeDay("2027-03-27"), makeDay("2027-03-28", { fajrBegins: "05:17" }), makeDay("2027-03-29")],
      "2027-03-28",
    ],
    [
      "the day the clocks go back",
      [makeDay("2026-10-24"), makeDay("2026-10-25", { fajrBegins: "05:07" }), makeDay("2026-10-26")],
      "2026-10-25",
    ],
  ];

  it.each(sampleDays)("for every minute of %s the countdown ticks down steadily", (_name, days, date) => {
    const start = zonedDateTimeToEpochMs(date, "00:00", "Europe/London");
    const end = start + 26 * HOUR;
    let previous: PrayerState | null = null;
    let eventChanges = 0;
    for (let nowMs = start; nowMs < end; nowMs += MINUTE) {
      const state = computePrayerState({ days, settings: SETTINGS, nowMs });
      const next = state.next;
      if (state.today !== date) break;
      if (next === null) throw new Error(`no next event at ${new Date(nowMs).toISOString()}`);
      if (next.secondsUntil <= 0) throw new Error(`non-positive countdown at ${new Date(nowMs).toISOString()}`);
      expect(next.atMs - nowMs).toBe(next.secondsUntil * 1000);
      if (previous !== null && previous.next !== null) {
        if (previous.next.atMs === next.atMs) {
          expect(previous.next.secondsUntil - next.secondsUntil).toBe(60);
        } else {
          // The old event must have happened, and the new one must be later.
          expect(previous.next.atMs).toBeLessThanOrEqual(nowMs);
          expect(next.atMs).toBeGreaterThan(previous.next.atMs);
          eventChanges++;
        }
      }
      previous = state;
    }
    // Each of the day's ten events (five begins, five jamaat) hands over to
    // the one after it, the last of them to tomorrow's Fajr.
    expect(eventChanges).toBe(10);
  });

  it.each(sampleDays)("for every minute of %s the row statuses are coherent", (_name, days, date) => {
    const start = zonedDateTimeToEpochMs(date, "00:00", "Europe/London");
    for (let nowMs = start; nowMs < start + 26 * HOUR; nowMs += MINUTE) {
      const state = computePrayerState({ days, settings: SETTINGS, nowMs });
      if (state.today !== date) break;
      const rowStatuses = state.rows.map((row) => row.status);
      const currentRows = state.rows.filter((row) => row.status === "current");
      const nextRows = state.rows.filter((row) => row.status === "next");
      expect(currentRows.map((row) => row.key)).toEqual(state.current ? [state.current.key] : []);
      expect(nextRows.length).toBeLessThanOrEqual(1);
      expect(nextRows.every((row) => row.key !== "sunrise")).toBe(true);
      // Time only moves forward: nothing that has passed may follow something still to come.
      const firstAhead = rowStatuses.findIndex((status) => status === "next" || status === "upcoming");
      const lastBehind = rowStatuses.lastIndexOf("passed");
      if (firstAhead !== -1) expect(lastBehind).toBeLessThan(firstAhead);
      if (state.current) {
        expect(state.current.startedAtMs).toBeLessThanOrEqual(nowMs);
        expect(state.current.endsAtMs).toBeGreaterThan(nowMs);
      }
      if (state.nextBegins && nextRows.length === 1 && state.nextBegins.date === date) {
        expect(nextRows[0].key).toBe(state.nextBegins.key);
      }
    }
  });

  it("is pure: it does not modify its input and repeats its answer", () => {
    const days = deepFreeze(WEEK.map((day) => ({ ...day, jumuah: [...day.jumuah] })));
    const settings = deepFreeze(
      makeSettings({
        jumuah: [
          { label: "2nd Jumu'ah", time: "13:30" },
          { label: "1st Jumu'ah", time: "12:45" },
        ],
        tv: { ...DEFAULT_SETTINGS.tv },
      }),
    );
    const nowMs = utc("2026-11-27T12:50:00");
    const first = computePrayerState({ days, settings, nowMs });
    const second = computePrayerState({ days, settings, nowMs });
    expect(second).toEqual(first);
    expect(first.rows[2].jumuahTimes.map((slot) => slot.time)).toEqual(["12:45", "13:30"]);
    expect(settings.jumuah.map((slot) => slot.time)).toEqual(["13:30", "12:45"]);
  });

  it("gives each caller its own row objects", () => {
    const first = stateAt("2026-11-27T12:00:00");
    first.rows[2].jumuahTimes[0].time = "00:00";
    expect(stateAt("2026-11-27T12:00:00").rows[2].jumuahTimes[0].time).toBe("13:15");
    expect(DEFAULT_SETTINGS.jumuah[0].time).toBe("13:15");
  });
});
