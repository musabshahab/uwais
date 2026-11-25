import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnnouncement, saveSettings, setDatabase, upsertPrayerDays } from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { listDates } from "@/lib/time";
import { DEFAULT_SETTINGS } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async (): Promise<void> => undefined),
}));

// `connection()` throws outside a Next.js request; the tests stand in for the framework.
vi.mock("next/server", () => ({ connection: mocks.connection }));
// The public routes never ask for a session; this keeps Next.js request APIs out of the tests.
vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn() }));

import { GET as getDisplay, OPTIONS as optionsDisplay } from "./display/route";
import { GET as getHealth } from "./health/route";
import { GET as getTimetable, OPTIONS as optionsTimetable } from "./timetable/route";
import { GET as getVersion } from "./version/route";

let database: TestDatabase;
const NOON = Date.UTC(2026, 10, 25, 12);
const savedBuildId = process.env.NEXT_PUBLIC_BUILD_ID;
const savedDatabaseUrl = process.env.DATABASE_URL;

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
  process.env.NEXT_PUBLIC_BUILD_ID = "test-build";
  await database.client.batch(
    ["DELETE FROM prayer_days", "DELETE FROM settings", "DELETE FROM announcements"],
    "write",
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedBuildId === undefined) delete process.env.NEXT_PUBLIC_BUILD_ID;
  else process.env.NEXT_PUBLIC_BUILD_ID = savedBuildId;
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
});

/** A GET request to the timetable endpoint with the given query string. */
function timetableRequest(query: string): Request {
  return new Request(`http://mosque.example/api/timetable${query}`);
}

/**
 * Runs `work` with the database unreachable: the configured file sits "inside"
 * a regular file, so it can be neither created nor opened.
 */
