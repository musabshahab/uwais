/**
 * Tests of `scripts/seed.ts`. They live here because the test runner only
 * collects tests under `src/` and `tests/unit/`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXAMPLE_ANNOUNCEMENTS,
  describeDatabase,
  formatSeedSummary,
  main,
  parseSeedArgs,
  runSeed,
  seedRefusal,
  type SeedOptions,
  type SeedSummary,
} from "../../../scripts/seed";
import {
  createAnnouncement,
  getAllPrayerDays,
  getCoverage,
  getPrayerDay,
  getPrayerDays,
  listAnnouncements,
  readSettings,
  saveSettings,
  setDatabase,
  upsertPrayerDays,
} from "@/lib/db";
import { openDatabase } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { TIME_FIELDS } from "@/lib/types";
import { fullDay } from "./core/testing";

/** 25 November 2026, midday: 2026 everywhere. */
const NOW = Date.UTC(2026, 10, 25, 12);
/** 31 December 2026, 23:30 in London: already 2027 east of it. */
const NEW_YEARS_EVE = Date.UTC(2026, 11, 31, 23, 30);

const PLAIN: SeedOptions = { year: null, reset: false, yes: false, force: false, help: false };

const REMOTE_URL = "libsql://admin:s3cret@uwais-db.example.org/main?authToken=abc123";

let database: TestDatabase;
const savedDatabaseUrl = process.env.DATABASE_URL;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  await database.client.batch(
    ["DELETE FROM prayer_days", "DELETE FROM settings", "DELETE FROM announcements"],
    "write",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
});

/** The options of arguments that are expected to be accepted. */
function optionsOf(args: readonly string[]): SeedOptions {
  const parsed = parseSeedArgs(args);
  if (!parsed.ok) throw new Error(`expected the arguments to be accepted, got: ${parsed.message}`);
  return parsed.options;
}

/** Captures what a run writes to the terminal. */
function captureOutput(): { out: () => string; err: () => string } {
  const written = { out: "", err: "" };
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    written.err += String(chunk);
    return true;
  });
  return { out: () => written.out, err: () => written.err };
}

describe("parseSeedArgs", () => {
  it("seeds this year and next when nothing is asked for", () => {
    expect(optionsOf([])).toStrictEqual(PLAIN);
  });

  it("reads each flag", () => {
    expect(optionsOf(["--year=2027"])).toStrictEqual({ ...PLAIN, year: 2027 });
    expect(optionsOf(["--reset", "--yes"])).toStrictEqual({ ...PLAIN, reset: true, yes: true });
    expect(optionsOf(["--yes", "--force", "--reset", "--year=2100"])).toStrictEqual({
      year: 2100,
      reset: true,
      yes: true,
      force: true,
      help: false,
    });
    expect(optionsOf(["--help"]).help).toBe(true);
    expect(optionsOf(["-h"]).help).toBe(true);
  });

  it("lets the last --year win", () => {
    expect(optionsOf(["--year=2027", "--year=2028"]).year).toBe(2028);
  });

  it.each([
    ["two digits", "--year=27"],
    ["no value", "--year="],
    ["a word", "--year=next"],
    ["a year before the range", "--year=1999"],
    ["a year after the range", "--year=2101"],
    ["a fraction", "--year=2027.5"],
    ["a sign", "--year=-2027"],
  ])("refuses --year with %s", (_name, argument) => {
    const parsed = parseSeedArgs([argument]);
    expect(parsed).toMatchObject({ ok: false });
    expect(parsed.ok ? "" : parsed.message).toMatch(/--year needs a year from 2000 to 2100/);
  });

  it.each([
    ["a mistyped flag", ["--reste", "--yes"], "--reste"],
    ["a year as a separate word", ["--year", "2027"], "--year"],
    ["a bare value", ["2027"], "2027"],
    ["a flag with a value it does not take", ["--reset=true"], "--reset=true"],
  ])("refuses %s instead of seeding something else", (_name, args, culprit) => {
    const parsed = parseSeedArgs(args);
    expect(parsed).toStrictEqual({ ok: false, message: `Unknown argument "${culprit}".` });
  });
});

