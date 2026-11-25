import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, TIME_FIELDS } from "@/lib/types";
import {
  MAX_ANNOUNCEMENT_BODY_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  MAX_DAY_NOTE_LENGTH,
  MAX_JUMUAH_SLOTS,
  MAX_UPSERT_DAYS,
  activeAnnouncementsQuerySchema,
  announcementInputSchema,
  announcementPatchSchema,
  boundedDateRangeSchema,
  dateRangeSchema,
  dateStringSchema,
  importLogInputSchema,
  monthStringSchema,
  prayerDaySchema,
  prayerDaysSchema,
  rowIdSchema,
  siteSettingsPatchSchema,
  siteSettingsSchema,
  timeStringSchema,
} from "./schemas";

/** Paths of the issues a failed parse reports, e.g. `tv.announcementSeconds`. */
function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("date, month and time strings", () => {
  it("accepts well-formed values", () => {
    expect(dateStringSchema.parse("2028-02-29")).toBe("2028-02-29");
    expect(monthStringSchema.parse("2026-11")).toBe("2026-11");
    expect(timeStringSchema.parse("00:00")).toBe("00:00");
    expect(timeStringSchema.parse("23:59")).toBe("23:59");
  });

  it.each(["2026-02-30", "2026-2-3", "26-11-25", "2026/11/25", "", "2026-11-25T00:00"])(
    "rejects %j as a date",
    (value) => {
      expect(dateStringSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each(["24:00", "5:42", "05:60", "05.42", "5pm", ""])("rejects %j as a time", (value) => {
    expect(timeStringSchema.safeParse(value).success).toBe(false);
  });

  it.each(["2026-13", "2026-00", "2026-1", "2026-11-25"])("rejects %j as a month", (value) => {
    expect(monthStringSchema.safeParse(value).success).toBe(false);
  });

  it("rejects values that are not strings", () => {
    expect(dateStringSchema.safeParse(20261125).success).toBe(false);
    expect(timeStringSchema.safeParse(null).success).toBe(false);
  });
});

describe("prayerDaySchema", () => {
  it("fills every missing time with null and defaults the rest", () => {
    const day = prayerDaySchema.parse({ date: "2026-11-25", fajrBegins: "05:42" });

    expect(day.fajrBegins).toBe("05:42");
    for (const field of TIME_FIELDS.filter((name) => name !== "fajrBegins")) {
      expect(day[field]).toBeNull();
    }
    expect(day.jumuah).toEqual([]);
    expect(day.note).toBeNull();
  });

  it("treats blank strings as no value", () => {
    const day = prayerDaySchema.parse({
      date: "2026-11-25",
      fajrBegins: "",
      ishaJamaat: null,
      note: "   ",
    });

    expect(day.fajrBegins).toBeNull();
    expect(day.ishaJamaat).toBeNull();
    expect(day.note).toBeNull();
  });

  it("sorts Jumu'ah times, drops repeats and trims the note", () => {
    const day = prayerDaySchema.parse({
      date: "2026-11-27",
      jumuah: ["13:30", "12:30", "13:30"],
      note: "  Clocks go back  ",
    });

    expect(day.jumuah).toEqual(["12:30", "13:30"]);
    expect(day.note).toBe("Clocks go back");
  });

  it("drops unknown keys", () => {
    const day = prayerDaySchema.parse({ date: "2026-11-25", updatedAt: "x", admin: true });
    expect(Object.keys(day).sort()).toEqual(["date", "jumuah", "note", ...TIME_FIELDS].sort());
  });

  it("names the field that is wrong", () => {
    const result = prayerDaySchema.safeParse({
      date: "2026-11-31",
      asrJamaat: "25:00",
      jumuah: ["1pm"],
      note: "x".repeat(MAX_DAY_NOTE_LENGTH + 1),
    });

    expect(issuePaths(result).sort()).toEqual(["asrJamaat", "date", "jumuah.0", "note"]);
  });

  it("limits the Jumu'ah times of one day", () => {
    const times = ["12:00", "12:30", "13:00", "13:30", "14:00"];
    expect(times.length).toBe(MAX_JUMUAH_SLOTS + 1);
    expect(prayerDaySchema.safeParse({ date: "2026-11-27", jumuah: times }).success).toBe(false);
    expect(
      prayerDaySchema.safeParse({ date: "2026-11-27", jumuah: times.slice(1) }).success,
    ).toBe(true);
  });

  it("caps the size of a batch", () => {
    const day = { date: "2026-11-25" };
    expect(prayerDaysSchema.safeParse(new Array(MAX_UPSERT_DAYS).fill(day)).success).toBe(true);
    expect(prayerDaysSchema.safeParse(new Array(MAX_UPSERT_DAYS + 1).fill(day)).success).toBe(
      false,
    );
  });
});

describe("date ranges", () => {
  it("accepts a single day and rejects a reversed range", () => {
    expect(dateRangeSchema.safeParse({ from: "2026-11-25", to: "2026-11-25" }).success).toBe(true);
    const reversed = dateRangeSchema.safeParse({ from: "2026-11-26", to: "2026-11-25" });
    expect(issuePaths(reversed)).toEqual(["to"]);
  });

  it("counts both ends when it limits the span", () => {
    const week = boundedDateRangeSchema(7);
    expect(week.safeParse({ from: "2026-11-01", to: "2026-11-07" }).success).toBe(true);
    expect(week.safeParse({ from: "2026-11-01", to: "2026-11-08" }).success).toBe(false);
  });

  it("measures a span across a leap day", () => {
    const year = boundedDateRangeSchema(366);
    expect(year.safeParse({ from: "2028-01-01", to: "2028-12-31" }).success).toBe(true);
    expect(year.safeParse({ from: "2028-01-01", to: "2029-01-01" }).success).toBe(false);
  });

  it("reports a malformed date as a validation issue instead of throwing", () => {
    const week = boundedDateRangeSchema(7);
    const badStart = week.safeParse({ from: "2026-02-30", to: "2026-03-01" });
    const badEnd = week.safeParse({ from: "2026-03-01", to: "soon" });

    expect(issuePaths(badStart)).toEqual(["from"]);
    expect(issuePaths(badEnd)).toEqual(["to"]);
  });
});

describe("siteSettingsSchema", () => {
  it("accepts the built-in defaults", () => {
    expect(siteSettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("trims text fields", () => {
    const settings = siteSettingsSchema.parse({
      ...DEFAULT_SETTINGS,
      mosqueName: "  Masjid Al-Noor ",
      email: " office@example.org ",
      mapUrl: " https://maps.example.org/x ",
    });
    expect(settings.mosqueName).toBe("Masjid Al-Noor");
    expect(settings.email).toBe("office@example.org");
    expect(settings.mapUrl).toBe("https://maps.example.org/x");
  });

  it.each([
    ["mosqueName", ""],
    ["mosqueName", "x".repeat(81)],
    ["shortName", "Thirteen char"],
    ["tagline", "x".repeat(141)],
    ["phone", "call me <script>"],
    ["email", "not-an-email"],
    ["mapUrl", "javascript:alert(1)"],
    ["mapUrl", "maps.example.org"],
    ["donateUrl", "data:text/html,hi"],
    ["donateUrl", "ftp://example.org/file"],
    ["timezone", "+01:00"],
    ["timezone", "Mars/Olympus"],
    ["timeFormat", "12"],
    ["hijriAdjustment", 3],
    ["hijriAdjustment", -3],
    ["hijriAdjustment", 0.5],
    ["hijriRollAtMaghrib", "yes"],
  ])("rejects %s = %j", (field, value) => {
    const result = siteSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, [field]: value });
    expect(issuePaths(result)).toEqual([field]);
  });

  it.each([
    ["phone", "+44 (0)20 7946 0000"],
    ["phone", ""],
    ["email", ""],
    ["mapUrl", ""],
    ["donateUrl", "http://localhost:3000/donate?x=1"],
    ["timezone", "Asia/Karachi"],
    ["hijriAdjustment", -2],
    ["hijriAdjustment", 2],
  ])("accepts %s = %j", (field, value) => {
    expect(siteSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, [field]: value }).success).toBe(
      true,
    );
  });

  it("limits and validates the default Jumu'ah slots", () => {
    const slot = { label: "Jumu'ah", time: "13:15" };
    const tooMany = new Array(MAX_JUMUAH_SLOTS + 1).fill(slot);
    expect(siteSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, jumuah: [] }).success).toBe(true);
    expect(siteSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, jumuah: tooMany }).success).toBe(
      false,
    );
    const bad = siteSettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      jumuah: [slot, { label: " ", time: "1.15pm" }],
    });
    expect(issuePaths(bad).sort()).toEqual(["jumuah.1.label", "jumuah.1.time"]);
  });

  it.each([
    ["theme", "sepia"],
    ["jamaatInProgressMinutes", -1],
    ["jamaatInProgressMinutes", 61],
    ["jamaatInProgressMinutes", 2.5],
    ["announcementSeconds", 4],
    ["announcementSeconds", 121],
    ["showSeconds", 1],
  ])("rejects tv.%s = %j", (field, value) => {
    const result = siteSettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      tv: { ...DEFAULT_SETTINGS.tv, [field]: value },
    });
    expect(issuePaths(result)).toEqual([`tv.${field}`]);
  });
});

