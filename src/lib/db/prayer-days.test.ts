import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { addDays, listDates } from "@/lib/time";
import type { PrayerDay } from "@/lib/types";
import {
  deletePrayerDays,
  findMissingDates,
  getAllPrayerDays,
  getCoverage,
  getPrayerDay,
  getPrayerDays,
  mergePrayerDay,
  planUpsert,
  prayerDaysEqual,
  previewUpsertPrayerDays,
  upsertPrayerDays,
} from "./prayer-days";
import { MAX_UPSERT_DAYS } from "./schemas";
import { createTestDatabase, type TestDatabase } from "./testing";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  await database.client.execute("DELETE FROM prayer_days");
});

/** A fully populated day; `overrides` replaces individual fields. */
function fullDay(date: string, overrides: Partial<PrayerDay> = {}): PrayerDay {
  return {
    date,
    fajrBegins: "05:42",
    fajrJamaat: "06:15",
    sunrise: "07:31",
    dhuhrBegins: "11:52",
    dhuhrJamaat: "12:30",
    asrBegins: "13:48",
    asrJamaat: "14:15",
    maghribBegins: "16:02",
    maghribJamaat: "16:07",
    ishaBegins: "17:46",
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

async function updatedAt(date: string): Promise<string> {
  const result = await database.client.execute({
    sql: "SELECT updated_at FROM prayer_days WHERE date = ?",
    args: [date],
  });
  return String(result.rows[0].updated_at);
}

describe("mergePrayerDay", () => {
  const stored = fullDay("2026-11-27", { jumuah: ["12:30", "13:30"], note: "Stored note" });
  const sparse = fullDay("2026-11-27", {
    fajrBegins: null,
    fajrJamaat: "06:30",
    sunrise: null,
    dhuhrBegins: null,
    dhuhrJamaat: null,
    asrBegins: null,
    asrJamaat: null,
    maghribBegins: null,
    maghribJamaat: null,
    ishaBegins: null,
    ishaJamaat: "20:00",
  });

  it("keeps stored values wherever the incoming day is blank in merge mode", () => {
    expect(mergePrayerDay(stored, sparse, "merge")).toEqual({
      ...stored,
      fajrJamaat: "06:30",
      ishaJamaat: "20:00",
    });
  });

  it("lets incoming Jumu'ah times and note win in merge mode", () => {
    const incoming = { ...sparse, jumuah: ["13:00"], note: "New note" };
    const merged = mergePrayerDay(stored, incoming, "merge");
    expect(merged.jumuah).toEqual(["13:00"]);
    expect(merged.note).toBe("New note");
  });

  it("overwrites the whole day in replace mode", () => {
    expect(mergePrayerDay(stored, sparse, "replace")).toEqual(sparse);
  });

  it("returns the incoming day when nothing is stored", () => {
    expect(mergePrayerDay(null, sparse, "merge")).toEqual(sparse);
  });

  it("does not modify its arguments", () => {
    const before = JSON.stringify([stored, sparse]);
    mergePrayerDay(stored, sparse, "merge");
    expect(JSON.stringify([stored, sparse])).toBe(before);
  });
});

describe("prayerDaysEqual", () => {
  it("compares every field", () => {
    const day = fullDay("2026-11-25", { jumuah: ["13:15"], note: "n" });
    expect(prayerDaysEqual(day, { ...day, jumuah: ["13:15"] })).toBe(true);
    expect(prayerDaysEqual(day, { ...day, ishaJamaat: "19:45" })).toBe(false);
    expect(prayerDaysEqual(day, { ...day, sunrise: null })).toBe(false);
    expect(prayerDaysEqual(day, { ...day, jumuah: [] })).toBe(false);
    expect(prayerDaysEqual(day, { ...day, jumuah: ["13:15", "14:00"] })).toBe(false);
    expect(prayerDaysEqual(day, { ...day, note: null })).toBe(false);
    expect(prayerDaysEqual(day, { ...day, date: "2026-11-26" })).toBe(false);
  });
});

describe("planUpsert", () => {
  it("classifies each day and writes only what changes", () => {
    const stored = [fullDay("2026-11-25"), fullDay("2026-11-26")];
    const incoming = [
      fullDay("2026-11-27"),
      fullDay("2026-11-26", { ishaJamaat: "19:45" }),
      fullDay("2026-11-25"),
    ];

    const plan = planUpsert(stored, incoming, "replace");

    expect(plan).toMatchObject({
      added: 1,
      updated: 1,
      unchanged: 1,
      firstDate: "2026-11-25",
      lastDate: "2026-11-27",
    });
    expect(plan.writes.map((day) => day.date)).toEqual(["2026-11-26", "2026-11-27"]);
  });

  it("lets the last entry for a repeated date win in replace mode", () => {
    const plan = planUpsert(
      [],
      [fullDay("2026-11-25", { note: "first" }), fullDay("2026-11-25", { note: "second" })],
      "replace",
    );
    expect(plan.added).toBe(1);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].note).toBe("second");
  });

  it("accumulates repeated dates in merge mode", () => {
    const blank = fullDay("2026-11-25", {
      fajrBegins: null,
      fajrJamaat: null,
      sunrise: null,
      dhuhrBegins: null,
      dhuhrJamaat: null,
      asrBegins: null,
      asrJamaat: null,
      maghribBegins: null,
      maghribJamaat: null,
      ishaBegins: null,
      ishaJamaat: null,
    });
    const plan = planUpsert(
      [],
      [
        { ...blank, fajrBegins: "05:00" },
        { ...blank, ishaJamaat: "20:00" },
      ],
      "merge",
    );
    expect(plan.writes).toEqual([{ ...blank, fajrBegins: "05:00", ishaJamaat: "20:00" }]);
  });

  it("reports an empty batch as nothing to do", () => {
    expect(planUpsert([fullDay("2026-11-25")], [], "merge")).toEqual({
      added: 0,
      updated: 0,
      unchanged: 0,
      firstDate: null,
      lastDate: null,
      writes: [],
    });
  });
});