describe("seedRefusal", () => {
  it("never refuses a plain seed", () => {
    expect(seedRefusal(PLAIN, "file:./data/uwais.db")).toBeNull();
    expect(seedRefusal({ ...PLAIN, year: 2027 }, REMOTE_URL)).toBeNull();
    // Without --reset the other two flags ask for nothing.
    expect(seedRefusal({ ...PLAIN, yes: true, force: true }, REMOTE_URL)).toBeNull();
  });

  it("refuses --reset until it is confirmed", () => {
    const refusal = seedRefusal({ ...PLAIN, reset: true }, "file:./data/uwais.db");
    expect(refusal).toMatch(/deletes every day of the timetable/);
    expect(refusal).toMatch(/--yes/);
    // --force is no substitute for the confirmation.
    expect(seedRefusal({ ...PLAIN, reset: true, force: true }, "file:./data/uwais.db")).toMatch(/--yes/);
  });

  it("allows a confirmed --reset on a local file", () => {
    const confirmed = { ...PLAIN, reset: true, yes: true };
    expect(seedRefusal(confirmed, "file:./data/uwais.db")).toBeNull();
    expect(seedRefusal(confirmed, "file:///var/lib/uwais/uwais.db")).toBeNull();
  });

  it.each([
    ["a hosted database", REMOTE_URL],
    ["an https address", "https://uwais-db.example.org"],
    ["a database in memory", "file::memory:"],
    ["something that is no address", "postgres"],
  ])("refuses a confirmed --reset on %s unless forced", (_name, url) => {
    const confirmed = { ...PLAIN, reset: true, yes: true };

    const refusal = seedRefusal(confirmed, url);
    expect(refusal).toMatch(/is not a local file/);
    expect(refusal).toMatch(/--force/);
    expect(refusal).not.toMatch(/s3cret|abc123/);

    expect(seedRefusal({ ...confirmed, force: true }, url)).toBeNull();
  });
});

describe("describeDatabase", () => {
  it("prints a local file as it is configured", () => {
    expect(describeDatabase("file:./data/uwais.db")).toBe("file:./data/uwais.db");
  });

  it("leaves credentials and query parameters out of a remote address", () => {
    expect(describeDatabase(REMOTE_URL)).toBe("libsql://uwais-db.example.org/main");
    expect(describeDatabase("https://user:pw@db.example.org:8443/?token=abc")).toBe(
      "https://db.example.org:8443/",
    );
  });

  it("prints a database in memory as it is configured", () => {
    expect(describeDatabase("file::memory:")).toBe("file::memory:");
    expect(describeDatabase("file:seed?mode=memory&cache=shared")).toBe("file:seed?mode=memory&cache=shared");
  });

  it("names nothing when the address cannot be read", () => {
    expect(describeDatabase("not a url")).toBe("the configured database");
    expect(describeDatabase("")).toBe("the configured database");
  });
});

