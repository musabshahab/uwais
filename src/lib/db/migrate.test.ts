import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./client";
import { MIGRATIONS, ensureMigrated, runMigrations, type Migration } from "./migrate";

let directory: string;
let client: Client;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "uwais-migrate-"));
  client = openDatabase({ url: `file:${path.join(directory, "m.db")}` });
});

afterEach(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
});

async function tableNames(db: Client): Promise<string[]> {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows.map((row) => String(row.name));
}

async function appliedVersions(db: Client): Promise<number[]> {
  const result = await db.execute("SELECT version FROM schema_migrations ORDER BY version");
  return result.rows.map((row) => Number(row.version));
}

describe("MIGRATIONS", () => {
  it("is numbered 1, 2, 3, ... without gaps", () => {
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual(
      MIGRATIONS.map((_, index) => index + 1),
    );
  });
});

describe("runMigrations", () => {
  it("creates the schema on an empty database and records each version", async () => {
    const applied = await runMigrations(client);

    expect(applied).toEqual(MIGRATIONS.map((migration) => migration.version));
    expect(await tableNames(client)).toEqual([
      "announcements",
      "import_log",
      "prayer_days",
      "schema_migrations",
      "settings",
    ]);
    expect(await appliedVersions(client)).toEqual(applied);
  });

  it("does nothing the second time", async () => {
    await runMigrations(client);
    await client.execute(
      "INSERT INTO prayer_days (date, updated_at) VALUES ('2026-11-25', '2026-11-25T00:00:00.000Z')",
    );

    expect(await runMigrations(client)).toEqual([]);

    const rows = await client.execute("SELECT date FROM prayer_days");
    expect(rows.rows).toHaveLength(1);
    expect(await appliedVersions(client)).toHaveLength(MIGRATIONS.length);
  });

  it("applies only the steps that are still pending, in version order", async () => {
    await runMigrations(client);
    const extended: Migration[] = [
      {
        version: MIGRATIONS.length + 2,
        name: "second extra",
        statements: ["INSERT INTO extra (id) VALUES (1)"],
      },
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        name: "first extra",
        statements: ["CREATE TABLE extra (id INTEGER PRIMARY KEY)"],
      },
    ];

    expect(await runMigrations(client, extended)).toEqual([
      MIGRATIONS.length + 1,
      MIGRATIONS.length + 2,
    ]);
    expect((await client.execute("SELECT id FROM extra")).rows).toHaveLength(1);
  });

  it("rolls the whole run back when a step fails", async () => {
    const broken: Migration[] = [
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        name: "broken",
        statements: ["CREATE TABLE half_done (id INTEGER)", "THIS IS NOT SQL"],
      },
    ];

    await expect(runMigrations(client, broken)).rejects.toThrow();

    // Nothing from the failed run may remain, not even the steps before the bad one.
    expect(await tableNames(client)).toEqual([]);
    expect(await runMigrations(client)).toEqual(MIGRATIONS.map((migration) => migration.version));
  });

  it("applies nothing when another process migrates between its check and its transaction", async () => {
    const other = openDatabase({ url: `file:${path.join(directory, "m.db")}` });
    let raced = false;
    // Lets the first read report "nothing applied", then has a second
    // connection finish the whole migration before the runner starts writing.
    const racing = new Proxy(client, {
      get(target, property) {
        if (property !== "execute") {
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return async (...args: Parameters<Client["execute"]>) => {
          const stale = await target.execute(...args);
          if (!raced) {
            raced = true;
            await runMigrations(other);
          }
          return stale;
        };
      },
    });

    try {
      expect(await runMigrations(racing)).toEqual([]);
      expect(await appliedVersions(client)).toEqual(MIGRATIONS.map((m) => m.version));
    } finally {
      other.close();
    }
  });

  it("rejects a date that is not shaped like YYYY-MM-DD at the database level", async () => {
    await runMigrations(client);

    await expect(
      client.execute(
        "INSERT INTO prayer_days (date, updated_at) VALUES ('25/11/2026', '2026-11-25T00:00:00.000Z')",
      ),
    ).rejects.toThrow(/CHECK/i);
  });
});

describe("ensureMigrated", () => {
  it("shares one run between concurrent callers", async () => {
    const first = ensureMigrated(client);
    const second = ensureMigrated(client);

    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(await appliedVersions(client)).toHaveLength(MIGRATIONS.length);
  });

  it("forgets a failed run so the next call can try again", async () => {
    const file = path.join(directory, "m.db");
    client.close();

    await expect(ensureMigrated(client)).rejects.toThrow();

    client.reconnect();
    await expect(ensureMigrated(client)).resolves.toBeUndefined();
    expect(existsSync(file)).toBe(true);
    expect(await tableNames(client)).toContain("prayer_days");
  });
});
