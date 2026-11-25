import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createAnnouncement,
  defaultSettings,
  saveSettings,
  upsertPrayerDays,
  type PrayerDayInput,
} from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { addDays, listDates } from "@/lib/time";
import {
  DEFAULT_SETTINGS,
  DISPLAY_WINDOW_DAYS_AHEAD,
  DISPLAY_WINDOW_DAYS_BEHIND,
} from "@/lib/types";
import {
  DEV_VERSION,
  buildDisplayPayload,
  buildVersion,
  displayWindow,
  mosqueToday,
} from "./display";

let database: TestDatabase;
const savedBuildId = process.env.NEXT_PUBLIC_BUILD_ID;
const savedZone = process.env.MOSQUE_TIMEZONE;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  delete process.env.NEXT_PUBLIC_BUILD_ID;
  delete process.env.MOSQUE_TIMEZONE;
  await database.client.batch(
    ["DELETE FROM prayer_days", "DELETE FROM settings", "DELETE FROM announcements"],
    "write",
  );
});

afterEach(() => {
  if (savedBuildId === undefined) delete process.env.NEXT_PUBLIC_BUILD_ID;
  else process.env.NEXT_PUBLIC_BUILD_ID = savedBuildId;
  if (savedZone === undefined) delete process.env.MOSQUE_TIMEZONE;
  else process.env.MOSQUE_TIMEZONE = savedZone;
});

/** A row with one time, enough to count as a timetable day. */
function day(date: string): PrayerDayInput {
  return { date, fajrBegins: "05:30" };
}

describe("mosqueToday", () => {
  it("is the calendar date on the mosque's wall clock, not the server's", () => {
    // 23:30 UTC on 30 June is already 1 July in Karachi and still 30 June in Toronto.
    const instant = Date.UTC(2026, 5, 30, 23, 30);
    expect(mosqueToday("UTC", instant)).toBe("2026-06-30");
    expect(mosqueToday("Asia/Karachi", instant)).toBe("2026-07-01");
    expect(mosqueToday("America/Toronto", instant)).toBe("2026-06-30");
  });

  it("falls back to UTC for a zone the server does not know", () => {
    expect(mosqueToday("Mars/Olympus", Date.UTC(2026, 5, 30, 23, 30))).toBe("2026-06-30");
  });
});

describe("displayWindow", () => {
  it("runs from yesterday to five weeks ahead", () => {
    const window = displayWindow("Europe/London", Date.UTC(2026, 10, 25, 12));
    expect(window).toEqual({ today: "2026-11-25", from: "2026-11-24", to: "2026-12-30" });
    expect(listDates(window.from, window.to)).toHaveLength(
      DISPLAY_WINDOW_DAYS_BEHIND + 1 + DISPLAY_WINDOW_DAYS_AHEAD,
    );
  });

  it("keeps whole calendar days when the clocks go back inside the window", () => {
    // Europe/London leaves summer time on 25 October 2026, a 25-hour day.
    const window = displayWindow("Europe/London", Date.UTC(2026, 9, 24, 22, 30));
    expect(window).toEqual({ today: "2026-10-24", from: "2026-10-23", to: "2026-11-28" });
  });

  it("changes day at local midnight on the night the clocks go back", () => {
    // Local midnight on 25 October is 23:00 UTC on the 24th (still BST, UTC+1).
    expect(displayWindow("Europe/London", Date.UTC(2026, 9, 24, 22, 59, 59)).today).toBe(
      "2026-10-24",
    );
    expect(displayWindow("Europe/London", Date.UTC(2026, 9, 24, 23, 0, 0)).today).toBe(
      "2026-10-25",
    );
    // The repeated hour (01:00 to 02:00 local) belongs to the 25th both times.
    expect(displayWindow("Europe/London", Date.UTC(2026, 9, 25, 0, 30)).today).toBe("2026-10-25");
    expect(displayWindow("Europe/London", Date.UTC(2026, 9, 25, 1, 30)).today).toBe("2026-10-25");
    // After the change local midnight is 00:00 UTC again.
    expect(displayWindow("Europe/London", Date.UTC(2026, 9, 25, 23, 30)).today).toBe("2026-10-25");
    expect(displayWindow("Europe/London", Date.UTC(2026, 9, 26, 0, 0)).today).toBe("2026-10-26");
  });

  it("keeps whole calendar days when the clocks go forward inside the window", () => {
    // Europe/London enters summer time on 29 March 2026, a 23-hour day.
    const window = displayWindow("Europe/London", Date.UTC(2026, 2, 28, 23, 59));
    expect(window.today).toBe("2026-03-28");
    expect(window.from).toBe("2026-03-27");
    expect(window.to).toBe(addDays("2026-03-28", DISPLAY_WINDOW_DAYS_AHEAD));
    expect(displayWindow("Europe/London", Date.UTC(2026, 2, 29, 23, 0)).today).toBe("2026-03-30");
  });

  it("crosses a year boundary", () => {
    const window = displayWindow("Asia/Karachi", Date.UTC(2026, 11, 31, 19, 0));
    expect(window).toEqual({ today: "2027-01-01", from: "2026-12-31", to: "2027-02-05" });
  });
});

