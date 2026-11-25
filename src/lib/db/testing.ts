/**
 * Test support: a throwaway SQLite database per test file. Import this from
 * tests only; application code has no use for it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client } from "@libsql/client";
import { openDatabase, setDatabase } from "./client";
import { ensureMigrated } from "./migrate";

/** A temporary database that is installed as the one every repository uses. */
export interface TestDatabase {
  /** The underlying client, for assertions that need raw SQL. */
  client: Client;
  /** Location of the SQLite file. */
  filePath: string;
  /** Closes the client, uninstalls it and deletes the file. Call it in `afterAll`. */
  close(): void;
}

/**
 * Creates an empty, fully migrated SQLite database in a fresh temporary
 * directory and makes the repositories use it until `close()` is called.
 *
 * A real file is used instead of `:memory:` because an in-memory database
 * has a single connection, which hides the locking behaviour the app relies
 * on when a transaction and a plain query overlap.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const directory = mkdtempSync(path.join(tmpdir(), "uwais-test-"));
  const filePath = path.join(directory, "test.db");
  const client = openDatabase({ url: `file:${filePath}` });
  setDatabase(client);
  await ensureMigrated(client);
  return {
    client,
    filePath,
    close() {
      setDatabase(null);
      client.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
