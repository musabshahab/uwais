/**
 * Fills the configured database with demo data: a realistic sample timetable
 * and, when there are no announcements yet, two example announcements. Used
 * by developers, the demo and the end-to-end tests.
 *
 *   npm run seed                      this year and next, on the mosque's calendar
 *   npm run seed -- --year=2027       one specific year
 *   npm run seed -- --reset --yes     delete the whole timetable first
 *
 * The database is the one the app uses: `DATABASE_URL` (default
 * `file:./data/uwais.db`), with `DATABASE_AUTH_TOKEN` for a remote one.
 *
 * Seeding only adds and amends the days it generates; other days, the
 * settings and existing announcements are left alone, and running it twice
 * changes nothing the second time. `--reset` is the exception: it deletes
 * every timetable day first, so it must be confirmed with `--yes`, and it
 * refuses a remote database unless `--force` is given as well.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnnouncement, listAnnouncements } from "../src/lib/db/announcements";
import { closeDatabase, databaseFilePath, readDatabaseConfig } from "../src/lib/db/client";
import { deletePrayerDays, getCoverage, upsertPrayerDays } from "../src/lib/db/prayer-days";
import type { AnnouncementInput } from "../src/lib/db/schemas";
import { getSettings } from "../src/lib/db/settings";
import { yearOf } from "../src/lib/time/dates";
import { resolveTimeZone, zonedNow } from "../src/lib/time/tz";
import type { DateString, TimetableCoverage } from "../src/lib/types";
import { LONDON, generateSampleDays } from "./sample-timetable";

/** Earliest year the sample timetable is generated for. */
const MIN_SEED_YEAR = 2000;
/** Latest year the sample timetable is generated for. */
const MAX_SEED_YEAR = 2100;

/** Bounds of the `prayer_days` table: every date a row can have. */
const EARLIEST_DATE: DateString = "0001-01-01";
const LATEST_DATE: DateString = "9999-12-31";

const USAGE = [
  "Usage: npm run seed -- [options]",
  "",
  "  --year=YYYY   seed this year only (default: this year and next, on the mosque's calendar)",
  "  --reset       delete every timetable day first (needs --yes)",
  "  --yes         confirm --reset",
  "  --force       allow --reset on a remote database",
  "  --help        show this text",
].join("\n");

/** The announcements added to a database that has none. */
export const EXAMPLE_ANNOUNCEMENTS: readonly AnnouncementInput[] = [
  {
    title: "Please park considerately",
    body: "Our neighbours need their driveways at all times. Use the car park behind the hall, and allow a little extra time on Fridays.",
    showOnSite: true,
    showOnTv: true,
    pinned: true,
  },
  {
    title: "Weekend Qur'an classes: places available",
    body: "Classes for ages 6 to 14 run on Saturday and Sunday mornings. Ask at the office after any prayer to enrol.",
    showOnSite: true,
    showOnTv: true,
    pinned: false,
  },
];

/** What the command line asked for. */
export interface SeedOptions {
  /** The one year to seed, or null for this year and next. */
  year: number | null;
  /** Delete the whole timetable first. */
  reset: boolean;
  /** Confirms `reset`. */
  yes: boolean;
  /** Allows `reset` on a database that is not a local file. */
  force: boolean;
  /** Print the usage text and do nothing. */
  help: boolean;
}

/** Parsed command-line arguments, or what is wrong with them. */
export type SeedArguments = { ok: true; options: SeedOptions } | { ok: false; message: string };

/**
 * Reads the command-line arguments (without the node and script paths).
 * Anything unrecognised is an error: a mistyped `--reste` must not turn into
 * a plain seed that the caller believes was a reset.
 */
export function parseSeedArgs(args: readonly string[]): SeedArguments {
  const options: SeedOptions = { year: null, reset: false, yes: false, force: false, help: false };
  for (const argument of args) {
    if (argument === "--reset") options.reset = true;
    else if (argument === "--yes") options.yes = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument.startsWith("--year=")) {
      const text = argument.slice("--year=".length);
      const year = /^\d{4}$/.test(text) ? Number(text) : Number.NaN;
      if (!(year >= MIN_SEED_YEAR && year <= MAX_SEED_YEAR)) {
        return {
          ok: false,
          message: `--year needs a year from ${MIN_SEED_YEAR} to ${MAX_SEED_YEAR}, for example --year=2027.`,
        };
      }
      options.year = year;
    } else {
      return { ok: false, message: `Unknown argument "${argument}".` };
    }
  }
  return { ok: true, options };
}

/**
 * Why these options must not run against this database, or null when they
 * may. Only `--reset` is ever refused: without `--yes`, and on anything but
 * a local file without `--force`.
 */
export function seedRefusal(options: SeedOptions, databaseUrl: string): string | null {
  if (!options.reset) return null;
  if (!options.yes) {
    return "--reset deletes every day of the timetable. Add --yes to confirm.";
  }
  if (databaseFilePath(databaseUrl) === null && !options.force) {
    return `--reset was refused: ${describeDatabase(databaseUrl)} is not a local file. Add --force if you really mean to clear it.`;
  }
  return null;
}

