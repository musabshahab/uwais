import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addImportLog,
  createAnnouncement,
  saveSettings,
  upsertPrayerDays,
  type PrayerDayInput,
} from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { listDates } from "@/lib/time";
import { DEFAULT_SETTINGS } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async (): Promise<void> => undefined),
  requireAdmin: vi.fn(async (): Promise<void> => undefined),
}));

// `connection()` throws outside a Next.js request; the tests stand in for the framework.
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));

import {
  ADMIN_LOOKAHEAD_DAYS,
  loadAdminAnnouncements,
  loadAdminOverview,
  loadDisplayPayload,
  loadImportHistory,
  loadMonth,
  loadSettings,
  loadTimetableRange,
} from "./data";

let database: TestDatabase;
const NOON = Date.UTC(2026, 10, 25, 12);

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
  mocks.connection.mockReset().mockResolvedValue(undefined);
  mocks.requireAdmin.mockReset().mockResolvedValue(undefined);
  await database.client.batch(
    [
      "DELETE FROM prayer_days",
      "DELETE FROM settings",
      "DELETE FROM announcements",
      "DELETE FROM import_log",
    ],
    "write",
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A row with one time, enough to count as a timetable day. */
function day(date: string): PrayerDayInput {
  return { date, dhuhrJamaat: "13:00" };
}

describe("request-time deferral", () => {
  const publicLoaders: [string, () => Promise<unknown>][] = [
    ["loadSettings", () => loadSettings()],
    ["loadDisplayPayload", () => loadDisplayPayload()],
    ["loadTimetableRange", () => loadTimetableRange("2026-11-01", "2026-11-30")],
    ["loadMonth", () => loadMonth("2026-11")],
  ];

  it.each(publicLoaders)("%s waits for a request before reading anything", async (_name, load) => {
    const execute = vi.spyOn(database.client, "execute");
    const batch = vi.spyOn(database.client, "batch");
    // While prerendering, `connection()` never resolves; a rejection stands in for that.
    mocks.connection.mockRejectedValue(new Error("no request yet"));

    await expect(load()).rejects.toThrow("no request yet");

    expect(mocks.connection).toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  const adminLoaders: [string, () => Promise<unknown>][] = [
    ["loadAdminOverview", () => loadAdminOverview()],
    ["loadAdminAnnouncements", () => loadAdminAnnouncements()],
    ["loadImportHistory", () => loadImportHistory()],
  ];

  it.each(adminLoaders)("%s checks the session before reading anything", async (_name, load) => {
    const execute = vi.spyOn(database.client, "execute");
    // `requireAdmin()` redirects by throwing.
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(load()).rejects.toThrow("NEXT_REDIRECT");

    expect(execute).not.toHaveBeenCalled();
  });
});

describe("loadSettings", () => {
  it("returns the defaults on a new installation and stored values afterwards", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await saveSettings({ mosqueName: "Masjid Al-Noor" });
    expect((await loadSettings()).mosqueName).toBe("Masjid Al-Noor");
  });
});

describe("loadDisplayPayload", () => {
  it("builds the payload for the instant of the request", async () => {
    await upsertPrayerDays(listDates("2026-11-20", "2027-01-10").map(day));

    const payload = await loadDisplayPayload();

    expect(payload.serverNow).toBe(NOON);
    expect(payload.days[0].date).toBe("2026-11-24");
    expect(payload.days[payload.days.length - 1].date).toBe("2026-12-30");
    expect(payload.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("loadTimetableRange", () => {
  it("returns the stored rows of the range with the settings", async () => {
    await upsertPrayerDays(listDates("2026-11-28", "2026-12-03").map(day));

    const range = await loadTimetableRange("2026-12-01", "2026-12-31");

    expect(range.from).toBe("2026-12-01");
    expect(range.to).toBe("2026-12-31");
    expect(range.days.map((item) => item.date)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    expect(range.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("loadMonth", () => {
  it("returns the month with today, coverage and the clock", async () => {
    await upsertPrayerDays(listDates("2026-10-30", "2026-12-02").map(day));

    const month = await loadMonth("2026-11");

    expect(month).not.toBeNull();
    expect(month?.month).toBe("2026-11");
    expect(month?.from).toBe("2026-11-01");
    expect(month?.to).toBe("2026-11-30");
    expect(month?.days).toHaveLength(30);
    expect(month?.today).toBe("2026-11-25");
    expect(month?.coverage).toEqual({
      firstDate: "2026-10-30",
      lastDate: "2026-12-02",
      totalDays: 34,
    });
    expect(month?.serverNow).toBe(NOON);
  });

  it("returns an empty month when nothing is stored for it", async () => {
    expect((await loadMonth("2031-02"))?.days).toEqual([]);
  });

  it("works out today in the mosque's timezone", async () => {
    await saveSettings({ timezone: "Pacific/Auckland" });
    expect((await loadMonth("2026-11"))?.today).toBe("2026-11-26");
  });

  it.each(["2026-13", "2026-1", "november", "", "2026-11-01", "../admin"])(
    "returns null for %j without touching the database",
    async (month) => {
      const execute = vi.spyOn(database.client, "execute");
      expect(await loadMonth(month)).toBeNull();
      expect(execute).not.toHaveBeenCalled();
    },
  );
});

describe("loadAdminOverview", () => {
  it("describes a new installation", async () => {
    const overview = await loadAdminOverview();

    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(overview).toEqual({
      settings: DEFAULT_SETTINGS,
      settingsStored: false,
      today: "2026-11-25",
      coverage: { firstDate: null, lastDate: null, totalDays: 0 },
      daysRemaining: null,
      missingDates: listDates("2026-11-25", "2027-01-23"),
      lookaheadDays: ADMIN_LOOKAHEAD_DAYS,
      announcements: [],
      recentImports: [],
      serverNow: NOON,
    });
    expect(overview.missingDates).toHaveLength(ADMIN_LOOKAHEAD_DAYS);
  });

  it("reports what is left of the timetable and where it has gaps", async () => {
    await saveSettings({ mosqueName: "Masjid Al-Noor" });
    await upsertPrayerDays(
      listDates("2026-11-01", "2026-12-10")
        .filter((date) => date !== "2026-12-01")
        .map(day),
    );
    await createAnnouncement({ title: "Draft", showOnSite: false, showOnTv: false });
    await createAnnouncement({ title: "Expired", endsOn: "2026-01-01" });
    await addImportLog({ fileName: "winter.xlsx", added: 39, updated: 0, unchanged: 0 });

    const overview = await loadAdminOverview();

    expect(overview.settingsStored).toBe(true);
    expect(overview.daysRemaining).toBe(15);
    expect(overview.missingDates[0]).toBe("2026-12-01");
    expect(overview.missingDates[1]).toBe("2026-12-11");
    expect(overview.missingDates).toHaveLength(1 + 44);
    expect(overview.announcements.map((item) => item.title)).toEqual(["Expired", "Draft"]);
    expect(overview.recentImports.map((item) => item.fileName)).toEqual(["winter.xlsx"]);
  });

  it("says no days remain once the timetable has run out", async () => {
    await upsertPrayerDays(listDates("2026-11-01", "2026-11-20").map(day));
    expect((await loadAdminOverview()).daysRemaining).toBe(0);

    await upsertPrayerDays([day("2026-11-25")]);
    expect((await loadAdminOverview()).daysRemaining).toBe(0);

    await upsertPrayerDays([day("2026-11-26")]);
    expect((await loadAdminOverview()).daysRemaining).toBe(1);
  });
});

describe("admin lists", () => {
  it("lists every announcement and the import history for the admin", async () => {
    await createAnnouncement({ title: "Draft", showOnSite: false, showOnTv: false });
    await addImportLog({ fileName: "a.csv", added: 1, updated: 0, unchanged: 0 }, 1_000);
    await addImportLog({ fileName: "b.csv", added: 1, updated: 0, unchanged: 0 }, 2_000);

    expect((await loadAdminAnnouncements()).map((item) => item.title)).toEqual(["Draft"]);
    expect((await loadImportHistory()).map((item) => item.fileName)).toEqual(["b.csv", "a.csv"]);
    expect((await loadImportHistory(1)).map((item) => item.fileName)).toEqual(["b.csv"]);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(3);
  });
});
