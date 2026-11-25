/**
 * Schema migrations. They are embedded in the bundle rather than read from
 * `.sql` files, because loose files do not survive serverless bundling or the
 * standalone Docker output.
 *
 * Migrations are append-only: never edit one that has shipped, add a new one.
 */

import type { Client } from "@libsql/client";
import type { Executor } from "./rows";

/** One ordered step in the history of the schema. */
export interface Migration {
  /** Position in the history, starting at 1 and increasing by one. */
  version: number;
  /** Short description, recorded next to the version. */
  name: string;
  /** Statements applied in order, inside one transaction. */
  statements: readonly string[];
}

const DATE_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]";

/** Every migration, oldest first. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "timetable, settings, announcements and import log",
    statements: [
      `CREATE TABLE prayer_days (
        date TEXT PRIMARY KEY CHECK (date GLOB '${DATE_GLOB}'),
        fajr_begins TEXT NULL,
        fajr_jamaat TEXT NULL,
        sunrise TEXT NULL,
        dhuhr_begins TEXT NULL,
        dhuhr_jamaat TEXT NULL,
        asr_begins TEXT NULL,
        asr_jamaat TEXT NULL,
        maghrib_begins TEXT NULL,
        maghrib_jamaat TEXT NULL,
        isha_begins TEXT NULL,
        isha_jamaat TEXT NULL,
        jumuah TEXT NOT NULL DEFAULT '[]',
        note TEXT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        starts_on TEXT NULL,
        ends_on TEXT NULL,
        show_on_site INTEGER NOT NULL DEFAULT 1,
        show_on_tv INTEGER NOT NULL DEFAULT 1,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE import_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        file_name TEXT NOT NULL,
        added INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        unchanged INTEGER NOT NULL,
        first_date TEXT NULL,
        last_date TEXT NULL,
        warnings INTEGER NOT NULL DEFAULT 0
      )`,
    ],
  },
];

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

/** Versions already recorded, or an empty set on a database that was never migrated. */
async function readAppliedVersions(executor: Executor): Promise<Set<number>> {
  const table = await executor.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  );
  if (table.rows.length === 0) return new Set();
  const result = await executor.execute("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => Number(row.version)));
}

/** Migrations from `migrations` that are not in `applied`, oldest first. */
function pendingMigrations(
  migrations: readonly Migration[],
  applied: ReadonlySet<number>,
): Migration[] {
  return migrations
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version);
}

/**
 * Brings a database up to date and returns the versions it applied (empty
 * when there was nothing to do). Safe to call repeatedly and from several
 * processes at once: the pending list is re-read inside a write transaction,
 * so two servers starting together cannot both apply the same step, and a
 * failing step rolls the whole run back.
 *
 * @param client     Database to migrate.
 * @param migrations Replaceable so the runner can be tested with its own history.
 */
export async function runMigrations(
  client: Client,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number[]> {
  // The common case, an up-to-date database, must not take a write lock.
  if (pendingMigrations(migrations, await readAppliedVersions(client)).length === 0) return [];

  const transaction = await client.transaction("write");
  try {
    await transaction.execute(CREATE_MIGRATIONS_TABLE);
    const pending = pendingMigrations(migrations, await readAppliedVersions(transaction));
    for (const migration of pending) {
      for (const statement of migration.statements) await transaction.execute(statement);
      await transaction.execute({
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        args: [migration.version, migration.name, new Date().toISOString()],
      });
    }
    await transaction.commit();
    return pending.map((migration) => migration.version);
  } finally {
    transaction.close();
  }
}

/** One in-flight or finished migration run per client. */
const migrationRuns = new WeakMap<Client, Promise<void>>();

/**
 * Resolves once the client's database is on the latest schema. The first call
 * starts the migration and every concurrent or later call shares its promise,
 * so the work happens once per process. A failed run is forgotten, which lets
 * the next request try again instead of leaving the process broken for good.
 */
export function ensureMigrated(client: Client): Promise<void> {
  const existing = migrationRuns.get(client);
  if (existing) return existing;
  const run = runMigrations(client).then(
    () => undefined,
    (error: unknown) => {
      migrationRuns.delete(client);
      throw error;
    },
  );
  migrationRuns.set(client, run);
  return run;
}
