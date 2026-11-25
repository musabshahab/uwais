import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  createAnnouncement,
  deleteAnnouncement,
  listActiveAnnouncements,
  listAnnouncements,
  updateAnnouncement,
} from "./announcements";
import { createTestDatabase, type TestDatabase } from "./testing";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  await database.client.execute("DELETE FROM announcements");
});

const NOON = Date.UTC(2026, 10, 25, 12);

async function titles(promise: Promise<{ title: string }[]>): Promise<string[]> {
  return (await promise).map((announcement) => announcement.title);
}

describe("createAnnouncement", () => {
  it("stores an announcement with its defaults and returns it", async () => {
    const created = await createAnnouncement({ title: "  Eid prayer  " }, NOON);

    expect(created).toEqual({
      id: expect.any(Number),
      title: "Eid prayer",
      body: "",
      startsOn: null,
      endsOn: null,
      showOnSite: true,
      showOnTv: true,
      pinned: false,
      createdAt: "2026-11-25T12:00:00.000Z",
      updatedAt: "2026-11-25T12:00:00.000Z",
    });
    expect(await listAnnouncements()).toEqual([created]);
  });

  it("round-trips every field", async () => {
    const created = await createAnnouncement(
      {
        title: "Car park closed",
        body: "Use the side entrance.\nApologies for the inconvenience.",
        startsOn: "2026-12-01",
        endsOn: "2026-12-05",
        showOnSite: false,
        showOnTv: true,
        pinned: true,
      },
      NOON,
    );

    expect((await listAnnouncements())[0]).toEqual(created);
    expect(created.body).toContain("\n");
    expect(created.showOnSite).toBe(false);
    expect(created.pinned).toBe(true);
  });

  it("gives each announcement its own id", async () => {
    const first = await createAnnouncement({ title: "One" });
    const second = await createAnnouncement({ title: "Two" });
    expect(second.id).toBeGreaterThan(first.id);
  });

  it("rejects invalid input without storing anything", async () => {
    await expect(createAnnouncement({ title: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(
      createAnnouncement({ title: "x", startsOn: "2026-12-05", endsOn: "2026-12-01" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(createAnnouncement({ title: "x", body: "b".repeat(601) })).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(await listAnnouncements()).toEqual([]);
  });
});

describe("ordering", () => {
  it("lists pinned announcements first, then the newest", async () => {
    await createAnnouncement({ title: "Old" }, NOON);
    await createAnnouncement({ title: "Old pinned", pinned: true }, NOON + 1_000);
    await createAnnouncement({ title: "New" }, NOON + 2_000);
    await createAnnouncement({ title: "New pinned", pinned: true }, NOON + 3_000);

    const expected = ["New pinned", "Old pinned", "New", "Old"];
    expect(await titles(listAnnouncements())).toEqual(expected);
    expect(
      await titles(listActiveAnnouncements({ from: "2026-11-25", to: "2026-11-25" })),
    ).toEqual(expected);
  });

  it("puts the later of two announcements created in the same instant first", async () => {
    await createAnnouncement({ title: "First" }, NOON);
    await createAnnouncement({ title: "Second" }, NOON);
    expect(await titles(listAnnouncements())).toEqual(["Second", "First"]);
  });
});

describe("listActiveAnnouncements", () => {
  const window = { from: "2026-11-24", to: "2026-12-30" };

  it("includes announcements whose range touches the window at either edge", async () => {
    await createAnnouncement({ title: "Ends on the first day", endsOn: "2026-11-24" });
    await createAnnouncement({ title: "Starts on the last day", startsOn: "2026-12-30" });
    await createAnnouncement({
      title: "Inside",
      startsOn: "2026-12-01",
      endsOn: "2026-12-02",
    });
    await createAnnouncement({
      title: "Covers the window",
      startsOn: "2026-01-01",
      endsOn: "2027-01-01",
    });
    await createAnnouncement({ title: "Open ended" });

    expect((await titles(listActiveAnnouncements(window))).sort()).toEqual([
      "Covers the window",
      "Ends on the first day",
      "Inside",
      "Open ended",
      "Starts on the last day",
    ]);
  });

  it("excludes announcements that ended before or start after the window", async () => {
    await createAnnouncement({ title: "Ended yesterday", endsOn: "2026-11-23" });
    await createAnnouncement({ title: "Starts too late", startsOn: "2026-12-31" });
    await createAnnouncement({
      title: "Long past",
      startsOn: "2025-01-01",
      endsOn: "2025-12-31",
    });

    expect(await listActiveAnnouncements(window)).toEqual([]);
  });

  it("filters by audience and never returns drafts", async () => {
    await createAnnouncement({ title: "Both" });
    await createAnnouncement({ title: "Site only", showOnTv: false });
    await createAnnouncement({ title: "TV only", showOnSite: false });
    await createAnnouncement({ title: "Draft", showOnSite: false, showOnTv: false });

    expect((await titles(listActiveAnnouncements({ ...window, audience: "site" }))).sort()).toEqual(
      ["Both", "Site only"],
    );
    expect((await titles(listActiveAnnouncements({ ...window, audience: "tv" }))).sort()).toEqual([
      "Both",
      "TV only",
    ]);
    expect((await titles(listActiveAnnouncements({ ...window, audience: "any" }))).sort()).toEqual(
      ["Both", "Site only", "TV only"],
    );
    expect((await titles(listActiveAnnouncements(window))).sort()).toEqual([
      "Both",
      "Site only",
      "TV only",
    ]);
    expect(await titles(listAnnouncements())).toContain("Draft");
  });

  it("works for a one-day window", async () => {
    await createAnnouncement({ title: "Today", startsOn: "2026-11-25", endsOn: "2026-11-25" });
    const day = (date: string) => titles(listActiveAnnouncements({ from: date, to: date }));

    expect(await day("2026-11-24")).toEqual([]);
    expect(await day("2026-11-25")).toEqual(["Today"]);
    expect(await day("2026-11-26")).toEqual([]);
  });

  it("rejects a reversed or malformed window", async () => {
    await expect(
      listActiveAnnouncements({ from: "2026-12-30", to: "2026-11-24" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      listActiveAnnouncements({ from: "24/11/2026", to: "2026-11-24" }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("updateAnnouncement", () => {
  it("changes only the given fields and bumps updatedAt", async () => {
    const created = await createAnnouncement(
      { title: "Original", body: "Text", startsOn: "2026-12-01", pinned: true },
      NOON,
    );

    const updated = await updateAnnouncement(created.id, { title: "Changed" }, NOON + 60_000);

    expect(updated).toEqual({
      ...created,
      title: "Changed",
      updatedAt: "2026-11-25T12:01:00.000Z",
    });
    expect(await listAnnouncements()).toEqual([updated]);
  });

  it("can clear a date and switch flags off", async () => {
    const created = await createAnnouncement({
      title: "Dated",
      startsOn: "2026-12-01",
      endsOn: "2026-12-05",
    });

    const updated = await updateAnnouncement(created.id, {
      endsOn: null,
      showOnTv: false,
      body: "",
    });

    expect(updated?.startsOn).toBe("2026-12-01");
    expect(updated?.endsOn).toBeNull();
    expect(updated?.showOnTv).toBe(false);
    expect(updated?.showOnSite).toBe(true);
  });

  it("checks the date order against the stored row", async () => {
    const created = await createAnnouncement({
      title: "Dated",
      startsOn: "2026-12-10",
      endsOn: "2026-12-20",
    });

    await expect(updateAnnouncement(created.id, { endsOn: "2026-12-09" })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(updateAnnouncement(created.id, { startsOn: "2026-12-21" })).rejects.toBeInstanceOf(
      ZodError,
    );
    expect((await listAnnouncements())[0]).toEqual(created);

    const moved = await updateAnnouncement(created.id, {
      startsOn: "2026-12-21",
      endsOn: "2026-12-22",
    });
    expect(moved?.startsOn).toBe("2026-12-21");
  });

  it("returns null for an id that does not exist", async () => {
    expect(await updateAnnouncement(999_999, { title: "Nobody" })).toBeNull();
  });

  it("rejects an id that cannot be a row id", async () => {
    await expect(updateAnnouncement(0, { title: "x" })).rejects.toBeInstanceOf(ZodError);
    await expect(updateAnnouncement(1.5, { title: "x" })).rejects.toBeInstanceOf(ZodError);
  });

  it("can still write after a rejected update", async () => {
    const created = await createAnnouncement({ title: "Kept" });
    await expect(updateAnnouncement(created.id, { title: "" })).rejects.toBeInstanceOf(ZodError);
    expect((await updateAnnouncement(created.id, { pinned: true }))?.pinned).toBe(true);
  });
});

describe("deleteAnnouncement", () => {
  it("deletes one announcement and reports whether it existed", async () => {
    const keep = await createAnnouncement({ title: "Keep" });
    const drop = await createAnnouncement({ title: "Drop" });

    expect(await deleteAnnouncement(drop.id)).toBe(true);
    expect(await deleteAnnouncement(drop.id)).toBe(false);
    expect(await listAnnouncements()).toEqual([keep]);
  });

  it("never reuses the id of a deleted announcement", async () => {
    const first = await createAnnouncement({ title: "First" });
    await deleteAnnouncement(first.id);
    const second = await createAnnouncement({ title: "Second" });
    expect(second.id).toBeGreaterThan(first.id);
  });
});
