import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAnnouncement, listAnnouncements } from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import type { Announcement } from "@/lib/types";
import type { ActionFailure, AnnouncementResult, DeleteAnnouncementResult } from "../types";
import { createAnnouncementFrom, deleteAnnouncementById, updateAnnouncementFrom } from "./announcements";

const CREATED = Date.UTC(2026, 10, 25, 12);
const LATER = Date.UTC(2026, 10, 26, 9, 30);

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

/** The announcement of a call that is expected to have succeeded. */
function stored(result: AnnouncementResult): Announcement {
  if (!result.ok) throw new Error(`expected an announcement, got: ${result.error}`);
  return result.announcement;
}

/** The failure of a call that is expected to have been refused. */
function refused(result: AnnouncementResult | DeleteAnnouncementResult): ActionFailure {
  if (result.ok) throw new Error("expected a refusal");
  return result;
}

/** A form with the given text fields. */
function form(fields: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

/** A stored announcement shown from 1 to 10 March 2027. */
async function marchAnnouncement(): Promise<Announcement> {
  return createAnnouncement(
    { title: "Car park closed", body: "Use Mill Lane.", startsOn: "2027-03-01", endsOn: "2027-03-10" },
    CREATED,
  );
}

describe("createAnnouncementFrom", () => {
  it("stores an announcement from an object, with the defaults for what is left out", async () => {
    const announcement = stored(await createAnnouncementFrom({ title: "  Eid prayer at 8:00  " }, CREATED));

    expect(announcement).toMatchObject({
      title: "Eid prayer at 8:00",
      body: "",
      startsOn: null,
      endsOn: null,
      showOnSite: true,
      showOnTv: true,
      pinned: false,
    });
    expect(announcement.id).toBeGreaterThan(0);
    expect(announcement.createdAt).toBe(announcement.updatedAt);
    expect(await listAnnouncements()).toStrictEqual([announcement]);
  });

  it("stores every field of an object", async () => {
    const input = {
      title: "Ramadan timetable",
      body: "Printed copies are in the foyer.",
      startsOn: "2027-02-01",
      endsOn: "2027-03-10",
      showOnSite: true,
      showOnTv: false,
      pinned: true,
    };
    expect(stored(await createAnnouncementFrom(input, CREATED))).toMatchObject(input);
  });

  it("reads the form: ticked boxes are on, boxes a browser left out are off", async () => {
    const announcement = stored(
      await createAnnouncementFrom(
        form({
          title: " Car park closed ",
          body: "Use Mill Lane.\nThank you.",
          startsOn: " 2027-03-01 ",
          endsOn: "",
          showOnTv: "on",
        }),
        CREATED,
      ),
    );

    expect(announcement).toMatchObject({
      title: "Car park closed",
      body: "Use Mill Lane.\nThank you.",
      startsOn: "2027-03-01",
      endsOn: null,
      showOnSite: false,
      showOnTv: true,
      pinned: false,
    });
  });

  it("returns plain data that survives being sent to the browser", async () => {
    const result = await createAnnouncementFrom({ title: "Eid prayer" }, CREATED);
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });

  it.each([
    ["a missing title", {}, "title", "This field is required."],
    ["a blank title", { title: "   " }, "title", "Enter a title"],
    ["a title that is too long", { title: "x".repeat(121) }, "title", "Keep the title under 120 characters"],
    ["text that is too long", { title: "Eid", body: "x".repeat(601) }, "body", "Keep the text under 600 characters"],
    ["a first day that is not a date", { title: "Eid", startsOn: "1 March" }, "startsOn", "Enter a date as YYYY-MM-DD"],
    ["a last day that does not exist", { title: "Eid", endsOn: "2027-02-30" }, "endsOn", "Enter a date as YYYY-MM-DD"],
    [
      "a last day before the first",
      { title: "Eid", startsOn: "2027-03-10", endsOn: "2027-03-01" },
      "endsOn",
      "The last day must not be before the first day",
    ],
    ["text for a switch", { title: "Eid", pinned: "yes" }, "pinned", "This value is not valid."],
  ])("refuses %s and stores nothing", async (_name, input, field, message) => {
    const failed = refused(await createAnnouncementFrom(input, CREATED));

    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toStrictEqual({ [field]: message });
    expect(await listAnnouncements()).toStrictEqual([]);
  });

  it("names the field in the summary", async () => {
    const failed = refused(
      await createAnnouncementFrom(form({ title: "", startsOn: "2027-03-10", endsOn: "soon" }), CREATED),
    );
    expect(failed.fieldErrors).toStrictEqual({
      title: "Enter a title",
      endsOn: "Enter a date as YYYY-MM-DD",
    });
    expect(failed.error).toBe("Title: Enter a title. 1 more field needs attention.");
  });

  it("asks for a title when the form has none", async () => {
    const failed = refused(await createAnnouncementFrom(new FormData(), CREATED));
    expect(failed.fieldErrors).toStrictEqual({ title: "This field is required." });
  });

  it.each([
    ["null", null],
    ["nothing", undefined],
    ["text", "Eid prayer"],
    ["a list", [{ title: "Eid prayer" }]],
  ])("refuses %s in place of an announcement", async (_name, payload) => {
    const failed = refused(await createAnnouncementFrom(payload, CREATED));
    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toBeUndefined();
    expect(failed.error).toMatch(/could not be read/);
  });
});

describe("updateAnnouncementFrom", () => {
  it("changes only the fields an object carries", async () => {
    const before = await marchAnnouncement();

    const after = stored(await updateAnnouncementFrom(before.id, { pinned: true }, LATER));

    expect(after).toStrictEqual({ ...before, pinned: true, updatedAt: after.updatedAt });
    expect(after.updatedAt).not.toBe(before.updatedAt);
    expect(await listAnnouncements()).toStrictEqual([after]);
  });

  it("clears a date that is sent blank or null", async () => {
    const before = await marchAnnouncement();
    const after = stored(await updateAnnouncementFrom(before.id, { startsOn: "", endsOn: null }, LATER));
    expect(after.startsOn).toBeNull();
    expect(after.endsOn).toBeNull();
  });

  it("takes the form as the whole announcement", async () => {
    const before = await marchAnnouncement();

    const after = stored(
      await updateAnnouncementFrom(
        before.id,
        form({ title: "Car park open again", body: "", startsOn: "", endsOn: "", pinned: "on" }),
        LATER,
      ),
    );

    expect(after).toMatchObject({
      id: before.id,
      title: "Car park open again",
      body: "",
      startsOn: null,
      endsOn: null,
      showOnSite: false,
      showOnTv: false,
      pinned: true,
    });
  });

  it("checks a new date against the stored one it is not replacing", async () => {
    const before = await marchAnnouncement();

    const failed = refused(await updateAnnouncementFrom(before.id, { endsOn: "2027-02-20" }, LATER));

    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toStrictEqual({ endsOn: "The last day must not be before the first day" });
    expect(failed.error).toBe("Last day: The last day must not be before the first day.");
    expect(await listAnnouncements()).toStrictEqual([before]);
  });

  it.each([
    ["a blank title", { title: " " }, "title", "Enter a title"],
    ["a null title", { title: null }, "title", "This field is required."],
    ["a date that is not a date", { startsOn: "tomorrow" }, "startsOn", "Enter a date as YYYY-MM-DD"],
    [
      "dates in the wrong order",
      { startsOn: "2027-05-02", endsOn: "2027-05-01" },
      "endsOn",
      "The last day must not be before the first day",
    ],
  ])("refuses %s and changes nothing", async (_name, patch, field, message) => {
    const before = await marchAnnouncement();
    const failed = refused(await updateAnnouncementFrom(before.id, patch, LATER));

    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toStrictEqual({ [field]: message });
    expect(await listAnnouncements()).toStrictEqual([before]);
  });

  it("says so when the announcement no longer exists", async () => {
    const before = await marchAnnouncement();
    const missing = refused(await updateAnnouncementFrom(before.id + 1, { pinned: true }, LATER));

    expect(missing.code).toBe("not-found");
    expect(missing.error).toMatch(/no longer exists/);
    expect(await listAnnouncements()).toStrictEqual([before]);
  });

  it.each([
    ["zero", 0],
    ["a negative number", -1],
    ["a fraction", 1.5],
    ["text", "1"],
    ["not a number", Number.NaN],
    ["null", null],
    ["nothing", undefined],
    ["an object", { id: 1 }],
  ])("treats %s as the id of no announcement", async (_name, id) => {
    const before = await marchAnnouncement();
    expect(refused(await updateAnnouncementFrom(id, { pinned: true }, LATER)).code).toBe("not-found");
    expect(refused(await deleteAnnouncementById(id)).code).toBe("not-found");
    expect(await listAnnouncements()).toStrictEqual([before]);
  });
});

describe("deleteAnnouncementById", () => {
  it("deletes the announcement and answers with its id", async () => {
    const first = await marchAnnouncement();
    const second = await createAnnouncement({ title: "Eid prayer at 8:00" }, CREATED);

    expect(await deleteAnnouncementById(first.id)).toStrictEqual({ ok: true, id: first.id });
    expect(await listAnnouncements()).toStrictEqual([second]);
  });

  it("says so when it was already deleted", async () => {
    const announcement = await marchAnnouncement();
    await deleteAnnouncementById(announcement.id);

    const again = refused(await deleteAnnouncementById(announcement.id));
    expect(again.code).toBe("not-found");
    expect(again.error).toMatch(/no longer exists/);
  });
});
