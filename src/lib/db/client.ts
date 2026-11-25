/**
 * The database connection. One lazily created libSQL client per process:
 * a SQLite file for self-hosted installs, Turso (or any libSQL server) when
 * `DATABASE_URL` points at one.
 *
 * Nothing in `src/lib/db` touches Next.js request APIs, so the repositories
 * also work in unit tests and in command-line scripts.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createClient,
  type Client,
  type InStatement,
  type ResultSet,
  type Transaction,
} from "@libsql/client";
import { ensureMigrated } from "./migrate";

/** Where the timetable lives when `DATABASE_URL` is not set. */
export const DEFAULT_DATABASE_URL = "file:./data/uwais.db";

/**
 * How long a statement waits for a lock held by ANOTHER process on a local
 * SQLite file before it fails (a second server instance, a backup tool).
 * Writers inside this process never wait on each other this way; see
 * `withWriteTransaction`.
 */
const BUSY_TIMEOUT_MS = 5000;

/** Connection details for a database. */
export interface DatabaseConfig {
  /** A `file:`, `libsql:`, `http(s):` or `ws(s):` URL. */
  url: string;
  /** Auth token for a remote database. */
  authToken?: string;
}

/**
 * Reads the connection details from the environment: `DATABASE_URL` (default
 * `file:./data/uwais.db`) and the optional `DATABASE_AUTH_TOKEN`.
 */
export function readDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DatabaseConfig {
  const url = env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  const authToken = env.DATABASE_AUTH_TOKEN?.trim();
  return authToken ? { url, authToken } : { url };
}

/**
 * The file a `file:` URL stores its data in, as the URL spells it (relative
 * paths are relative to the working directory). Returns null for remote and
 * in-memory databases, which have no file of their own.
 */
export function databaseFilePath(url: string): string | null {
  if (!/^file:/i.test(url)) return null;
  const rest = url.slice("file:".length);
  const queryStart = rest.indexOf("?");
  const query = queryStart === -1 ? "" : rest.slice(queryStart + 1);
  let filePath = queryStart === -1 ? rest : rest.slice(0, queryStart);
  if (filePath === ":memory:" || /(^|&)mode=memory(&|$)/.test(query)) return null;
  // `file:///abs/x.db` and `file://localhost/abs/x.db` carry an authority.
  if (filePath.startsWith("//")) {
    const pathStart = filePath.indexOf("/", 2);
    filePath = pathStart === -1 ? "" : filePath.slice(pathStart);
  }
  return filePath === "" ? null : filePath;
}

/**
 * Opens a client for the given database. For a local file the parent
 * directory is created first, because SQLite creates the file but not the
 * folder, and a fresh checkout or a new Docker volume has neither.
 */
export function openDatabase(config: DatabaseConfig): Client {
  const filePath = databaseFilePath(config.url);
  if (filePath !== null) {
    // The comment stops the bundler from tracing the whole project into the
    // server bundle on account of a path it cannot know before runtime.
    const absolute = path.resolve(/* turbopackIgnore: true */ filePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
  }
  return createClient({
    url: config.url,
    authToken: config.authToken,
    intMode: "number",
    timeout: BUSY_TIMEOUT_MS,
  });
}

/** Process-wide database state. */
interface DatabaseState {
  /** The open client, once something has asked for it. */
  client?: Client;
  /** Settles when the last queued write has finished; see `withWriteLock`. */
  lastWrite: Promise<void>;
}

/**
 * The state lives on `globalThis` because the development server re-evaluates
 * modules on every edit; a module-level variable would open a new connection
 * pool each time and split the write queue in two.
 */
const STATE_KEY = Symbol.for("uwais.database");

type GlobalWithDatabase = typeof globalThis & { [STATE_KEY]?: DatabaseState };

/** The shared state, created on first use. */
function databaseState(): DatabaseState {
  const scope = globalThis as GlobalWithDatabase;
  let state = scope[STATE_KEY];
  if (!state) {
    state = { lastWrite: Promise.resolve() };
    scope[STATE_KEY] = state;
  }
  return state;
}

/**
 * Makes `client` the database every repository uses, or clears the slot with
 * `null` so the next query opens the configured database again. The previous
 * client is not closed. Meant for tests and scripts that bring their own
 * database; application code never needs it.
 */
export function setDatabase(client: Client | null): void {
  const state = databaseState();
  if (client === null) delete state.client;
  else state.client = client;
}

/** The process-wide client, opened from the environment on first use. Not yet migrated. */
function currentClient(): Client {
  const state = databaseState();
  if (state.client && !state.client.closed) return state.client;
  const client = openDatabase(readDatabaseConfig());
  state.client = client;
  return client;
}

/**
 * The database, ready for queries: the schema migrations have been applied
 * before this resolves. Every repository starts with this call.
 */
export async function getDb(): Promise<Client> {
  const client = currentClient();
  await ensureMigrated(client);
  return client;
}

/**
 * Proves the database answers a trivial query.
 * @throws when the database cannot be opened, migrated or queried.
 */
export async function pingDatabase(): Promise<void> {
  const client = await getDb();
  await client.execute("SELECT 1");
}

/**
 * Runs `work` once every write queued before it has finished.
 *
 * The local SQLite driver is synchronous under its promise API. If a second
 * writer started while a transaction was open, it would sit in SQLite's busy
 * handler and block the event loop, so the first transaction could never
 * finish: both would stall until the timeout and the second would fail.
 * Queueing writers here keeps them from ever meeting inside one process.
 */
function withWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const state = databaseState();
  const run = state.lastWrite.then(work);
  state.lastWrite = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Runs `work` inside a write transaction and commits when it resolves. If it
 * throws, everything it did is rolled back and the error is passed on.
 * Writes are queued, one at a time per process.
 *
 * Inside `work`, use only the transaction it is given. Calling another
 * writing function of this module from inside would wait on itself forever.
 */
export async function withWriteTransaction<T>(
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  return withWriteLock(async () => {
    const transaction = await db.transaction("write");
    try {
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } finally {
      // A no-op after a commit; after a failure this is the rollback.
      transaction.close();
    }
  });
}

/**
 * Runs a single writing statement, queued behind any write in progress.
 * Use this for every INSERT, UPDATE or DELETE that does not need a transaction.
 */
export async function executeWrite(statement: InStatement): Promise<ResultSet> {
  const db = await getDb();
  return withWriteLock(() => db.execute(statement));
}

/**
 * Closes the process-wide client, if one is open. The next query opens a new
 * one. For scripts that must exit cleanly and for test teardown.
 */
export function closeDatabase(): void {
  const state = databaseState();
  const existing = state.client;
  delete state.client;
  if (existing && !existing.closed) existing.close();
}
