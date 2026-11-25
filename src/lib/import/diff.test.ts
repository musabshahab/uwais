import { describe, expect, it } from "vitest";
import { TIME_FIELDS, type PrayerDay } from "@/lib/types";
import { blankDay, blankYear, byDate } from "./day";
import { daysToSave, diffTimetable, mergeDay } from "./diff";
import { MERGE_FIELDS, type MergeField } from "./types";

/** A complete saved day. */
function day(date: string, changes: Partial<PrayerDay> = {}): PrayerDay {
  return {
    ...blankDay(date),
    fajrBegins: "06:25",
    fajrJamaat: "06:45",
    sunrise: "08:06",
    dhuhrBegins: "12:09",
    dhuhrJamaat: "13:00",
    asrBegins: "13:46",
    asrJamaat: "14:00",
    maghribBegins: "16:05",
    maghribJamaat: "16:10",
    ishaBegins: "17:38",
    ishaJamaat: "18:00",
    ...changes,
  };
}

const JAMAAT_FIELDS: MergeField[] = ["fajrJamaat", "dhuhrJamaat", "asrJamaat", "maghribJamaat", "ishaJamaat"];

/** What a file with only jamaat columns yields for a date. */
function jamaatOnly(date: string, changes: Partial<PrayerDay> = {}): PrayerDay {
  return { ...blankDay(date), fajrJamaat: "07:00", dhuhrJamaat: "13:15", asrJamaat: "14:15", maghribJamaat: "16:12", ishaJamaat: "18:30", ...changes };
}

describe("blankDay, blankYear and byDate", () => {
  it("makes a day with nothing in it", () => {
    const blank = blankDay("2027-01-01");
    expect(blank.date).toBe("2027-01-01");
    for (const field of TIME_FIELDS) expect(blank[field]).toBeNull();
    expect(blank.jumuah).toEqual([]);
    expect(blank.note).toBeNull();
    expect(blankDay("2027-01-01").jumuah).not.toBe(blank.jumuah);
  });

  it("makes every day of a year, leap years included", () => {
    const year = blankYear(2027);
    expect(year).toHaveLength(365);
    expect(year[0].date).toBe("2027-01-01");
    expect(year[58].date).toBe("2027-02-28");
    expect(year[59].date).toBe("2027-03-01");
    expect(year[364].date).toBe("2027-12-31");
    const leap = blankYear(2028);
    expect(leap).toHaveLength(366);
    expect(leap[59].date).toBe("2028-02-29");
    expect(leap[365].date).toBe("2028-12-31");
    expect(new Set(leap.map((entry) => entry.date)).size).toBe(366);
  });

  it("rejects a year that is not a calendar year", () => {
    expect(() => blankYear(0)).toThrow(RangeError);
    expect(() => blankYear(2027.5)).toThrow(RangeError);
  });

  it("sorts days by date", () => {
    const days = [blankDay("2027-03-01"), blankDay("2026-12-31"), blankDay("2027-01-15")];
    expect([...days].sort(byDate).map((entry) => entry.date)).toEqual(["2026-12-31", "2027-01-15", "2027-03-01"]);
    expect(byDate(days[0], days[0])).toBe(0);
  });
});