describe("siteSettingsPatchSchema", () => {
  it("accepts any subset, including part of the TV settings", () => {
    expect(siteSettingsPatchSchema.parse({})).toEqual({});
    expect(siteSettingsPatchSchema.parse({ timeFormat: "24h", tv: { theme: "day" } })).toEqual({
      timeFormat: "24h",
      tv: { theme: "day" },
    });
  });

  it("still validates what is supplied", () => {
    const result = siteSettingsPatchSchema.safeParse({
      timezone: "Nowhere/Nothing",
      tv: { announcementSeconds: 1 },
    });
    expect(issuePaths(result).sort()).toEqual(["timezone", "tv.announcementSeconds"]);
  });

  it("drops keys that are not settings", () => {
    expect(siteSettingsPatchSchema.parse({ adminPassword: "x", tv: { volume: 11 } })).toEqual({
      tv: {},
    });
  });
});

describe("announcement schemas", () => {
  it("applies the defaults of a new announcement", () => {
    expect(announcementInputSchema.parse({ title: "  Eid prayer  " })).toEqual({
      title: "Eid prayer",
      body: "",
      startsOn: null,
      endsOn: null,
      showOnSite: true,
      showOnTv: true,
      pinned: false,
    });
  });

  it("enforces the title and body limits", () => {
    const ok = {
      title: "t".repeat(MAX_ANNOUNCEMENT_TITLE_LENGTH),
      body: "b".repeat(MAX_ANNOUNCEMENT_BODY_LENGTH),
    };
    expect(announcementInputSchema.safeParse(ok).success).toBe(true);
    expect(issuePaths(announcementInputSchema.safeParse({ ...ok, title: `${ok.title}t` }))).toEqual(
      ["title"],
    );
    expect(issuePaths(announcementInputSchema.safeParse({ ...ok, body: `${ok.body}b` }))).toEqual([
      "body",
    ]);
    expect(issuePaths(announcementInputSchema.safeParse({ title: "   " }))).toEqual(["title"]);
  });

  it("requires the last day not to be before the first", () => {
    const input = { title: "Ramadan", startsOn: "2027-02-08", endsOn: "2027-02-07" };
    expect(issuePaths(announcementInputSchema.safeParse(input))).toEqual(["endsOn"]);
    expect(
      announcementInputSchema.safeParse({ ...input, endsOn: "2027-02-08" }).success,
    ).toBe(true);
    expect(announcementInputSchema.safeParse({ ...input, endsOn: "" }).success).toBe(true);
  });

  it("keeps a patch free of defaults", () => {
    expect(announcementPatchSchema.parse({})).toEqual({});
    expect(announcementPatchSchema.parse({ pinned: true, endsOn: "" })).toEqual({
      pinned: true,
      endsOn: null,
    });
  });

  it("validates the fields a patch supplies", () => {
    expect(issuePaths(announcementPatchSchema.safeParse({ title: "" }))).toEqual(["title"]);
    expect(
      issuePaths(announcementPatchSchema.safeParse({ startsOn: "2026-12-02", endsOn: "2026-12-01" })),
    ).toEqual(["endsOn"]);
  });

  it("defaults the audience of an active query to any screen", () => {
    expect(activeAnnouncementsQuerySchema.parse({ from: "2026-11-24", to: "2026-12-30" })).toEqual({
      from: "2026-11-24",
      to: "2026-12-30",
      audience: "any",
    });
    expect(
      activeAnnouncementsQuerySchema.safeParse({ from: "2026-11-24", to: "2026-11-23" }).success,
    ).toBe(false);
    expect(
      activeAnnouncementsQuerySchema.safeParse({
        from: "2026-11-24",
        to: "2026-11-24",
        audience: "staff",
      }).success,
    ).toBe(false);
  });
});

