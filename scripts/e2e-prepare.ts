/**
 * Prepares the throwaway database for an end-to-end test run: removes the
 * previous run's file, so every run starts from the same state, then fills
 * in the sample timetable for the year the tests' clock stands in and the
 * year after.
 *
 * Playwright's web server command runs this before the build (see
 * `playwright.config.ts`). It is not for real data: it only ever touches a
 * local database file whose name contains "e2e".
 */
import fs from "node:fs";
import path from "node:path";
import { closeDatabase, databaseFilePath, readDatabaseConfig } from "../src/lib/db/client";
import { serverNowMs } from "../src/lib/server/clock";
import { formatSeedSummary, runSeed } from "./seed";

/** Files SQLite keeps beside a database. */
const SIDE_FILES = ["", "-wal", "-shm", "-journal"];

/**
 * The file an end-to-end database lives in, or the reason this script will
 * not touch the configured database.
 */
export function e2eDatabaseFile(databaseUrl: string): { ok: true; file: string } | { ok: false; reason: string } {
  const file = databaseFilePath(databaseUrl);
  if (file === null) {
    return { ok: false, reason: `"${databaseUrl}" is not a local database file.` };
  }
  if (!path.basename(file).toLowerCase().includes("e2e")) {
    return { ok: false, reason: `"${file}" is not named as an end-to-end database (its name must contain "e2e").` };
  }
  return { ok: true, file: path.resolve(file) };
}

async function main(): Promise<number> {
  const { url } = readDatabaseConfig();
  const target = e2eDatabaseFile(url);
  if (!target.ok) {
    process.stderr.write(`Refusing to prepare the end-to-end database: ${target.reason}\n`);
    return 1;
  }
  for (const suffix of SIDE_FILES) fs.rmSync(`${target.file}${suffix}`, { force: true });

  try {
    const summary = await runSeed({ year: null, reset: false, yes: false, force: false, help: false }, serverNowMs());
    process.stdout.write(`${formatSeedSummary(summary, url).join("\n")}\n`);
    return 0;
  } finally {
    closeDatabase();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