describe("mergeDay", () => {
  it("replaces every part of the saved day by default", () => {
    const saved = day("2027-01-01", { jumuah: ["13:15"], note: "Bank holiday" });
    const incoming = day("2027-01-01", { fajrJamaat: "07:00", ishaBegins: null });
    expect(MERGE_FIELDS).toEqual([...TIME_FIELDS, "jumuah", "note"]);
    expect(mergeDay(saved, incoming)).toEqual(incoming);
  });

  it("only overwrites the fields the file has columns for", () => {
    const saved = day("2027-01-01", { jumuah: ["13:15", "14:00"], note: "Bank holiday" });
    const merged = mergeDay(saved, jamaatOnly("2027-01-01"), JAMAAT_FIELDS);
    expect(merged).toEqual(
      day("2027-01-01", { fajrJamaat: "07:00", dhuhrJamaat: "13:15", asrJamaat: "14:15", maghribJamaat: "16:12", ishaJamaat: "18:30", jumuah: ["13:15", "14:00"], note: "Bank holiday" }),
    );
  });

  it("clears a saved time when the file's column has an empty cell", () => {
    const merged = mergeDay(day("2027-01-01"), jamaatOnly("2027-01-01", { asrJamaat: null }), JAMAAT_FIELDS);
    expect(merged.asrJamaat).toBeNull();
    expect(merged.asrBegins).toBe("13:46");
  });

  it("treats Jumu'ah times and the note as fields of their own", () => {
    const saved = day("2027-01-01", { jumuah: ["13:15"], note: "Old note" });
    const incoming = { ...blankDay("2027-01-01"), jumuah: ["12:45", "13:45"], note: null };
    expect(mergeDay(saved, incoming, ["jumuah"])).toEqual(day("2027-01-01", { jumuah: ["12:45", "13:45"], note: "Old note" }));
    expect(mergeDay(saved, incoming, ["note"])).toEqual(day("2027-01-01", { jumuah: ["13:15"], note: null }));
    expect(mergeDay(saved, incoming, [])).toEqual(saved);
  });

  it("builds a new day from the mapped fields when nothing is saved", () => {
    const incoming = day("2027-01-01", { note: "From the file", jumuah: ["13:15"] });
    for (const existing of [null, undefined]) {
      expect(mergeDay(existing, incoming, JAMAAT_FIELDS)).toEqual({
        ...blankDay("2027-01-01"),
        fajrJamaat: "06:45",
        dhuhrJamaat: "13:00",
        asrJamaat: "14:00",
        maghribJamaat: "16:10",
        ishaJamaat: "18:00",
      });
    }
    expect(mergeDay(null, incoming)).toEqual(incoming);
  });

  it("changes neither of its arguments and shares no array with them", () => {
    const saved = day("2027-01-01", { jumuah: ["13:15"] });
    const incoming = day("2027-01-01", { jumuah: ["12:45"], fajrJamaat: "07:00" });
    const savedBefore = JSON.stringify(saved);
    const incomingBefore = JSON.stringify(incoming);

    const replaced = mergeDay(saved, incoming);
    const kept = mergeDay(saved, incoming, ["fajrJamaat"]);
    replaced.jumuah.push("15:00");
    kept.jumuah.push("15:00");

    expect(JSON.stringify(saved)).toBe(savedBefore);
    expect(JSON.stringify(incoming)).toBe(incomingBefore);
  });
});