describe("rowIdSchema", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects %j", (value) => {
    expect(rowIdSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a positive whole number", () => {
    expect(rowIdSchema.parse(42)).toBe(42);
  });
});

describe("importLogInputSchema", () => {
  const counts = { added: 1, updated: 2, unchanged: 3 };

  it("keeps only the file name of a path", () => {
    expect(
      importLogInputSchema.parse({ ...counts, fileName: "C:\\Users\\imam\\Desktop\\nov.xlsx" })
        .fileName,
    ).toBe("nov.xlsx");
    expect(
      importLogInputSchema.parse({ ...counts, fileName: "/home/imam/../timetable 2027.csv" })
        .fileName,
    ).toBe("timetable 2027.csv");
  });

  it("defaults the dates and the warning count", () => {
    expect(importLogInputSchema.parse({ ...counts, fileName: "a.csv" })).toEqual({
      ...counts,
      fileName: "a.csv",
      firstDate: null,
      lastDate: null,
      warnings: 0,
    });
  });

  it("truncates an over-long file name instead of failing the import", () => {
    const parsed = importLogInputSchema.parse({ ...counts, fileName: `${"n".repeat(400)}.csv` });
    expect(parsed.fileName).toHaveLength(255);
  });

  it("rejects an empty name and bad counts", () => {
    expect(importLogInputSchema.safeParse({ ...counts, fileName: "dir/" }).success).toBe(false);
    expect(importLogInputSchema.safeParse({ ...counts, fileName: "a.csv", added: -1 }).success).toBe(
      false,
    );
    expect(
      importLogInputSchema.safeParse({ ...counts, fileName: "a.csv", updated: 1.5 }).success,
    ).toBe(false);
  });
});
