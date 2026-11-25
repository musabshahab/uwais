import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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
} from "./client";

describe("readDatabaseConfig", () => {
  it("defaults to the local SQLite file", () => {
    expect(readDatabaseConfig({})).toEqual({ url: DEFAULT_DATABASE_URL });
    expect(readDatabaseConfig({ DATABASE_URL: "  " })).toEqual({ url: DEFAULT_DATABASE_URL });
  });

  it("reads the URL and the optional token", () => {
    expect(
      readDatabaseConfig({ DATABASE_URL: "libsql://x.turso.io", DATABASE_AUTH_TOKEN: " t0k3n " }),
    ).toEqual({ url: "libsql://x.turso.io", authToken: "t0k3n" });
    expect(readDatabaseConfig({ DATABASE_URL: "file:/data/a.db", DATABASE_AUTH_TOKEN: "" })).toEqual(
      { url: "file:/data/a.db" },
    );
  });
});

describe("databaseFilePath", () => {
  it.each([
    ["file:./data/uwais.db", "./data/uwais.db"],
    ["file:data/uwais.db", "data/uwais.db"],
    ["file:/data/uwais.db", "/data/uwais.db"],
    ["file:///data/uwais.db", "/data/uwais.db"],
    ["file://localhost/data/uwais.db", "/data/uwais.db"],
    ["file:./data/uwais.db?cache=shared", "./data/uwais.db"],
  ])("finds the file of %s", (url, expected) => {
    expect(databaseFilePath(url)).toBe(expected);
  });

  it.each([
    "libsql://example.turso.io",
    "https://example.turso.io",
    "wss://example.turso.io",
    "file::memory:",
    "file::memory:?cache=shared",
    "file:shared?mode=memory&cache=shared",
  ])("has no file for %s", (url) => {
    expect(databaseFilePath(url)).toBeNull();
  });
});

describe("the process-wide database", () => {
  let directory: string;
  const savedUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "uwais-client-"));
  });

  afterEach(() => {
    closeDatabase();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates the missing parent folders of a database file", async () => {
    const file = path.join(directory, "nested", "deeper", "site.db");
    const client = openDatabase({ url: `file:${file}` });
    try {
      await client.execute("SELECT 1");
      expect(existsSync(file)).toBe(true);
    } finally {
      client.close();
    }
  });

  it("opens DATABASE_URL lazily, migrates it and reuses the client", async () => {
    const file = path.join(directory, "lazy", "site.db");
    process.env.DATABASE_URL = `file:${file}`;
    expect(existsSync(file)).toBe(false);

    const first = await getDb();
    const second = await getDb();

    expect(second).toBe(first);
    expect(existsSync(file)).toBe(true);
    const tables = await first.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'prayer_days'",
    );
    expect(tables.rows).toHaveLength(1);
    await expect(pingDatabase()).resolves.toBeUndefined();
  });

  it("opens a fresh client after the previous one was closed", async () => {
    process.env.DATABASE_URL = `file:${path.join(directory, "site.db")}`;
    const first = await getDb();
    closeDatabase();
    expect(first.closed).toBe(true);

    const second = await getDb();

    expect(second).not.toBe(first);
    expect(second.closed).toBe(false);
  });

  it("uses an installed client instead of the environment", async () => {
    process.env.DATABASE_URL = `file:${path.join(directory, "from-env.db")}`;
    const own = openDatabase({ url: `file:${path.join(directory, "own.db")}` });
    setDatabase(own);

    expect(await getDb()).toBe(own);
    expect(existsSync(path.join(directory, "from-env.db"))).toBe(false);
  });

  it("reports a database that cannot be opened", async () => {
    // A directory where the file should be: SQLite cannot open it.
    process.env.DATABASE_URL = `file:${directory}`;
    await expect(pingDatabase()).rejects.toThrow();
  });

  describe("writes", () => {
    beforeEach(async () => {
      process.env.DATABASE_URL = `file:${path.join(directory, "writes.db")}`;
      const db = await getDb();
      await db.execute("CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)");
      await db.execute("INSERT INTO counter (id, value) VALUES (1, 0)");
    });

    async function counterValue(): Promise<number> {
      const db = await getDb();
      return Number((await db.execute("SELECT value FROM counter WHERE id = 1")).rows[0].value);
    }

    it("commits a transaction that resolves", async () => {
      const result = await withWriteTransaction(async (transaction) => {
        await transaction.execute("UPDATE counter SET value = 5 WHERE id = 1");
        return "done";
      });

      expect(result).toBe("done");
      expect(await counterValue()).toBe(5);
    });

    it("rolls a transaction back when the work throws", async () => {
      await expect(
        withWriteTransaction(async (transaction) => {
          await transaction.execute("UPDATE counter SET value = 9 WHERE id = 1");
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(await counterValue()).toBe(0);
    });

    it("queues overlapping writers instead of letting them collide", async () => {
      // Each transaction reads, yields to the event loop, then writes. Without
      // the queue the second writer would block on the first one's lock.
      const increment = () =>
        withWriteTransaction(async (transaction) => {
          const current = await transaction.execute("SELECT value FROM counter WHERE id = 1");
          await new Promise((resolve) => setTimeout(resolve, 5));
          await transaction.execute({
            sql: "UPDATE counter SET value = ? WHERE id = 1",
            args: [Number(current.rows[0].value) + 1],
          });
        });

      await Promise.all([
        increment(),
        increment(),
        executeWrite("UPDATE counter SET value = value + 10 WHERE id = 1"),
        increment(),
      ]);

      expect(await counterValue()).toBe(13);
    });

    it("keeps serving writes after one of them failed", async () => {
      await expect(executeWrite("INSERT INTO missing_table VALUES (1)")).rejects.toThrow();

      await executeWrite("UPDATE counter SET value = 2 WHERE id = 1");
      expect(await counterValue()).toBe(2);
    });

    it("lets reads through while a transaction is open", async () => {
      await withWriteTransaction(async (transaction) => {
        await transaction.execute("UPDATE counter SET value = 7 WHERE id = 1");
        // Uncommitted changes are invisible outside, but the read must not block.
        expect(await counterValue()).toBe(0);
      });
      expect(await counterValue()).toBe(7);
    });
  });
});
