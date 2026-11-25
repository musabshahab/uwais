import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { DEFAULT_IMPORT_LOG_LIMIT, addImportLog, listImportLog } from "./import-log";
import { MAX_IMPORT_LOG_LIMIT } from "./schemas";
import { createTestDatabase, type TestDatabase } from "./testing";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  await database.client.execute("DELETE FROM import_log");
});

const entry = {
  fileName: "timetable-2027.xlsx",
  added: 300,
  updated: 60,
  unchanged: 5,
  firstDate: "2027-01-01",
  lastDate: "2027-12-31",
  warnings: 2,
};

describe("addImportLog", () => {
  it("stores an entry and returns it with its id and time", async () => {
    const stored = await addImportLog(entry, Date.UTC(2026, 10, 25, 9, 30));

    expect(stored).toEqual({
      id: expect.any(Number),
      createdAt: "2026-11-25T09:30:00.000Z",
      ...entry,
    });
    expect(await listImportLog()).toEqual([stored]);
  });

  it("stores an import that held no days", async () => {
    const stored = await addImportLog({ fileName: "empty.csv", added: 0, updated: 0, unchanged: 0 });

    expect(stored).toMatchObject({ firstDate: null, lastDate: null, warnings: 0 });
    expect((await listImportLog())[0]).toEqual(stored);
  });

  it("strips the folder from a file name", async () => {
    const stored = await addImportLog({ ...entry, fileName: "C:\\fakepath\\ramadan.csv" });
    expect(stored.fileName).toBe("ramadan.csv");
  });

  it("rejects an invalid entry", async () => {
    await expect(addImportLog({ ...entry, added: -1 })).rejects.toBeInstanceOf(ZodError);
    await expect(addImportLog({ ...entry, firstDate: "2027-02-30" })).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(await listImportLog()).toEqual([]);
  });
});

describe("listImportLog", () => {
  it("lists the newest import first", async () => {
    await addImportLog({ ...entry, fileName: "first.csv" }, 1_000);
    await addImportLog({ ...entry, fileName: "second.csv" }, 2_000);
    await addImportLog({ ...entry, fileName: "third.csv" }, 3_000);

    expect((await listImportLog()).map((item) => item.fileName)).toEqual([
      "third.csv",
      "second.csv",
      "first.csv",
    ]);
  });

  it("honours the limit and defaults to a short list", async () => {
    for (let index = 0; index < DEFAULT_IMPORT_LOG_LIMIT + 3; index++) {
      await addImportLog({ ...entry, fileName: `file-${index}.csv` }, index);
    }

    expect(await listImportLog()).toHaveLength(DEFAULT_IMPORT_LOG_LIMIT);
    expect((await listImportLog(2)).map((item) => item.fileName)).toEqual([
      `file-${DEFAULT_IMPORT_LOG_LIMIT + 2}.csv`,
      `file-${DEFAULT_IMPORT_LOG_LIMIT + 1}.csv`,
    ]);
    expect(await listImportLog(MAX_IMPORT_LOG_LIMIT)).toHaveLength(DEFAULT_IMPORT_LOG_LIMIT + 3);
  });

  it.each([0, -5, 1.5, MAX_IMPORT_LOG_LIMIT + 1])("rejects a limit of %j", async (limit) => {
    await expect(listImportLog(limit)).rejects.toBeInstanceOf(ZodError);
  });
});