describe("diffTimetable", () => {
  it("has nothing to do for an import of what is already saved", () => {
    const saved = [day("2027-01-01"), day("2027-01-02", { jumuah: ["13:15"], note: "x" })];
    const diff = diffTimetable(saved, [day("2027-01-02", { jumuah: ["13:15"], note: "x" }), day("2027-01-01")]);
    expect(diff).toEqual({ added: [], changed: [], unchanged: 2 });
    expect(daysToSave(diff)).toEqual([]);
  });

  it("adds every day when nothing is saved", () => {
    const incoming = [day("2027-01-01"), day("2027-01-02")];
    expect(diffTimetable([], incoming)).toEqual({ added: incoming, changed: [], unchanged: 0 });
  });

  it("separates new days, changed days and unchanged days", () => {
    const saved = [day("2027-01-01"), day("2027-01-02"), day("2027-01-03"), day("2026-12-31")];
    const incoming = [day("2027-01-02"), day("2027-01-03", { ishaJamaat: "18:15", note: "Changed" }), day("2027-01-04")];
    const diff = diffTimetable(saved, incoming);

    expect(diff.added).toEqual([day("2027-01-04")]);
    expect(diff.unchanged).toBe(1);
    expect(diff.changed).toEqual([
      {
        date: "2027-01-03",
        before: day("2027-01-03"),
        after: day("2027-01-03", { ishaJamaat: "18:15", note: "Changed" }),
        fields: [
          { field: "ishaJamaat", from: "18:00", to: "18:15" },
          { field: "note", from: null, to: "Changed" },
        ],
      },
    ]);
    // Saved days the file does not mention are never touched.
    expect(daysToSave(diff).map((entry) => entry.date)).toEqual(["2027-01-03", "2027-01-04"]);
  });

  it("shows a cleared time and changed Jumu'ah times", () => {
    const saved = [day("2027-01-01", { jumuah: ["13:15", "14:00"] })];
    const diff = diffTimetable(saved, [day("2027-01-01", { sunrise: null, jumuah: ["13:30"] })]);
    expect(diff.changed[0].fields).toEqual([
      { field: "sunrise", from: "08:06", to: null },
      { field: "jumuah", from: "13:15, 14:00", to: "13:30" },
    ]);
    expect(diffTimetable(saved, [day("2027-01-01")]).changed[0].fields).toEqual([{ field: "jumuah", from: "13:15, 14:00", to: null }]);
  });

  it("does not see an empty note and a missing note as different", () => {
    const diff = diffTimetable([day("2027-01-01", { note: "" })], [day("2027-01-01", { note: null })]);
    expect(diff).toMatchObject({ changed: [], unchanged: 1 });
  });

  it("leaves unmapped fields alone, so a jamaat-only file changes only jamaat times", () => {
    const saved = [day("2027-01-01", { note: "Bank holiday" }), day("2027-01-02")];
    const incoming = [jamaatOnly("2027-01-01"), jamaatOnly("2027-01-02", { fajrJamaat: "06:45", dhuhrJamaat: "13:00", asrJamaat: "14:00", maghribJamaat: "16:10", ishaJamaat: "18:00" }), jamaatOnly("2027-01-03")];
    const diff = diffTimetable(saved, incoming, JAMAAT_FIELDS);

    expect(diff.unchanged).toBe(1);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].fields.map((change) => change.field)).toEqual(JAMAAT_FIELDS);
    expect(diff.changed[0].after).toEqual(
      day("2027-01-01", { fajrJamaat: "07:00", dhuhrJamaat: "13:15", asrJamaat: "14:15", maghribJamaat: "16:12", ishaJamaat: "18:30", note: "Bank holiday" }),
    );
    expect(diff.added).toEqual([jamaatOnly("2027-01-03")]);

    // Without the list of mapped fields the same file would wipe the begin times.
    const careless = diffTimetable(saved, incoming);
    expect(careless.changed.find((change) => change.date === "2027-01-01")?.after.fajrBegins).toBeNull();
  });

  it("previews exactly what mergeDay writes", () => {
    const saved = [day("2027-01-01", { jumuah: ["13:15"], note: "Keep" }), day("2027-01-02")];
    const incoming = [jamaatOnly("2027-01-01"), jamaatOnly("2027-01-02"), jamaatOnly("2027-01-03")];
    const mapped: MergeField[] = [...JAMAAT_FIELDS, "note"];
    const diff = diffTimetable(saved, incoming, mapped);

    const merged = incoming.map((entry) => mergeDay(saved.find((candidate) => candidate.date === entry.date), entry, mapped));
    expect(daysToSave(diff)).toEqual(merged);
    for (const change of diff.changed) expect(change.before).toEqual(saved.find((entry) => entry.date === change.date));
  });

  it("applying a diff and importing again changes nothing", () => {
    const saved = [day("2027-01-01"), day("2027-01-02")];
    const incoming = [day("2027-01-02", { asrJamaat: "14:30" }), day("2027-01-03", { jumuah: ["13:15"] })];
    const written = daysToSave(diffTimetable(saved, incoming));
    const after = [...saved.filter((entry) => !written.some((candidate) => candidate.date === entry.date)), ...written];
    expect(diffTimetable(after, incoming)).toEqual({ added: [], changed: [], unchanged: 2 });
  });

  it("does not hand out the saved or incoming objects", () => {
    const saved = [day("2027-01-01", { jumuah: ["13:15"] })];
    const incoming = [day("2027-01-01", { jumuah: ["13:30"] }), day("2027-01-02", { jumuah: ["13:30"] })];
    const diff = diffTimetable(saved, incoming);
    diff.changed[0].before.jumuah.push("x");
    diff.changed[0].after.jumuah.push("x");
    diff.added[0].jumuah.push("x");
    expect(saved[0].jumuah).toEqual(["13:15"]);
    expect(incoming.map((entry) => entry.jumuah)).toEqual([["13:30"], ["13:30"]]);
  });

  it("sorts the days to save by date", () => {
    const diff = diffTimetable([day("2027-01-02")], [day("2027-01-05"), day("2027-01-02", { note: "n" }), day("2027-01-01")]);
    expect(daysToSave(diff).map((entry) => entry.date)).toEqual(["2027-01-01", "2027-01-02", "2027-01-05"]);
  });
});
