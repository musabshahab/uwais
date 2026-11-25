import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSettings, setDatabase, upsertPrayerDays } from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { parseTimetable, readSpreadsheet } from "@/lib/import";
import { addDays } from "@/lib/time";
import type { DateString, PrayerDay } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async (): Promise<void> => undefined),
}));

// `connection()` throws outside a Next.js request; the tests stand in for the framework.
vi.mock("next/server", () => ({ connection: mocks.connection }));
// The export is public and never asks for a session; this keeps Next.js request APIs out of the tests.
vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(), getSession: vi.fn() }));

import { GET, OPTIONS } from "./route";

const BASE = "http://localhost/api/timetable/export";

/** A plausible day; the minutes vary with the date so that no two days are alike. */
function day(date: DateString, overrides: Partial<PrayerDay> = {}): PrayerDay {
  const minute = date.slice(8);
  return {
    date,
    fajrBegins: `05:${minute}`,
    fajrJamaat: "06:30",
    sunrise: `07:${minute}`,
    dhuhrBegins: `12:${minute}`,
    dhuhrJamaat: "13:00",
    asrBegins: `14:${minute}`,
    asrJamaat: "15:00",
    maghribBegins: `16:${minute}`,
    maghribJamaat: `16:${minute}`,
    ishaBegins: `18:${minute}`,
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

/** The stored timetable: 20 January to 10 February 2027, with a Friday and a note in it. */
const STORED: PrayerDay[] = Array.from({ length: 22 }, (_, offset) => {
  const date = addDays("2027-01-20", offset);
  if (date === "2027-01-22") return day(date, { jumuah: ["12:30", "13:30"] });
  if (date === "2027-02-01") return day(date, { note: "Café closed, مغلق" });
  return day(date);
});

/** The days a downloaded file holds, read back with the importer. */
async function daysIn(response: Response, fileName: string): Promise<PrayerDay[]> {
  const data = new Uint8Array(await response.clone().arrayBuffer());
  const result = parseTimetable(await readSpreadsheet({ fileName, data }));
  expect(result.issues.filter((issue) => issue.severity === "error")).toStrictEqual([]);
  return result.days;
}

/** Calls the route as a browser would. */
function download(query: string): Promise<Response> {
  return GET(new Request(`${BASE}${query}`));
}

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
  await upsertPrayerDays(STORED);
  await saveSettings({ mosqueName: "Masjid Al-Noor" });
});

afterAll(() => {
  database.close();
});

beforeEach(() => {
  mocks.connection.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/timetable/export", () => {
  it("downloads a month as CSV that the importer reads back unchanged", async () => {
    const response = await download("?month=2027-02");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="timetable-2027-02.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const february = STORED.filter((stored) => stored.date >= "2027-02-01");
    expect(february).toHaveLength(10);
    expect(await daysIn(response, "timetable-2027-02.csv")).toStrictEqual(february);
  });

  it("starts the CSV with a byte-order mark and states its exact length", async () => {
    const response = await download("?format=csv&year=2027");
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(Array.from(bytes.slice(0, 3))).toStrictEqual([0xef, 0xbb, 0xbf]);
    expect(response.headers.get("Content-Length")).toBe(String(bytes.byteLength));
    const text = new TextDecoder("utf-8").decode(bytes);
    expect(text).toContain("Café closed, مغلق");
    // One header line and one line per stored day.
    expect(text.trimEnd().split(/\r?\n/)).toHaveLength(STORED.length + 1);
  });

  it("downloads a year as an Excel workbook that the importer reads back unchanged", async () => {
    const response = await download("?format=xlsx&year=2027");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="timetable-2027.xlsx"',
    );
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    // A workbook is a zip archive.
    expect(Array.from(bytes.slice(0, 2))).toStrictEqual([0x50, 0x4b]);
    expect(response.headers.get("Content-Length")).toBe(String(bytes.byteLength));
    expect(await daysIn(response, "timetable-2027.xlsx")).toStrictEqual(STORED);
  });

  it("keeps to the dates that were asked for, both ends included", async () => {
    const response = await download("?from=2027-01-22&to=2027-01-24");

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="timetable-2027-01-22-to-2027-01-24.csv"',
    );
    const days = await daysIn(response, "range.csv");
    expect(days.map((exported) => exported.date)).toStrictEqual(["2027-01-22", "2027-01-23", "2027-01-24"]);
    expect(days[0].jumuah).toStrictEqual(["12:30", "13:30"]);
  });

  it("can be read by scripts on other websites, file name included", async () => {
    const response = await download("?year=2027");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe("Content-Disposition");
  });

  it("waits for a real request before it does anything, even refuse a query", async () => {
    await download("?format=pdf");
    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an unknown format", "?format=pdf&year=2027", /csv or xlsx/],
    ["no period", "?format=xlsx", /Ask for one of/],
    ["no query at all", "", /Ask for one of/],
    ["a year that is not a year", "?year=next", /year: Enter a year as YYYY/],
    ["a range that is too long", "?from=2027-01-01&to=2029-01-01", /at most 400 days/],
    ["a path where a year belongs", "?year=../../etc/passwd", /year: Enter a year as YYYY/],
  ])("answers 400 for %s", async (_name, query, message) => {
    const response = await download(query);

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message).toMatch(message);
  });

  it.each(["csv", "xlsx"])("answers 404 with a JSON error when the period holds no days (%s)", async (format) => {
    const response = await download(`?format=${format}&year=2031`);

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.json()).toStrictEqual({
      error: {
        code: "no_data",
        message: "No prayer times are saved between 2031-01-01 and 2031-12-31.",
      },
    });
  });

  it("answers 500 without details when the timetable cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = await createTestDatabase();
    try {
      await broken.client.execute("DROP TABLE prayer_days");

      const response = await download("?year=2027");

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(JSON.parse(text)).toMatchObject({ error: { code: "internal_error" } });
      expect(text).not.toMatch(/SQLITE|no such table|prayer_days/i);
      expect(log).toHaveBeenCalledWith("[api] /api/timetable/export failed", expect.anything());
    } finally {
      broken.close();
      setDatabase(database.client);
    }
  });
});

describe("OPTIONS /api/timetable/export", () => {
  it("answers the CORS preflight", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
