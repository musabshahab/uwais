import { describe, expect, it } from "vitest";
import { computePrayerState, type PrayerEvent, type PrayerState } from "@/lib/time";
import type { Announcement, DisplayPayload } from "@/lib/types";
import {
  activeAnnouncements,
  describeCountdown,
  describeEvent,
  describeLastUpdated,
  liveTimetable,
  payloadDate,
  scheduleFromSignature,
  scheduleSignature,
  staticTimetable,
  toSchedule,
} from "./prayer-view";
import { SAMPLE_NOW_MS, makeDay, makePayload } from "./testing";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Midnight (UTC, which is London time in November) at the start of Wednesday 25 November 2026. */
const WEDNESDAY = Date.UTC(2026, 10, 25);
/** Midnight at the start of Friday 27 November 2026. */
const FRIDAY = Date.UTC(2026, 10, 27);

function stateAt(nowMs: number, payload: DisplayPayload = makePayload()): PrayerState {
  return computePrayerState({ days: payload.days, settings: payload.settings, nowMs });
}

function signatureAt(nowMs: number, payload?: DisplayPayload): string {
  return scheduleSignature(toSchedule(stateAt(nowMs, payload)));
}

function must(event: PrayerEvent | null): PrayerEvent {
  if (event === null) throw new Error("expected an event");
  return event;
}

