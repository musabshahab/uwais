/**
 * The database layer: connection, migrations, validation schemas and the
 * repositories. Import from `@/lib/db`.
 *
 * Nothing here depends on a Next.js request, so the same functions serve
 * pages, Server Actions, route handlers, unit tests and scripts. Inside the
 * app, read through the loaders in `@/lib/server/data`, which decide when a
 * read is allowed to happen; call the repositories directly only to write.
 */

export * from "./announcements";
export {
  DEFAULT_DATABASE_URL,
  closeDatabase,
  databaseFilePath,
  executeWrite,
  getDb,
  openDatabase,
  pingDatabase,
  readDatabaseConfig,
  setDatabase,
  withWriteTransaction,
  type DatabaseConfig,
} from "./client";
export * from "./import-log";
export { MIGRATIONS, ensureMigrated, runMigrations, type Migration } from "./migrate";
export * from "./prayer-days";
export * from "./schemas";
export * from "./settings";