/**
 * A database URL that is safe to print. A `file:` URL names a place on this
 * machine and is printed whole; anything else loses its credentials and
 * query parameters, where an access token may sit.
 */
export function describeDatabase(databaseUrl: string): string {
  if (/^file:/i.test(databaseUrl)) return databaseUrl;
  try {
    const url = new URL(databaseUrl);
    return url.host === "" ? `${url.protocol}${url.pathname}` : `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "the configured database";
  }
}

/** What seeding one year did. */
export interface SeededYear {
  year: number;
  /** Days generated for the year. */
  days: number;
  added: number;
  updated: number;
  unchanged: number;
}

/** What a seed run did. */
export interface SeedSummary {
  /** The mosque's timezone, which decides what "this year" is. */
  timezone: string;
  /** Today's date on the mosque's calendar. */
  today: DateString;
  /** Days deleted by `--reset`, or null when no reset was asked for. */
  cleared: number | null;
  years: SeededYear[];
  /** Example announcements created; 0 when some already existed. */
  announcementsAdded: number;
  /** Announcements that were already there. */
  announcementsExisting: number;
  /** Extent of the stored timetable afterwards. */
  coverage: TimetableCoverage;
}

/**
 * Seeds the active database. Does not check `seedRefusal`; `main` does.
 * @param nowMs Clock, epoch milliseconds: decides which years are "this year and next".
 */
export async function runSeed(options: SeedOptions, nowMs: number = Date.now()): Promise<SeedSummary> {
  const settings = await getSettings();
  const timezone = resolveTimeZone(settings.timezone);
  const today = zonedNow(timezone, nowMs).date;
  const thisYear = yearOf(today);
  const years = options.year === null ? [thisYear, thisYear + 1] : [options.year];

  const cleared = options.reset ? await deletePrayerDays(EARLIEST_DATE, LATEST_DATE) : null;

  const seeded: SeededYear[] = [];
  for (const year of years) {
    const days = generateSampleDays(year, LONDON);
    // The default merge mode: notes and Jumu'ah times someone added to a seeded day survive a re-seed.
    const result = await upsertPrayerDays(days, { nowMs });
    seeded.push({
      year,
      days: days.length,
      added: result.added,
      updated: result.updated,
      unchanged: result.unchanged,
    });
  }

  const existing = await listAnnouncements();
  if (existing.length === 0) {
    for (const announcement of EXAMPLE_ANNOUNCEMENTS) await createAnnouncement(announcement, nowMs);
  }

  return {
    timezone,
    today,
    cleared,
    years: seeded,
    announcementsAdded: existing.length === 0 ? EXAMPLE_ANNOUNCEMENTS.length : 0,
    announcementsExisting: existing.length,
    coverage: await getCoverage(),
  };
}

/** The summary as the lines printed at the end of a run. */
export function formatSeedSummary(summary: SeedSummary, databaseUrl: string): string[] {
  const lines = [
    "Seeded the Uwais demo data.",
    `  Database       ${describeDatabase(databaseUrl)}`,
    `  Timezone       ${summary.timezone} (today is ${summary.today})`,
  ];
  if (summary.timezone !== LONDON.timezone) {
    lines.push(`                 The sample times are calculated for London, whatever the timezone.`);
  }
  if (summary.cleared !== null) {
    lines.push(`  Reset          ${summary.cleared} days deleted first`);
  }
  for (const year of summary.years) {
    lines.push(
      `  ${year.year}           ${year.days} days: ${year.added} added, ${year.updated} updated, ${year.unchanged} unchanged`,
    );
  }
  lines.push(
    summary.announcementsAdded > 0
      ? `  Announcements  ${summary.announcementsAdded} examples added`
      : `  Announcements  left alone (${summary.announcementsExisting} already there)`,
  );
  const { firstDate, lastDate, totalDays } = summary.coverage;
  lines.push(
    firstDate === null || lastDate === null
      ? "  Timetable      empty"
      : `  Timetable      ${totalDays} days, ${firstDate} to ${lastDate}`,
  );
  return lines;
}

/**
 * Runs the command: parses the arguments, applies the safety checks, seeds
 * and prints the summary.
 * @returns The process exit code: 0 on success, 1 when refused or failed.
 */
export async function main(args: readonly string[]): Promise<number> {
  const parsed = parseSeedArgs(args);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n\n${USAGE}\n`);
    return 1;
  }
  if (parsed.options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const { url } = readDatabaseConfig();
  const refusal = seedRefusal(parsed.options, url);
  if (refusal !== null) {
    process.stderr.write(`${refusal}\n`);
    return 1;
  }
  try {
    const summary = await runSeed(parsed.options);
    process.stdout.write(`${formatSeedSummary(summary, url).join("\n")}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Seeding failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    closeDatabase();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
