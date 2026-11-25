import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_DAY_NOTE_LENGTH, getAllPrayerDays, getPrayerDay, upsertPrayerDays } from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { addDays } from "@/lib/time";
import {
  MAX_DELETE_RANGE_DAYS,
  type ActionFailure,
  type DeleteDaysResult,
  type SaveDayData,
  type SaveDayResult,
} from "../types";
import { fullDay, fullDays } from "./testing";
import { deleteDays, saveDay } from "./timetable";

/** A Friday. */
const FRIDAY = "2027-01-01";
/** The Saturday after it. */
const SATURDAY = "2027-01-02";

const NOW = Date.UTC(2026, 10, 25, 12);

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

/** The data of a save that is expected to have succeeded. */
function saved(result: SaveDayResult): SaveDayData {
  if (!result.ok) throw new Error(`expected a saved day, got: ${result.error}`);
  return result;
}

/** The failure of a call that is expected to have been refused. */
function refused(result: SaveDayResult | DeleteDaysResult): ActionFailure {
  if (result.ok) throw new Error("expected a refusal");
  return result;
}

describe("saveDay", () => {
  it("adds a new day and returns it as stored", async () => {
    const result = saved(await saveDay(fullDay(SATURDAY), NOW));

    expect(result.outcome).toBe("added");
    expect(result.warnings).toStrictEqual([]);
    expect(result.day).toStrictEqual(fullDay(SATURDAY));
    expect(await getPrayerDay(SATURDAY)).toStrictEqual(fullDay(SATURDAY));
  });

  it("reports a change as updated and the same day again as unchanged", async () => {
    await saveDay(fullDay(SATURDAY), NOW);

    const changed = saved(await saveDay(fullDay(SATURDAY, { ishaJamaat: "19:45" }), NOW));
    expect(changed.outcome).toBe("updated");
    expect((await getPrayerDay(SATURDAY))?.ishaJamaat).toBe("19:45");

    const again = saved(await saveDay(fullDay(SATURDAY, { ishaJamaat: "19:45" }), NOW));
    expect(again.outcome).toBe("unchanged");
  });

  it("stores the day exactly as given: what is blank or left out is cleared", async () => {
    await upsertPrayerDays([fullDay(SATURDAY, { note: "Clocks change tonight" })]);

    const result = saved(
      await saveDay({ date: SATURDAY, fajrBegins: "06:11", fajrJamaat: "", sunrise: null }, NOW),
    );

    const expected = {
      date: SATURDAY,
      fajrBegins: "06:11",
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
      jumuah: [],
      note: null,
    };
    expect(result.day).toStrictEqual(expected);
    expect(await getPrayerDay(SATURDAY)).toStrictEqual(expected);
  });

  it("leaves every other day alone", async () => {
    await upsertPrayerDays(fullDays(FRIDAY, 3));
    await saveDay(fullDay(SATURDAY, { asrJamaat: "14:45" }), NOW);

    const stored = await getAllPrayerDays();
    expect(stored.map((day) => day.asrJamaat)).toStrictEqual(["14:30", "14:45", "14:30"]);
  });

  it("trims the note, and sorts and de-duplicates Jumu'ah times", async () => {
    const result = saved(
      await saveDay(
        fullDay(FRIDAY, { jumuah: ["13:30", "12:30", "13:30"], note: "  Eid prayer at 8:00  " }),
        NOW,
      ),
    );
    expect(result.day.jumuah).toStrictEqual(["12:30", "13:30"]);
    expect(result.day.note).toBe("Eid prayer at 8:00");
    expect(result.warnings).toStrictEqual([]);
  });

  it("drops keys it does not know", async () => {
    const result = saved(await saveDay({ ...fullDay(SATURDAY), updatedAt: 1, admin: true }, NOW));
    expect(Object.keys(result.day).sort()).toStrictEqual(Object.keys(fullDay(SATURDAY)).sort());
  });

  it.each([
    ["a time that is not a time", { fajrBegins: "6.10am" }, "fajrBegins", /HH:mm/],
    ["an hour that does not exist", { ishaJamaat: "24:00" }, "ishaJamaat", /HH:mm/],
    ["a time without a leading zero", { sunrise: "7:50" }, "sunrise", /HH:mm/],
    ["a number where a time belongs", { asrBegins: 1410 }, "asrBegins", /not valid/],
    ["a Jumu'ah time that is not a time", { jumuah: ["1pm"] }, "jumuah.0", /HH:mm/],
    ["too many Jumu'ah times", { jumuah: ["12:00", "12:30", "13:00", "13:30", "14:00"] }, "jumuah", /at most 4/],
    ["a note that is too long", { note: "x".repeat(MAX_DAY_NOTE_LENGTH + 1) }, "note", /under 120 characters/],
  ])("refuses %s and saves nothing", async (_name, overrides, field, message) => {
    const failed = refused(await saveDay({ ...fullDay(FRIDAY), ...overrides }, NOW));

    expect(failed.code).toBe("invalid");
    expect(Object.keys(failed.fieldErrors ?? {})).toStrictEqual([field]);
    expect(failed.fieldErrors?.[field]).toMatch(message);
    expect(await getAllPrayerDays()).toStrictEqual([]);
  });

  it.each([
    ["a date in another format", "01/02/2027"],
    ["a date that does not exist", "2027-02-30"],
    ["a blank date", ""],
  ])("refuses %s", async (_name, date) => {
    const failed = refused(await saveDay({ ...fullDay(SATURDAY), date }, NOW));
    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors?.date).toMatch(/YYYY-MM-DD/);
    expect(failed.error).toMatch(/^Date: /);
  });

  it("asks for the date when it is missing", async () => {
    const failed = refused(await saveDay({ fajrBegins: "06:10" }, NOW));
    expect(failed.fieldErrors).toStrictEqual({ date: "This field is required." });
  });

  it("reports every invalid field and names the first in the summary", async () => {
    const failed = refused(
      await saveDay({ ...fullDay(SATURDAY), fajrBegins: "dawn", maghribJamaat: "dusk", note: 7 }, NOW),
    );

    expect(Object.keys(failed.fieldErrors ?? {}).sort()).toStrictEqual([
      "fajrBegins",
      "maghribJamaat",
      "note",
    ]);
    expect(failed.error).toBe(
      "Fajr Begins: Enter a time as HH:mm (24-hour). 2 more fields need attention.",
    );
  });

  it.each([
    ["null", null],
    ["nothing", undefined],
    ["text", "2027-01-02"],
    ["a list", [fullDay(SATURDAY)]],
  ])("refuses %s in place of a day", async (_name, input) => {
    const failed = refused(await saveDay(input, NOW));
    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toBeUndefined();
    expect(failed.error).toMatch(/could not be read/);
  });

  it("saves times that are out of order, with a warning on the field", async () => {
    const result = saved(await saveDay(fullDay(SATURDAY, { asrBegins: "11:10" }), NOW));

    expect(result.outcome).toBe("added");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ code: "times-out-of-order", field: "asrBegins" });
    expect(result.warnings[0].message).toMatch(/Asr Begins \(11:10\) is not later than Dhuhr Begins \(12:05\)/);
    expect((await getPrayerDay(SATURDAY))?.asrBegins).toBe("11:10");
  });

  it("warns about a jamaat before its prayer begins, and still saves", async () => {
    const result = saved(await saveDay(fullDay(SATURDAY, { maghribJamaat: "16:15" }), NOW));

    expect(result.warnings).toStrictEqual([
      {
        code: "jamaat-before-begins",
        field: "maghribJamaat",
        message: "Maghrib Jamaat (16:15) is earlier than Maghrib Begins (16:20).",
      },
    ]);
    expect((await getPrayerDay(SATURDAY))?.maghribJamaat).toBe("16:15");
  });

  it("accepts an Isha after midnight without a warning", async () => {
    const summer = fullDay("2027-06-19", {
      fajrBegins: "02:40",
      fajrJamaat: "03:30",
      sunrise: "04:43",
      dhuhrBegins: "13:05",
      dhuhrJamaat: "13:30",
      asrBegins: "17:25",
      asrJamaat: "18:30",
      maghribBegins: "21:25",
      maghribJamaat: "21:30",
      ishaBegins: "23:50",
      ishaJamaat: "00:10",
    });
    expect(saved(await saveDay(summer, NOW)).warnings).toStrictEqual([]);
  });

  it("leaves Jumu'ah times off a day that is not a Friday and says so", async () => {
    const result = saved(await saveDay(fullDay(SATURDAY, { jumuah: ["13:15"] }), NOW));

    expect(result.day.jumuah).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([
      {
        code: "jumuah-not-friday",
        field: "jumuah",
        message: "2 Jan 2027 is not a Friday, so its Jumu'ah times were not saved.",
      },
    ]);
    expect((await getPrayerDay(SATURDAY))?.jumuah).toStrictEqual([]);
  });

  it("keeps Jumu'ah times on a Friday", async () => {
    const result = saved(await saveDay(fullDay(FRIDAY, { jumuah: ["13:15"] }), NOW));
    expect(result.warnings).toStrictEqual([]);
    expect((await getPrayerDay(FRIDAY))?.jumuah).toStrictEqual(["13:15"]);
  });

  it("saves a day that has only a note", async () => {
    const result = saved(await saveDay({ date: SATURDAY, note: "Mosque closed for repairs" }, NOW));
    expect(result.outcome).toBe("added");
    expect((await getPrayerDay(SATURDAY))?.note).toBe("Mosque closed for repairs");
  });

  it("refuses a day with nothing in it and keeps the stored one", async () => {
    await upsertPrayerDays([fullDay(SATURDAY)]);

    for (const blank of [
      { date: SATURDAY },
      { date: SATURDAY, fajrBegins: "", note: "   " },
      // The Jumu'ah time is dropped first, which leaves nothing.
      { date: SATURDAY, jumuah: ["13:15"] },
    ]) {
      const failed = refused(await saveDay(blank, NOW));
      expect(failed.code).toBe("invalid");
      expect(failed.error).toMatch(/Enter at least one time or a note/);
    }
    expect(await getPrayerDay(SATURDAY)).toStrictEqual(fullDay(SATURDAY));
  });
});