describe("runSeed", () => {
  it("seeds this year and next with complete days, and two example announcements", async () => {
    const summary = await runSeed(PLAIN, NOW);

    expect(summary).toStrictEqual({
      timezone: "Europe/London",
      today: "2026-11-25",
      cleared: null,
      years: [
        { year: 2026, days: 365, added: 365, updated: 0, unchanged: 0 },
        { year: 2027, days: 365, added: 365, updated: 0, unchanged: 0 },
      ],
      announcementsAdded: 2,
      announcementsExisting: 0,
      coverage: { firstDate: "2026-01-01", lastDate: "2027-12-31", totalDays: 730 },
    });

    const days = await getAllPrayerDays();
    expect(days).toHaveLength(730);
    for (const day of days) {
      for (const field of TIME_FIELDS) expect(day[field], `${day.date} ${field}`).not.toBeNull();
    }
    expect((await listAnnouncements()).map((announcement) => announcement.title).sort()).toStrictEqual(
      EXAMPLE_ANNOUNCEMENTS.map((announcement) => announcement.title).sort(),
    );
  });

  it("changes nothing when it is run again", async () => {
    await runSeed(PLAIN, NOW);
    const before = { days: await getAllPrayerDays(), announcements: await listAnnouncements() };

    const again = await runSeed(PLAIN, NOW + 60_000);

    expect(again.years).toStrictEqual([
      { year: 2026, days: 365, added: 0, updated: 0, unchanged: 365 },
      { year: 2027, days: 365, added: 0, updated: 0, unchanged: 365 },
    ]);
    expect(again.announcementsAdded).toBe(0);
    expect(again.announcementsExisting).toBe(2);
    expect({ days: await getAllPrayerDays(), announcements: await listAnnouncements() }).toStrictEqual(before);
  });

  it("takes this year from the mosque's calendar, not the server's", async () => {
    const london = await runSeed(PLAIN, NEW_YEARS_EVE);
    expect(london.today).toBe("2026-12-31");
    expect(london.years.map((year) => year.year)).toStrictEqual([2026, 2027]);

    await saveSettings({ timezone: "Asia/Karachi" });
    const karachi = await runSeed(PLAIN, NEW_YEARS_EVE);
    expect(karachi.timezone).toBe("Asia/Karachi");
    expect(karachi.today).toBe("2027-01-01");
    expect(karachi.years.map((year) => year.year)).toStrictEqual([2027, 2028]);
    // 2028 is a leap year.
    expect(karachi.years[1]).toMatchObject({ days: 366, added: 366 });
  });

  it("seeds only the year that was asked for", async () => {
    const summary = await runSeed({ ...PLAIN, year: 2030 }, NOW);

    expect(summary.years).toStrictEqual([{ year: 2030, days: 365, added: 365, updated: 0, unchanged: 0 }]);
    expect(summary.coverage).toStrictEqual({
      firstDate: "2030-01-01",
      lastDate: "2030-12-31",
      totalDays: 365,
    });
  });

  it("leaves other days, the settings and existing announcements alone", async () => {
    const outside = fullDay("2025-06-01", { note: "Kept" });
    await upsertPrayerDays([outside]);
    await saveSettings({ mosqueName: "Masjid Al-Noor" });
    const own = await createAnnouncement({ title: "Our own announcement" });
    const settings = await readSettings();

    const summary = await runSeed({ ...PLAIN, year: 2027 }, NOW);

    expect(await getPrayerDay("2025-06-01")).toStrictEqual(outside);
    expect(await readSettings()).toStrictEqual(settings);
    expect(await listAnnouncements()).toStrictEqual([own]);
    expect(summary.announcementsAdded).toBe(0);
    expect(summary.announcementsExisting).toBe(1);
    expect(summary.coverage).toStrictEqual({
      firstDate: "2025-06-01",
      lastDate: "2027-12-31",
      totalDays: 366,
    });
  });

  it("keeps a note someone added to a seeded day", async () => {
    await runSeed({ ...PLAIN, year: 2027 }, NOW);
    const seeded = await getPrayerDay("2027-03-10");
    if (seeded === null) throw new Error("expected 10 March 2027 to be seeded");
    await upsertPrayerDays([{ date: "2027-03-10", note: "Guest speaker after Isha" }]);

    const again = await runSeed({ ...PLAIN, year: 2027 }, NOW);

    expect(again.years[0]).toMatchObject({ added: 0, updated: 0, unchanged: 365 });
    expect(await getPrayerDay("2027-03-10")).toStrictEqual({ ...seeded, note: "Guest speaker after Isha" });
  });

  it("puts a seeded time back when it was changed", async () => {
    await runSeed({ ...PLAIN, year: 2027 }, NOW);
    const seeded = await getPrayerDay("2027-03-10");
    await upsertPrayerDays([{ date: "2027-03-10", fajrJamaat: "03:33" }]);

    const again = await runSeed({ ...PLAIN, year: 2027 }, NOW);

    expect(again.years[0]).toMatchObject({ added: 0, updated: 1, unchanged: 364 });
    expect(await getPrayerDay("2027-03-10")).toStrictEqual(seeded);
  });

  it("deletes the whole timetable first when resetting, and nothing else", async () => {
    await upsertPrayerDays([fullDay("2019-06-01"), fullDay("2027-03-10", { note: "Old note" })]);
    await saveSettings({ mosqueName: "Masjid Al-Noor" });
    const own = await createAnnouncement({ title: "Our own announcement" });

    const summary = await runSeed({ ...PLAIN, year: 2027, reset: true, yes: true }, NOW);

    expect(summary.cleared).toBe(2);
    expect(summary.years).toStrictEqual([{ year: 2027, days: 365, added: 365, updated: 0, unchanged: 0 }]);
    expect(await getPrayerDay("2019-06-01")).toBeNull();
    expect((await getPrayerDay("2027-03-10"))?.note).toBeNull();
    expect(await getCoverage()).toStrictEqual({
      firstDate: "2027-01-01",
      lastDate: "2027-12-31",
      totalDays: 365,
    });
    expect((await readSettings()).settings.mosqueName).toBe("Masjid Al-Noor");
    expect(await listAnnouncements()).toStrictEqual([own]);
  });

  it("reports a reset of an empty timetable as zero days, not as no reset", async () => {
    const summary = await runSeed({ ...PLAIN, year: 2027, reset: true, yes: true }, NOW);
    expect(summary.cleared).toBe(0);
  });

  it("writes the times of the clock change in local time", async () => {
    await runSeed({ ...PLAIN, year: 2027 }, NOW);
    // The clocks go forward on 28 March 2027: Dhuhr moves from about noon to about one.
    const [before, after] = await getPrayerDays("2027-03-27", "2027-03-28");
    expect(before.dhuhrBegins).toMatch(/^12:/);
    expect(after.dhuhrBegins).toMatch(/^13:/);
  });
});