async function withBrokenDatabase(work: () => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "uwais-broken-"));
  const blocker = path.join(directory, "not-a-directory");
  writeFileSync(blocker, "");
  process.env.DATABASE_URL = `file:${path.join(blocker, "sub", "uwais.db")}`;
  setDatabase(null);
  try {
    await work();
  } finally {
    setDatabase(database.client);
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("GET /api/display", () => {
  it("returns the payload for an empty database", async () => {
    const response = await getDisplay();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      version: "test-build",
      serverNow: NOON,
      settings: DEFAULT_SETTINGS,
      days: [],
      announcements: [],
      coverage: { firstDate: null, lastDate: null, totalDays: 0 },
    });
  });

  it("returns the window of days, the announcements and the stored settings", async () => {
    await saveSettings({ mosqueName: "Masjid Al-Noor" });
    await upsertPrayerDays(
      listDates("2026-11-01", "2027-01-31").map((date) => ({ date, fajrBegins: "06:00" })),
    );
    await createAnnouncement({ title: "Eid prayer" });
    await createAnnouncement({ title: "Draft", showOnSite: false, showOnTv: false });

    const payload = await (await getDisplay()).json();

    expect(payload.settings.mosqueName).toBe("Masjid Al-Noor");
    expect(payload.days).toHaveLength(37);
    expect(payload.days[0].date).toBe("2026-11-24");
    expect(payload.days[36].date).toBe("2026-12-30");
    expect(payload.announcements.map((item: { title: string }) => item.title)).toEqual([
      "Eid prayer",
    ]);
  });

  it("waits for a request before building anything", async () => {
    const execute = vi.spyOn(database.client, "execute");
    mocks.connection.mockRejectedValue(new Error("no request yet"));

    await expect(getDisplay()).rejects.toThrow("no request yet");
    expect(execute).not.toHaveBeenCalled();
  });

  it("answers 500 without details when the database fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await withBrokenDatabase(async () => {
      const response = await getDisplay();
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(JSON.parse(text)).toEqual({
        error: { code: "internal_error", message: "The server could not complete the request." },
      });
      expect(text).not.toContain("not-a-directory");
      expect(text).not.toMatch(/at .*\.ts/);
    });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("answers a CORS preflight", () => {
    const response = optionsDisplay();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("GET /api/timetable", () => {
  beforeEach(async () => {
    await saveSettings({ mosqueName: "Masjid Al-Noor", timeFormat: "24h" });
    await upsertPrayerDays(
      listDates("2026-11-28", "2027-01-03").map((date) => ({ date, ishaJamaat: "19:30" })),
    );
  });

  it("returns a month with only the settings a timetable needs", async () => {
    const response = await getTimetable(timetableRequest("?month=2026-12"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(body.from).toBe("2026-12-01");
    expect(body.to).toBe("2026-12-31");
    expect(body.days.map((day: { date: string }) => day.date)).toEqual(
      listDates("2026-12-01", "2026-12-31"),
    );
    expect(body.days[0].ishaJamaat).toBe("19:30");
    expect(body.settings).toEqual({
      timezone: "Europe/London",
      timeFormat: "24h",
      mosqueName: "Masjid Al-Noor",
    });
  });

  it("returns a year", async () => {
    const body = await (await getTimetable(timetableRequest("?year=2027"))).json();
    expect(body.from).toBe("2027-01-01");
    expect(body.to).toBe("2027-12-31");
    expect(body.days.map((day: { date: string }) => day.date)).toEqual([
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("returns an explicit range, both ends included", async () => {
    const body = await (
      await getTimetable(timetableRequest("?from=2026-11-29&to=2026-11-30"))
    ).json();
    expect(body.days.map((day: { date: string }) => day.date)).toEqual([
      "2026-11-29",
      "2026-11-30",
    ]);
  });

  it("returns an empty list for a period without rows", async () => {
    const body = await (await getTimetable(timetableRequest("?month=2031-05"))).json();
    expect(body.days).toEqual([]);
  });

  it.each([
    ["", /^Ask for one of/],
    ["?month=2026-13", /^month: /],
    ["?month=December", /^month: /],
    ["?year=26", /^year: /],
    ["?from=2026-12-01", /^Ask for one of/],
    ["?from=2026-12-31&to=2026-12-01", /^to: The end date must not be before the start date/],
    ["?from=2026-01-01&to=2027-02-05", /^to: The date range can cover at most 400 days/],
    ["?from=2026-02-30&to=2026-03-01", /^from: /],
    ["?month=2026-12&year=2026", /^Ask for one of/],
    ["?month=2026-11&month=2026-12", /given more than once/],
    ["?month=2026-12%27%20OR%201=1", /^month: /],
  ])("answers 400 for %j", async (query, message) => {
    const execute = vi.spyOn(database.client, "execute");

    const response = await getTimetable(timetableRequest(query));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message).toMatch(message);
    expect(execute).not.toHaveBeenCalled();
  });

  it("accepts the longest allowed range", async () => {
    const response = await getTimetable(timetableRequest("?from=2026-01-01&to=2027-02-04"));
    expect(response.status).toBe(200);
  });

  it("answers 500 without details when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await withBrokenDatabase(async () => {
      const response = await getTimetable(timetableRequest("?month=2026-12"));
      expect(response.status).toBe(500);
      expect((await response.json()).error.code).toBe("internal_error");
    });
  });

  it("answers a CORS preflight", () => {
    expect(optionsTimetable().headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("GET /api/version", () => {
  it("returns the build id and the server clock, uncached and same-origin only", async () => {
    const response = await getVersion();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toEqual({ version: "test-build", serverNow: NOON });
  });

  it("reports dev outside a build", async () => {
    delete process.env.NEXT_PUBLIC_BUILD_ID;
    expect((await (await getVersion()).json()).version).toBe("dev");
  });

  it("keeps answering while the database is down", async () => {
    await withBrokenDatabase(async () => {
      expect((await getVersion()).status).toBe(200);
    });
  });
});

describe("GET /api/health", () => {
  it("answers 200 once the database has answered", async () => {
    const response = await getHealth();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toEqual({ ok: true, db: true });
  });

  it("answers 503 when the database cannot be reached, and recovers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await withBrokenDatabase(async () => {
      const response = await getHealth();
      const text = await response.text();

      expect(response.status).toBe(503);
      expect(JSON.parse(text)).toEqual({ ok: false, db: false });
      expect(text).not.toContain("not-a-directory");
    });
    expect(log).toHaveBeenCalledTimes(1);

    expect((await getHealth()).status).toBe(200);
  });
});