describe("upsertPrayerDays", () => {
  it("stores new days and reads them back unchanged", async () => {
    const days = [
      fullDay("2026-11-27", { jumuah: ["12:30", "13:30"], note: "Jumu'ah" }),
      fullDay("2026-11-26"),
    ];

    const summary = await upsertPrayerDays(days);

    expect(summary).toEqual({
      added: 2,
      updated: 0,
      unchanged: 0,
      firstDate: "2026-11-26",
      lastDate: "2026-11-27",
    });
    expect(await getPrayerDay("2026-11-27")).toEqual(days[0]);
    expect(await getPrayerDay("2026-11-26")).toEqual(days[1]);
    expect(await getPrayerDay("2026-11-28")).toBeNull();
  });

  it("merges by default: a sheet with only jamaat times keeps the stored beginnings", async () => {
    await upsertPrayerDays([fullDay("2026-11-25")]);

    const summary = await upsertPrayerDays([
      { date: "2026-11-25", fajrJamaat: "06:30", ishaJamaat: "20:00" },
    ]);

    expect(summary).toMatchObject({ added: 0, updated: 1, unchanged: 0 });
    expect(await getPrayerDay("2026-11-25")).toEqual(
      fullDay("2026-11-25", { fajrJamaat: "06:30", ishaJamaat: "20:00" }),
    );
  });

  it("replaces the whole day when asked to", async () => {
    await upsertPrayerDays([fullDay("2026-11-25", { note: "old", jumuah: ["13:15"] })]);

    await upsertPrayerDays([{ date: "2026-11-25", fajrJamaat: "06:30" }], { mode: "replace" });

    const stored = await getPrayerDay("2026-11-25");
    expect(stored?.fajrJamaat).toBe("06:30");
    expect(stored?.fajrBegins).toBeNull();
    expect(stored?.ishaJamaat).toBeNull();
    expect(stored?.jumuah).toEqual([]);
    expect(stored?.note).toBeNull();
  });

  it("does not rewrite days that are already stored with the same values", async () => {
    await upsertPrayerDays([fullDay("2026-11-25"), fullDay("2026-11-26")], { nowMs: 1_000 });

    const summary = await upsertPrayerDays(
      [fullDay("2026-11-25"), fullDay("2026-11-26", { asrJamaat: "14:30" })],
      { nowMs: 2_000 },
    );

    expect(summary).toMatchObject({ added: 0, updated: 1, unchanged: 1 });
    expect(await updatedAt("2026-11-25")).toBe("1970-01-01T00:00:01.000Z");
    expect(await updatedAt("2026-11-26")).toBe("1970-01-01T00:00:02.000Z");
  });

  it("stores a whole year across several statements in one go", async () => {
    const dates = listDates("2028-01-01", "2028-12-31");
    expect(dates).toHaveLength(366);

    const summary = await upsertPrayerDays(dates.map((date) => fullDay(date)));

    expect(summary).toEqual({
      added: 366,
      updated: 0,
      unchanged: 0,
      firstDate: "2028-01-01",
      lastDate: "2028-12-31",
    });
    expect((await getAllPrayerDays()).map((day) => day.date)).toEqual(dates);
    expect(await getPrayerDay("2028-02-29")).toEqual(fullDay("2028-02-29"));
  });

  it("stores nothing at all when one day of the batch is invalid", async () => {
    await expect(
      upsertPrayerDays([fullDay("2026-11-25"), fullDay("2026-11-26", { asrBegins: "25:61" })]),
    ).rejects.toBeInstanceOf(ZodError);

    expect(await getAllPrayerDays()).toEqual([]);
  });

  it("rolls back every chunk when a later one fails in the database", async () => {
    await database.client.execute(
      `CREATE TRIGGER reject_day BEFORE INSERT ON prayer_days
       WHEN NEW.date = '2026-06-30'
       BEGIN SELECT RAISE(ABORT, 'rejected by test'); END`,
    );
    try {
      const dates = listDates("2026-01-01", "2026-06-30");
      await expect(upsertPrayerDays(dates.map((date) => fullDay(date)))).rejects.toThrow(
        /rejected by test/,
      );
      expect(await getAllPrayerDays()).toEqual([]);
    } finally {
      await database.client.execute("DROP TRIGGER reject_day");
    }
  });

  it("can write again after a failed batch", async () => {
    await expect(upsertPrayerDays([{ date: "not-a-date" }])).rejects.toBeInstanceOf(ZodError);
    await expect(upsertPrayerDays([fullDay("2026-11-25")])).resolves.toMatchObject({ added: 1 });
  });

  it("accepts an empty batch", async () => {
    expect(await upsertPrayerDays([])).toEqual({
      added: 0,
      updated: 0,
      unchanged: 0,
      firstDate: null,
      lastDate: null,
    });
  });

  it("refuses a batch above the size limit", async () => {
    const tooMany = new Array(MAX_UPSERT_DAYS + 1).fill({ date: "2026-11-25" });
    await expect(upsertPrayerDays(tooMany)).rejects.toBeInstanceOf(ZodError);
  });

  it("refuses an unknown mode", async () => {
    await expect(
      upsertPrayerDays([fullDay("2026-11-25")], { mode: "overwrite" as "replace" }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await getAllPrayerDays()).toEqual([]);
  });

  it("keeps concurrent imports from corrupting each other", async () => {
    const first = listDates("2026-01-01", "2026-03-31").map((date) => fullDay(date));
    const second = listDates("2026-03-01", "2026-05-31").map((date) =>
      fullDay(date, { note: "second" }),
    );

    const summaries = await Promise.all([upsertPrayerDays(first), upsertPrayerDays(second)]);

    expect(summaries[0].added + summaries[1].added).toBe(151);
    expect(await getAllPrayerDays()).toHaveLength(151);
    expect((await getPrayerDay("2026-03-15"))?.note).toBe("second");
  });
});

describe("previewUpsertPrayerDays", () => {
  it("predicts the summary without writing", async () => {
    await upsertPrayerDays([fullDay("2026-11-25"), fullDay("2026-11-26")]);
    const batch = [
      fullDay("2026-11-25"),
      fullDay("2026-11-26", { note: "changed" }),
      fullDay("2026-11-27"),
    ];

    const preview = await previewUpsertPrayerDays(batch);

    expect(preview).toEqual({
      added: 1,
      updated: 1,
      unchanged: 1,
      firstDate: "2026-11-25",
      lastDate: "2026-11-27",
    });
    expect(await getAllPrayerDays()).toHaveLength(2);
    expect(await upsertPrayerDays(batch)).toEqual(preview);
  });

  it("follows the mode", async () => {
    await upsertPrayerDays([fullDay("2026-11-25")]);
    const sparse = [{ date: "2026-11-25", fajrBegins: "05:42" }];

    expect(await previewUpsertPrayerDays(sparse)).toMatchObject({ updated: 0, unchanged: 1 });
    expect(await previewUpsertPrayerDays(sparse, { mode: "replace" })).toMatchObject({
      updated: 1,
      unchanged: 0,
    });
  });
});

describe("range queries", () => {
  beforeEach(async () => {
    await upsertPrayerDays(
      ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-30", "2026-12-01"].map((date) =>
        fullDay(date),
      ),
    );
  });

  it("returns the rows of an inclusive range in date order", async () => {
    const days = await getPrayerDays("2026-11-01", "2026-11-30");
    expect(days.map((day) => day.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-30"]);
  });

  it("returns a single day for a one-day range and nothing for a reversed one", async () => {
    expect(await getPrayerDays("2026-11-02", "2026-11-02")).toHaveLength(1);
    expect(await getPrayerDays("2026-11-30", "2026-11-01")).toEqual([]);
    expect(await getPrayerDays("2027-01-01", "2027-12-31")).toEqual([]);
  });

  it("rejects malformed dates", async () => {
    await expect(getPrayerDays("2026-11-1", "2026-11-30")).rejects.toBeInstanceOf(ZodError);
    await expect(getPrayerDay("yesterday")).rejects.toBeInstanceOf(ZodError);
  });

  it("deletes an inclusive range and reports how many rows went", async () => {
    expect(await deletePrayerDays("2026-11-01", "2026-11-30")).toBe(3);
    expect((await getAllPrayerDays()).map((day) => day.date)).toEqual([
      "2026-10-31",
      "2026-12-01",
    ]);
    expect(await deletePrayerDays("2026-11-01", "2026-11-30")).toBe(0);
  });

  it("refuses to delete a reversed range", async () => {
    await expect(deletePrayerDays("2026-12-01", "2026-10-31")).rejects.toBeInstanceOf(ZodError);
    expect(await getAllPrayerDays()).toHaveLength(5);
  });
});

describe("getCoverage", () => {
  it("is empty for an empty timetable", async () => {
    expect(await getCoverage()).toEqual({ firstDate: null, lastDate: null, totalDays: 0 });
  });

  it("reports the first and last day and the number of days", async () => {
    await upsertPrayerDays([
      fullDay("2026-12-31"),
      fullDay("2026-01-01"),
      fullDay("2026-06-15"),
    ]);
    expect(await getCoverage()).toEqual({
      firstDate: "2026-01-01",
      lastDate: "2026-12-31",
      totalDays: 3,
    });
  });

  it("ignores rows that carry no time at all", async () => {
    await upsertPrayerDays([
      fullDay("2026-06-15"),
      { date: "2026-01-01", note: "Blank row" },
      { date: "2026-12-31", jumuah: ["13:15"] },
    ]);
    expect(await getCoverage()).toEqual({
      firstDate: "2026-06-15",
      lastDate: "2026-06-15",
      totalDays: 1,
    });
  });

  it("counts a row with a single time", async () => {
    await upsertPrayerDays([{ date: "2026-03-01", ishaJamaat: "20:00" }]);
    expect((await getCoverage()).totalDays).toBe(1);
  });
});

describe("findMissingDates", () => {
  it("lists the gaps of a range in order", async () => {
    await upsertPrayerDays(
      ["2026-11-24", "2026-11-26", "2026-11-27"].map((date) => fullDay(date)),
    );
    expect(await findMissingDates("2026-11-24", "2026-11-29")).toEqual([
      "2026-11-25",
      "2026-11-28",
      "2026-11-29",
    ]);
  });

  it("returns every date of an empty timetable and none of a full range", async () => {
    expect(await findMissingDates("2026-02-27", "2026-03-01")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
    await upsertPrayerDays(listDates("2026-02-27", "2026-03-01").map((date) => fullDay(date)));
    expect(await findMissingDates("2026-02-27", "2026-03-01")).toEqual([]);
  });

  it("treats a row without times as missing", async () => {
    await upsertPrayerDays([{ date: "2026-11-25", note: "Times to follow" }]);
    expect(await findMissingDates("2026-11-25", "2026-11-25")).toEqual(["2026-11-25"]);
  });

  it("rejects a reversed range and one that is too long to enumerate", async () => {
    await expect(findMissingDates("2026-11-26", "2026-11-25")).rejects.toBeInstanceOf(ZodError);
    await expect(
      findMissingDates("2026-01-01", addDays("2026-01-01", MAX_UPSERT_DAYS)),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      findMissingDates("2026-01-01", addDays("2026-01-01", MAX_UPSERT_DAYS - 1)),
    ).resolves.toHaveLength(MAX_UPSERT_DAYS);
  });

  it("rejects a malformed date as a validation error", async () => {
    await expect(findMissingDates("2026-02-30", "2026-03-05")).rejects.toBeInstanceOf(ZodError);
    await expect(findMissingDates("2026-03-01", "next week")).rejects.toBeInstanceOf(ZodError);
  });
});

describe("rows edited outside the app", () => {
  it("drops malformed values instead of passing them to the screens", async () => {
    await database.client.execute({
      sql:
        "INSERT INTO prayer_days (date, fajr_begins, fajr_jamaat, jumuah, note, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
      args: ["2026-11-25", "5:42am", "06:15", '["13:15","soon",7]', "kept", "x"],
    });

    const day = await getPrayerDay("2026-11-25");

    expect(day?.fajrBegins).toBeNull();
    expect(day?.fajrJamaat).toBe("06:15");
    expect(day?.jumuah).toEqual(["13:15"]);
    expect(day?.note).toBe("kept");
  });

  it("reads a broken Jumu'ah column as no Jumu'ah times", async () => {
    await database.client.execute({
      sql: "INSERT INTO prayer_days (date, jumuah, updated_at) VALUES (?, ?, ?)",
      args: ["2026-11-27", "not json", "x"],
    });
    expect((await getPrayerDay("2026-11-27"))?.jumuah).toEqual([]);
  });
});