function announcement(id: number, overrides: Partial<Announcement> = {}): Announcement {
  return {
    id,
    title: `Announcement ${id}`,
    body: "",
    startsOn: null,
    endsOn: null,
    showOnSite: true,
    showOnTv: true,
    pinned: false,
    createdAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("toSchedule", () => {
  it("leaves out everything that changes every second", () => {
    const schedule = toSchedule(stateAt(SAMPLE_NOW_MS));

    expect(schedule).not.toHaveProperty("nowMs");
    expect(schedule).not.toHaveProperty("clock");
    expect(schedule).not.toHaveProperty("nowTime");
    expect(schedule.next).not.toHaveProperty("secondsUntil");
    expect(schedule.nextJamaat).not.toHaveProperty("secondsUntil");
    expect(schedule.nextBegins).not.toHaveProperty("secondsUntil");
  });

  it("keeps what the screens lay out from", () => {
    const state = stateAt(SAMPLE_NOW_MS);
    const schedule = toSchedule(state);

    expect(schedule.today).toBe("2026-11-25");
    expect(schedule.rows).toBe(state.rows);
    expect(schedule.current).toBe(state.current);
    expect(schedule.hijri).toBe(state.hijri);
    expect(schedule.next).toEqual({
      key: "dhuhr",
      name: "Dhuhr",
      arabic: state.next?.arabic,
      kind: "jamaat",
      time: "12:30",
      date: "2026-11-25",
      atMs: WEDNESDAY + 12 * HOUR + 30 * MINUTE,
      isJumuah: false,
      label: null,
    });
    expect(schedule.nextBegins?.time).toBe("14:05");
  });

  it("is the same for every second of a quiet stretch", () => {
    const start = WEDNESDAY + 13 * HOUR;
    const first = signatureAt(start);
    for (let second = 1; second <= 120; second += 1) {
      expect(signatureAt(start + second * SECOND)).toBe(first);
    }
  });

  it("changes at the second a congregation starts and at the second its screen ends", () => {
    const jamaat = WEDNESDAY + 12 * HOUR + 30 * MINUTE;
    expect(signatureAt(jamaat - SECOND)).not.toBe(signatureAt(jamaat));

    const during = toSchedule(stateAt(jamaat + 90 * SECOND));
    expect(during.jamaatInProgress).toEqual({
      key: "dhuhr",
      name: "Dhuhr",
      arabic: during.jamaatInProgress?.arabic,
      isJumuah: false,
      label: null,
      startedAtMs: jamaat,
      endsAtMs: jamaat + 10 * MINUTE,
    });
    expect(signatureAt(jamaat + SECOND)).toBe(signatureAt(jamaat + 90 * SECOND));

    const end = jamaat + 10 * MINUTE;
    expect(signatureAt(end - SECOND)).not.toBe(signatureAt(end));
  });

  it("changes when a prayer time begins", () => {
    const asr = WEDNESDAY + 14 * HOUR + 5 * MINUTE;
    expect(signatureAt(asr - SECOND)).not.toBe(signatureAt(asr));
  });

  it("changes at midnight in the mosque's timezone, not the viewer's", () => {
    const midnight = WEDNESDAY + 24 * HOUR;
    expect(signatureAt(midnight - SECOND)).not.toBe(signatureAt(midnight));

    // Karachi is five hours ahead: its day turns at 19:00 UTC.
    const karachi = makePayload();
    karachi.settings.timezone = "Asia/Karachi";
    const karachiMidnight = WEDNESDAY + 19 * HOUR;
    expect(toSchedule(stateAt(karachiMidnight - SECOND, karachi)).today).toBe("2026-11-25");
    expect(toSchedule(stateAt(karachiMidnight, karachi)).today).toBe("2026-11-26");
  });

  it("changes when the timetable is edited", () => {
    const edited = makePayload({
      days: [makeDay("2026-11-24"), makeDay("2026-11-25", { ishaJamaat: "19:45" }), makeDay("2026-11-26")],
    });
    const original = makePayload({
      days: [makeDay("2026-11-24"), makeDay("2026-11-25"), makeDay("2026-11-26")],
    });
    expect(signatureAt(SAMPLE_NOW_MS, edited)).not.toBe(signatureAt(SAMPLE_NOW_MS, original));
  });
});

describe("scheduleSignature and scheduleFromSignature", () => {
  it("round-trip a schedule without loss", () => {
    for (const nowMs of [SAMPLE_NOW_MS, WEDNESDAY + 12 * HOUR + 31 * MINUTE, FRIDAY + 11 * HOUR]) {
      const schedule = toSchedule(stateAt(nowMs));
      expect(scheduleFromSignature(scheduleSignature(schedule))).toEqual(schedule);
    }
  });

  it("round-trip the schedule of an empty timetable", () => {
    const schedule = toSchedule(stateAt(SAMPLE_NOW_MS, makePayload({ days: [] })));
    expect(schedule.dataStatus).toBe("empty");
    expect(schedule.next).toBeNull();
    expect(scheduleFromSignature(scheduleSignature(schedule))).toEqual(schedule);
  });
});

describe("payloadDate", () => {
  it("is the mosque's date at the moment the payload was produced", () => {
    const lateEvening = Date.UTC(2026, 10, 25, 23, 30);
    expect(payloadDate(makePayload({ serverNow: lateEvening }))).toBe("2026-11-25");

    const karachi = makePayload({ serverNow: lateEvening });
    karachi.settings.timezone = "Asia/Karachi";
    expect(payloadDate(karachi)).toBe("2026-11-26");
  });

  it("follows daylight saving time", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London.
    expect(payloadDate(makePayload({ serverNow: Date.UTC(2026, 5, 30, 23, 30) }))).toBe("2026-07-01");
  });
});

describe("staticTimetable", () => {
  it("lists the rows of the payload's day without statuses", () => {
    const view = staticTimetable(makePayload());

    expect(view.date).toBe("2026-11-25");
    expect(view.live).toBe(false);
    expect(view.rows.map((row) => row.key)).toEqual(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    expect(view.rows.every((row) => row.status === null)).toBe(true);
    expect(view.rows[3]).toMatchObject({ name: "Asr", begins: "14:05", jamaat: "14:30", isJumuah: false });
  });

  it("presents Dhuhr as Jumu'ah on a Friday", () => {
    const view = staticTimetable(makePayload({ serverNow: FRIDAY + 9 * HOUR }));
    expect(view.date).toBe("2026-11-27");
    expect(view.rows[2]).toMatchObject({ key: "dhuhr", name: "Jumu'ah", isJumuah: true, jamaat: "13:15" });
  });

  it("still lists the rows, with empty times, when the timetable has no row for the day", () => {
    const view = staticTimetable(makePayload({ days: [] }));
    expect(view.rows).toHaveLength(6);
    expect(view.rows.every((row) => row.begins === null && row.jamaat === null)).toBe(true);
  });
});

describe("liveTimetable", () => {
  it("is today's rows with their statuses", () => {
    const schedule = toSchedule(stateAt(SAMPLE_NOW_MS));
    const view = liveTimetable(schedule);

    expect(view).toEqual({ date: "2026-11-25", rows: schedule.rows, live: true });
    expect(view.rows).toBe(schedule.rows);
    expect(view.rows.map((row) => row.status)).toEqual([
      "passed",
      "passed",
      "current",
      "next",
      "upcoming",
      "upcoming",
    ]);
  });
});

describe("describeEvent", () => {
  it("names a congregation and the start of a prayer time", () => {
    const state = stateAt(SAMPLE_NOW_MS);
    expect(describeEvent(must(state.nextJamaat))).toBe("Dhuhr jamaat");
    expect(describeEvent(must(state.nextBegins))).toBe("Asr begins");
  });

  it("says Dhuhr, not Jumu'ah, for the start of the prayer time on a Friday", () => {
    const state = stateAt(FRIDAY + 11 * HOUR);
    const begins = must(state.nextBegins);
    expect(begins.isJumuah).toBe(true);
    expect(describeEvent(begins)).toBe("Dhuhr begins");
  });

  it("names a Jumu'ah congregation by its slot", () => {
    const single = stateAt(FRIDAY + 11 * HOUR);
    expect(describeEvent(must(single.nextJamaat))).toBe("Jumu'ah");

    const twoSlots = makePayload();
    twoSlots.settings.jumuah = [
      { label: "1st Jumu'ah", time: "12:30" },
      { label: "2nd Jumu'ah", time: "13:30" },
    ];
    expect(describeEvent(must(stateAt(FRIDAY + 12 * HOUR, twoSlots).nextJamaat))).toBe("1st Jumu'ah");
    expect(describeEvent(must(stateAt(FRIDAY + 13 * HOUR, twoSlots).nextJamaat))).toBe("2nd Jumu'ah");
  });

  it("falls back to the prayer's name for a Jumu'ah without a label", () => {
    const event = { ...must(stateAt(FRIDAY + 11 * HOUR).nextJamaat), label: null };
    expect(describeEvent(event)).toBe("Jumu'ah");
  });
});

describe("describeCountdown", () => {
  it("reads as a sentence fragment at every distance", () => {
    expect(describeCountdown(must(stateAt(SAMPLE_NOW_MS).next))).toBe("Dhuhr jamaat in 30 min");
    expect(describeCountdown(must(stateAt(SAMPLE_NOW_MS).nextBegins))).toBe("Asr begins in 2 hr 5 min");
    expect(describeCountdown(must(stateAt(SAMPLE_NOW_MS + 29 * MINUTE + 30 * SECOND).next))).toBe(
      "Dhuhr jamaat in less than a minute",
    );
  });

  it("counts down to tomorrow's Fajr after the last event of the day", () => {
    const lateEvening = WEDNESDAY + 22 * HOUR;
    expect(describeCountdown(must(stateAt(lateEvening).next))).toBe("Fajr begins in 7 hr 40 min");
  });
});

describe("describeLastUpdated", () => {
  const london12h = { timezone: "Europe/London", timeFormat: "12h" } as const;

  it("gives only the time for data from today", () => {
    expect(describeLastUpdated(WEDNESDAY + 14 * HOUR + 5 * MINUTE, "2026-11-25", london12h)).toBe("2:05 PM");
  });

  it("includes the date for data from another day", () => {
    expect(describeLastUpdated(WEDNESDAY - 10 * HOUR + 5 * MINUTE, "2026-11-25", london12h)).toBe(
      "Tue 24 Nov, 2:05 PM",
    );
  });

  it("includes the date while today is not known yet", () => {
    expect(describeLastUpdated(WEDNESDAY + 14 * HOUR + 5 * MINUTE, null, london12h)).toBe(
      "Wed 25 Nov, 2:05 PM",
    );
  });

  it("uses the mosque's timezone and time format, not the viewer's", () => {
    const karachi24h = { timezone: "Asia/Karachi", timeFormat: "24h" } as const;
    expect(describeLastUpdated(WEDNESDAY + 14 * HOUR + 5 * MINUTE, "2026-11-25", karachi24h)).toBe("19:05");
    expect(describeLastUpdated(WEDNESDAY + 20 * HOUR, "2026-11-25", karachi24h)).toBe("Thu 26 Nov, 01:00");
  });
});

describe("activeAnnouncements", () => {
  const today = "2026-11-25";

  it("keeps the announcements flagged for the screen, in the order given", () => {
    const list = [
      announcement(1, { pinned: true }),
      announcement(2, { showOnTv: false }),
      announcement(3, { showOnSite: false }),
      announcement(4),
    ];
    expect(activeAnnouncements(list, today, "site").map((item) => item.id)).toEqual([1, 2, 4]);
    expect(activeAnnouncements(list, today, "tv").map((item) => item.id)).toEqual([1, 3, 4]);
  });

  it("includes the first and the last day of a date range", () => {
    const list = [
      announcement(1, { startsOn: "2026-11-25" }),
      announcement(2, { endsOn: "2026-11-25" }),
      announcement(3, { startsOn: "2026-11-20", endsOn: "2026-11-30" }),
    ];
    expect(activeAnnouncements(list, today, "site").map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("leaves out announcements that have not started or have ended", () => {
    const list = [
      announcement(1, { startsOn: "2026-11-26" }),
      announcement(2, { endsOn: "2026-11-24" }),
      announcement(3, { startsOn: "2026-12-01", endsOn: "2026-12-05" }),
    ];
    expect(activeAnnouncements(list, today, "tv")).toEqual([]);
  });

  it("brings an announcement in when its first day arrives", () => {
    const list = [announcement(1, { startsOn: "2026-11-26", endsOn: "2026-11-26" })];
    expect(activeAnnouncements(list, "2026-11-25", "site")).toHaveLength(0);
    expect(activeAnnouncements(list, "2026-11-26", "site")).toHaveLength(1);
    expect(activeAnnouncements(list, "2026-11-27", "site")).toHaveLength(0);
  });

  it("returns a new list and leaves the given one alone", () => {
    const list = [announcement(1), announcement(2, { showOnSite: false })];
    const result = activeAnnouncements(list, today, "site");
    expect(result).not.toBe(list);
    expect(list).toHaveLength(2);
  });
});
