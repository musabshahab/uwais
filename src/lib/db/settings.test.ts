import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { DEFAULT_SETTINGS, type SiteSettings } from "@/lib/types";
import {
  defaultSettings,
  getSettings,
  readSettings,
  resolveSettings,
  saveSettings,
} from "./settings";
import { createTestDatabase, type TestDatabase } from "./testing";

let database: TestDatabase;
const savedZone = process.env.MOSQUE_TIMEZONE;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  delete process.env.MOSQUE_TIMEZONE;
  await database.client.execute("DELETE FROM settings");
});

afterEach(() => {
  if (savedZone === undefined) delete process.env.MOSQUE_TIMEZONE;
  else process.env.MOSQUE_TIMEZONE = savedZone;
});

/** Writes a raw row, bypassing validation, as a hand edit or an old version would. */
async function storeRaw(key: string, value: string): Promise<void> {
  await database.client.execute({
    sql: "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, 'x')",
    args: [key, value],
  });
}

describe("defaultSettings", () => {
  it("equals the built-in defaults without MOSQUE_TIMEZONE", () => {
    expect(defaultSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("takes the timezone from MOSQUE_TIMEZONE when it is a real zone", () => {
    expect(defaultSettings({ MOSQUE_TIMEZONE: "Asia/Karachi" }).timezone).toBe("Asia/Karachi");
    expect(defaultSettings({ MOSQUE_TIMEZONE: "  America/Toronto " }).timezone).toBe(
      "America/Toronto",
    );
  });

  it.each(["", "   ", "Mars/Olympus", "+05:00", "GMT+5"])(
    "ignores MOSQUE_TIMEZONE = %j",
    (zone) => {
      expect(defaultSettings({ MOSQUE_TIMEZONE: zone }).timezone).toBe(DEFAULT_SETTINGS.timezone);
    },
  );

  it("returns a copy that can be changed without touching the shared defaults", () => {
    const first = defaultSettings({});
    first.jumuah.push({ label: "Extra", time: "14:00" });
    first.jumuah[0].time = "00:00";
    first.tv.theme = "day";

    expect(defaultSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.jumuah).toHaveLength(1);
    expect(DEFAULT_SETTINGS.jumuah[0].time).toBe("13:15");
    expect(DEFAULT_SETTINGS.tv.theme).toBe("night");
  });
});

describe("resolveSettings", () => {
  const defaults = defaultSettings({});

  it("returns the defaults when nothing is stored", () => {
    expect(resolveSettings({}, defaults)).toEqual(defaults);
  });

  it("lays valid stored values over the defaults", () => {
    const resolved = resolveSettings(
      { mosqueName: "Masjid Al-Noor", timeFormat: "24h", hijriAdjustment: -1 },
      defaults,
    );
    expect(resolved).toEqual({
      ...defaults,
      mosqueName: "Masjid Al-Noor",
      timeFormat: "24h",
      hijriAdjustment: -1,
    });
  });

  it("falls back field by field when stored values are invalid", () => {
    const resolved = resolveSettings(
      {
        mosqueName: "Masjid Al-Noor",
        shortName: 42,
        timezone: "Nowhere/Nothing",
        timeFormat: "13h",
        hijriAdjustment: 9,
        hijriRollAtMaghrib: "no",
        mapUrl: "javascript:alert(1)",
        email: "broken",
        jumuah: [{ label: "", time: "25:00" }],
      },
      defaults,
    );
    expect(resolved).toEqual({ ...defaults, mosqueName: "Masjid Al-Noor" });
  });

  it("merges the TV settings deeply and validates each of them", () => {
    const resolved = resolveSettings(
      { tv: { theme: "day", announcementSeconds: 2, showSeconds: false, extra: true } },
      defaults,
    );
    expect(resolved.tv).toEqual({ ...defaults.tv, theme: "day", showSeconds: false });
  });

  it.each([null, "night", 7, ["day"]])("ignores a TV value of %j", (tv) => {
    expect(resolveSettings({ tv }, defaults).tv).toEqual(defaults.tv);
  });

  it("ignores unknown keys", () => {
    const resolved: SiteSettings = resolveSettings({ adminPassword: "leak" }, defaults);
    expect(resolved).toEqual(defaults);
    expect(Object.keys(resolved)).not.toContain("adminPassword");
  });
});

describe("getSettings", () => {
  it("returns the defaults on a fresh database and says nothing is stored", async () => {
    expect(await readSettings()).toEqual({ settings: DEFAULT_SETTINGS, stored: false });
  });

  it("uses MOSQUE_TIMEZONE on a fresh database", async () => {
    process.env.MOSQUE_TIMEZONE = "Asia/Karachi";
    expect((await getSettings()).timezone).toBe("Asia/Karachi");
  });

  it("prefers a stored timezone over MOSQUE_TIMEZONE", async () => {
    process.env.MOSQUE_TIMEZONE = "Asia/Karachi";
    await saveSettings({ timezone: "Europe/Paris" });
    expect((await getSettings()).timezone).toBe("Europe/Paris");
  });

  it("falls back to MOSQUE_TIMEZONE when the stored zone is unusable", async () => {
    process.env.MOSQUE_TIMEZONE = "Asia/Karachi";
    await storeRaw("timezone", '"Atlantis/Lost"');
    expect((await getSettings()).timezone).toBe("Asia/Karachi");
  });

  it("survives rows that are not JSON or not valid values", async () => {
    await storeRaw("mosqueName", "{not json");
    await storeRaw("tagline", '"A valid tagline"');
    await storeRaw("hijriAdjustment", '"two"');
    await storeRaw("tv", '{"theme":"day","jamaatInProgressMinutes":500}');
    await storeRaw("mystery", "[1,2,3]");

    const snapshot = await readSettings();

    expect(snapshot.stored).toBe(true);
    expect(snapshot.settings).toEqual({
      ...DEFAULT_SETTINGS,
      tagline: "A valid tagline",
      tv: { ...DEFAULT_SETTINGS.tv, theme: "day" },
    });
  });
});

describe("saveSettings", () => {
  it("saves a subset and leaves the rest alone", async () => {
    const saved = await saveSettings({ mosqueName: "  Masjid Al-Noor ", timeFormat: "24h" });

    expect(saved).toEqual({ ...DEFAULT_SETTINGS, mosqueName: "Masjid Al-Noor", timeFormat: "24h" });
    expect(await getSettings()).toEqual(saved);
    expect((await readSettings()).stored).toBe(true);

    const rows = await database.client.execute("SELECT key FROM settings ORDER BY key");
    expect(rows.rows.map((row) => row.key)).toEqual(["mosqueName", "timeFormat"]);
  });

  it("merges a partial TV update into the stored TV settings", async () => {
    await saveSettings({ tv: { theme: "day", announcementSeconds: 20 } });

    const saved = await saveSettings({ tv: { showSunrise: false } });

    expect(saved.tv).toEqual({
      ...DEFAULT_SETTINGS.tv,
      theme: "day",
      announcementSeconds: 20,
      showSunrise: false,
    });
    expect((await getSettings()).tv).toEqual(saved.tv);
  });

  it("replaces the list of Jumu'ah slots as a whole, and can clear it", async () => {
    const slots = [
      { label: "1st Jumu'ah", time: "12:30" },
      { label: "2nd Jumu'ah", time: "13:30" },
    ];
    expect((await saveSettings({ jumuah: slots })).jumuah).toEqual(slots);
    expect((await saveSettings({ jumuah: [] })).jumuah).toEqual([]);
    expect((await getSettings()).jumuah).toEqual([]);
  });

  it("can blank an optional text field", async () => {
    await saveSettings({ phone: "020 7946 0000", mapUrl: "https://maps.example.org/x" });
    const saved = await saveSettings({ phone: "", mapUrl: "" });
    expect(saved.phone).toBe("");
    expect(saved.mapUrl).toBe("");
  });

  it("saves nothing when any supplied field is invalid", async () => {
    await expect(
      saveSettings({ mosqueName: "Masjid Al-Noor", timezone: "Nowhere/Nothing" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(saveSettings({ tv: { announcementSeconds: 0 } })).rejects.toBeInstanceOf(ZodError);

    expect(await readSettings()).toEqual({ settings: DEFAULT_SETTINGS, stored: false });
  });

  it("does nothing for an empty patch", async () => {
    expect(await saveSettings({})).toEqual(DEFAULT_SETTINGS);
    expect((await readSettings()).stored).toBe(false);
  });

  it("overwrites an invalid stored value with a valid one", async () => {
    await storeRaw("hijriAdjustment", "99");
    expect((await saveSettings({ hijriAdjustment: 1 })).hijriAdjustment).toBe(1);
    expect((await getSettings()).hijriAdjustment).toBe(1);
  });

  it("records when each setting was last changed", async () => {
    await saveSettings({ mosqueName: "First" }, Date.UTC(2026, 10, 25, 12));
    await saveSettings({ tagline: "Second" }, Date.UTC(2026, 10, 26, 12));

    const rows = await database.client.execute("SELECT key, updated_at FROM settings ORDER BY key");
    expect(rows.rows.map((row) => [row.key, row.updated_at])).toEqual([
      ["mosqueName", "2026-11-25T12:00:00.000Z"],
      ["tagline", "2026-11-26T12:00:00.000Z"],
    ]);
  });

  it("keeps both changes when two saves overlap", async () => {
    const [first, second] = await Promise.all([
      saveSettings({ tv: { theme: "day" } }),
      saveSettings({ tv: { showSeconds: false } }),
    ]);

    expect(first.tv.theme).toBe("day");
    expect(second.tv).toEqual({ ...DEFAULT_SETTINGS.tv, theme: "day", showSeconds: false });
    expect((await getSettings()).tv).toEqual(second.tv);
  });
});