describe("buildVersion", () => {
  it("reports the build id, or dev when there is none", () => {
    expect(buildVersion()).toBe(DEV_VERSION);
    process.env.NEXT_PUBLIC_BUILD_ID = "abc123";
    expect(buildVersion()).toBe("abc123");
    process.env.NEXT_PUBLIC_BUILD_ID = "";
    expect(buildVersion()).toBe("dev");
  });
});

describe("buildDisplayPayload", () => {
  const NOON = Date.UTC(2026, 10, 25, 12);

  it("returns defaults and empty lists on an empty database", async () => {
    expect(await buildDisplayPayload(NOON)).toEqual({
      version: "dev",
      serverNow: NOON,
      settings: DEFAULT_SETTINGS,
      days: [],
      announcements: [],
      coverage: { firstDate: null, lastDate: null, totalDays: 0 },
    });
  });

  it("uses MOSQUE_TIMEZONE on an empty database to decide what today is", async () => {
    process.env.MOSQUE_TIMEZONE = "Pacific/Auckland";
    await upsertPrayerDays([day("2026-11-25"), day("2026-11-26"), day("2026-11-27")]);

    // Noon UTC on the 25th is already the 26th in Auckland: the window starts on the 25th.
    const payload = await buildDisplayPayload(NOON);

    expect(payload.settings.timezone).toBe("Pacific/Auckland");
    expect(payload.days.map((item) => item.date)).toEqual([
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
    ]);
  });

  it("includes exactly the days of the window, in order", async () => {
    await upsertPrayerDays(listDates("2026-11-01", "2027-01-31").map(day));

    const payload = await buildDisplayPayload(NOON);

    expect(payload.days.map((item) => item.date)).toEqual(listDates("2026-11-24", "2026-12-30"));
    expect(payload.coverage).toEqual({
      firstDate: "2026-11-01",
      lastDate: "2027-01-31",
      totalDays: 92,
    });
    expect(payload.serverNow).toBe(NOON);
  });

  it("covers a window that contains a clock change without losing or repeating a day", async () => {
    await saveSettings({ timezone: "Europe/London" });
    await upsertPrayerDays(listDates("2026-10-01", "2026-12-15").map(day));

    // 00:30 local on 25 October 2026, half an hour into the 25-hour day.
    const payload = await buildDisplayPayload(Date.UTC(2026, 9, 24, 23, 30));

    const dates = payload.days.map((item) => item.date);
    expect(dates).toEqual(listDates("2026-10-24", "2026-11-29"));
    expect(new Set(dates).size).toBe(DISPLAY_WINDOW_DAYS_BEHIND + 1 + DISPLAY_WINDOW_DAYS_AHEAD);
  });

  it("follows the stored timezone, so the same instant gives different windows", async () => {
    await upsertPrayerDays(listDates("2026-06-25", "2026-08-10").map(day));
    const lateEvening = Date.UTC(2026, 5, 30, 23, 30);

    await saveSettings({ timezone: "Asia/Karachi" });
    expect((await buildDisplayPayload(lateEvening)).days[0].date).toBe("2026-06-30");

    await saveSettings({ timezone: "America/Toronto" });
    expect((await buildDisplayPayload(lateEvening)).days[0].date).toBe("2026-06-29");
  });

  it("leaves gaps in the timetable as gaps", async () => {
    await upsertPrayerDays([day("2026-11-24"), day("2026-11-26"), day("2026-12-30")]);
    const payload = await buildDisplayPayload(NOON);
    expect(payload.days.map((item) => item.date)).toEqual([
      "2026-11-24",
      "2026-11-26",
      "2026-12-30",
    ]);
  });

  it("includes announcements that touch the window and no drafts", async () => {
    await createAnnouncement({ title: "Open ended" });
    await createAnnouncement({ title: "Ended yesterday", endsOn: "2026-11-24" });
    await createAnnouncement({ title: "Starts on the last day", startsOn: "2026-12-30" });
    await createAnnouncement({ title: "TV only", showOnSite: false });
    await createAnnouncement({ title: "Pinned", pinned: true });
    await createAnnouncement({ title: "Long gone", endsOn: "2026-11-23" });
    await createAnnouncement({ title: "Too far ahead", startsOn: "2026-12-31" });
    await createAnnouncement({ title: "Draft", showOnSite: false, showOnTv: false });

    const payload = await buildDisplayPayload(NOON);

    expect(payload.announcements[0].title).toBe("Pinned");
    expect(payload.announcements.map((item) => item.title).sort()).toEqual([
      "Ended yesterday",
      "Open ended",
      "Pinned",
      "Starts on the last day",
      "TV only",
    ]);
  });

  it("uses settings the caller already loaded instead of reading them again", async () => {
    await saveSettings({ mosqueName: "Stored name" });
    const given = { ...defaultSettings({}), mosqueName: "Given name", timezone: "Asia/Karachi" };

    const payload = await buildDisplayPayload(Date.UTC(2026, 5, 30, 23, 30), given);

    expect(payload.settings).toBe(given);
    await upsertPrayerDays([day("2026-06-30")]);
    expect((await buildDisplayPayload(Date.UTC(2026, 5, 30, 23, 30), given)).days).toHaveLength(1);
  });

  it("carries the build id", async () => {
    process.env.NEXT_PUBLIC_BUILD_ID = "build-42";
    expect((await buildDisplayPayload(NOON)).version).toBe("build-42");
  });
});