describe("formatSeedSummary", () => {
  const SUMMARY: SeedSummary = {
    timezone: "Europe/London",
    today: "2026-11-25",
    cleared: null,
    years: [
      { year: 2026, days: 365, added: 365, updated: 0, unchanged: 0 },
      { year: 2027, days: 365, added: 0, updated: 2, unchanged: 363 },
    ],
    announcementsAdded: 2,
    announcementsExisting: 0,
    coverage: { firstDate: "2026-01-01", lastDate: "2027-12-31", totalDays: 730 },
  };

  it("says where, when and what was seeded", () => {
    expect(formatSeedSummary(SUMMARY, "file:./data/uwais.db")).toStrictEqual([
      "Seeded the Uwais demo data.",
      "  Database       file:./data/uwais.db",
      "  Timezone       Europe/London (today is 2026-11-25)",
      "  2026           365 days: 365 added, 0 updated, 0 unchanged",
      "  2027           365 days: 0 added, 2 updated, 363 unchanged",
      "  Announcements  2 examples added",
      "  Timetable      730 days, 2026-01-01 to 2027-12-31",
    ]);
  });

  it("mentions a reset, existing announcements and a timezone other than London's", () => {
    const lines = formatSeedSummary(
      {
        ...SUMMARY,
        timezone: "Asia/Karachi",
        cleared: 12,
        announcementsAdded: 0,
        announcementsExisting: 3,
      },
      REMOTE_URL,
    );

    expect(lines).toContain("  Database       libsql://uwais-db.example.org/main");
    expect(lines).toContain("  Reset          12 days deleted first");
    expect(lines).toContain("  Announcements  left alone (3 already there)");
    expect(lines.join("\n")).toMatch(/calculated for London/);
    expect(lines.join("\n")).not.toMatch(/s3cret|abc123/);
  });

  it("says so when the timetable is empty", () => {
    const lines = formatSeedSummary(
      { ...SUMMARY, years: [], coverage: { firstDate: null, lastDate: null, totalDays: 0 } },
      "file:./data/uwais.db",
    );
    expect(lines[lines.length - 1]).toBe("  Timetable      empty");
  });
});

describe("main", () => {
  it("prints the usage for --help and touches nothing", async () => {
    const output = captureOutput();

    expect(await main(["--help"])).toBe(0);

    expect(output.out()).toMatch(/^Usage: npm run seed -- \[options\]/);
    expect(output.err()).toBe("");
    expect(await getAllPrayerDays()).toStrictEqual([]);
  });

  it("fails on an unknown argument and shows the usage", async () => {
    const output = captureOutput();

    expect(await main(["--reste", "--yes"])).toBe(1);

    expect(output.err()).toMatch(/Unknown argument "--reste"\./);
    expect(output.err()).toMatch(/Usage: npm run seed/);
    expect(output.out()).toBe("");
    expect(await getAllPrayerDays()).toStrictEqual([]);
  });

  it("refuses an unconfirmed --reset before it opens the database", async () => {
    await upsertPrayerDays([fullDay("2027-03-10")]);
    const output = captureOutput();

    expect(await main(["--reset"])).toBe(1);

    expect(output.err()).toMatch(/Add --yes to confirm/);
    expect(await getAllPrayerDays()).toHaveLength(1);
  });

  it("refuses a confirmed --reset on a hosted database without printing its credentials", async () => {
    process.env.DATABASE_URL = REMOTE_URL;
    await upsertPrayerDays([fullDay("2027-03-10")]);
    const output = captureOutput();

    expect(await main(["--reset", "--yes"])).toBe(1);

    expect(output.err()).toMatch(/libsql:\/\/uwais-db\.example\.org\/main is not a local file/);
    expect(output.err()).not.toMatch(/s3cret|abc123/);
    expect(await getAllPrayerDays()).toHaveLength(1);
  });

  it("seeds the configured database, prints the summary and closes the database", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "uwais-seed-"));
    const url = `file:${path.join(directory, "seed.db")}`;
    process.env.DATABASE_URL = url;
    // Uninstalled, so that the run opens the configured database as the command does.
    setDatabase(null);
    const output = captureOutput();
    try {
      expect(await main(["--year=2027"])).toBe(0);

      expect(output.err()).toBe("");
      expect(output.out()).toMatch(/Seeded the Uwais demo data\./);
      expect(output.out()).toMatch(/2027 {11}365 days: 365 added, 0 updated, 0 unchanged/);
      expect(output.out()).toMatch(/Announcements {2}2 examples added/);

      const reopened = openDatabase({ url });
      try {
        const count = await reopened.execute("SELECT COUNT(*) AS days FROM prayer_days");
        expect(Number(count.rows[0].days)).toBe(365);
      } finally {
        reopened.close();
      }
    } finally {
      setDatabase(database.client);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