describe("deleteDays", () => {
  beforeEach(async () => {
    await upsertPrayerDays(fullDays("2027-01-01", 10));
  });

  it("only counts until the deletion is confirmed", async () => {
    const asked = refused(await deleteDays({ from: "2027-01-03", to: "2027-01-05" }));

    expect(asked.code).toBe("confirmation-required");
    expect(asked.error).toBe(
      "This will permanently delete 3 days of prayer times (3 Jan 2027 to 5 Jan 2027). Confirm to go ahead.",
    );
    expect(await getAllPrayerDays()).toHaveLength(10);
  });

  it.each([
    ["false", false],
    ["the text true", "true"],
    ["the number 1", 1],
    ["an object", {}],
    ["null", null],
  ])("does not take %s for a confirmation", async (_name, confirm) => {
    const asked = refused(await deleteDays({ from: "2027-01-03", to: "2027-01-05", confirm }));
    expect(asked.code).toBe("confirmation-required");
    expect(await getAllPrayerDays()).toHaveLength(10);
  });

  it("deletes the confirmed range, both ends included, and nothing else", async () => {
    const result = await deleteDays({ from: "2027-01-03", to: "2027-01-05", confirm: true });

    expect(result).toStrictEqual({ ok: true, deleted: 3, from: "2027-01-03", to: "2027-01-05" });
    expect((await getAllPrayerDays()).map((day) => day.date)).toStrictEqual([
      "2027-01-01",
      "2027-01-02",
      "2027-01-06",
      "2027-01-07",
      "2027-01-08",
      "2027-01-09",
      "2027-01-10",
    ]);
  });

  it("words a single day as a single day", async () => {
    const asked = refused(await deleteDays({ from: "2027-01-04", to: "2027-01-04" }));
    expect(asked.error).toBe(
      "This will permanently delete 1 day of prayer times (4 Jan 2027). Confirm to go ahead.",
    );

    const result = await deleteDays({ from: "2027-01-04", to: "2027-01-04", confirm: true });
    expect(result).toMatchObject({ ok: true, deleted: 1 });
    expect(await getPrayerDay("2027-01-04")).toBeNull();
  });

  it("counts the stored days, not the days of the range", async () => {
    const asked = refused(await deleteDays({ from: "2027-01-09", to: "2027-03-31" }));
    expect(asked.error).toMatch(/delete 2 days of prayer times \(9 Jan 2027 to 31 Mar 2027\)/);

    const result = await deleteDays({ from: "2027-01-09", to: "2027-03-31", confirm: true });
    expect(result).toMatchObject({ ok: true, deleted: 2 });
  });

  it("says so when the range holds nothing, confirmed or not", async () => {
    for (const confirm of [undefined, true]) {
      const result = refused(await deleteDays({ from: "2028-05-01", to: "2028-05-31", confirm }));
      expect(result.code).toBe("not-found");
      expect(result.error).toBe(
        "There is nothing to delete: no days are saved for 1 May 2028 to 31 May 2028.",
      );
    }
    expect(await getAllPrayerDays()).toHaveLength(10);
  });

  it("accepts a whole leap year and refuses one day more", async () => {
    await upsertPrayerDays([fullDay("2028-06-01")]);
    const leapYear = { from: "2028-01-01", to: "2028-12-31" };
    expect(MAX_DELETE_RANGE_DAYS).toBe(366);
    expect(refused(await deleteDays(leapYear)).code).toBe("confirmation-required");

    const tooLong = refused(
      await deleteDays({ from: "2028-01-01", to: addDays("2028-12-31", 1), confirm: true }),
    );
    expect(tooLong.code).toBe("invalid");
    expect(tooLong.fieldErrors).toStrictEqual({ to: "The date range can cover at most 366 days" });
    expect(tooLong.error).toBe("Last day: The date range can cover at most 366 days.");
    expect(await getPrayerDay("2028-06-01")).not.toBeNull();
  });

  it("refuses a range that runs backwards", async () => {
    const failed = refused(await deleteDays({ from: "2027-01-05", to: "2027-01-03", confirm: true }));
    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors?.to).toMatch(/must not be before the start date/);
    expect(await getAllPrayerDays()).toHaveLength(10);
  });

  it.each([
    ["a date in another format", { from: "03/01/2027", to: "2027-01-05" }, "from"],
    ["a date that does not exist", { from: "2027-01-03", to: "2027-02-31" }, "to"],
    ["a missing last day", { from: "2027-01-03" }, "to"],
    ["a number for a date", { from: 20270103, to: "2027-01-05" }, "from"],
  ])("refuses %s", async (_name, range, field) => {
    const failed = refused(await deleteDays({ ...range, confirm: true }));
    expect(failed.code).toBe("invalid");
    expect(Object.keys(failed.fieldErrors ?? {})).toStrictEqual([field]);
    expect(await getAllPrayerDays()).toHaveLength(10);
  });

  it.each([
    ["null", null],
    ["nothing", undefined],
    ["text", "2027-01-03"],
    ["true", true],
  ])("refuses %s in place of a range", async (_name, input) => {
    const failed = refused(await deleteDays(input));
    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toStrictEqual({
      from: "This field is required.",
      to: "This field is required.",
    });
    expect(await getAllPrayerDays()).toHaveLength(10);
  });
});
