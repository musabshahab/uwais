import { describe, expect, it } from "vitest";
import { MAX_JUMUAH_SLOTS } from "@/lib/db/schemas";
import { DEFAULT_SETTINGS, type SiteSettings } from "@/lib/types";
import {
  HIJRI_ADJUSTMENTS,
  SETTINGS_FIELD_NAMES,
  adjustmentLabel,
  hijriPreviews,
  jumuahFieldName,
  sectionsWithErrors,
  settingsFormsEqual,
  settingsToForm,
} from "./settings-form";

const SETTINGS: SiteSettings = {
  ...DEFAULT_SETTINGS,
  mosqueName: "Masjid Uwais",
  hijriAdjustment: -1,
  jumuah: [
    { label: "1st Jumu'ah", time: "12:30" },
    { label: "2nd Jumu'ah", time: "13:30" },
  ],
  tv: { ...DEFAULT_SETTINGS.tv, theme: "day", jamaatInProgressMinutes: 0, announcementSeconds: 20 },
};

describe("settingsToForm", () => {
  it("copies every setting into the form", () => {
    const form = settingsToForm(SETTINGS);
    expect(form.mosqueName).toBe("Masjid Uwais");
    expect(form.timezone).toBe("Europe/London");
    expect(form.hijriAdjustment).toBe("-1");
    expect(form.tvTheme).toBe("day");
    expect(form.tvJamaatInProgressMinutes).toBe("0");
    expect(form.tvAnnouncementSeconds).toBe("20");
  });

  it("always offers the full number of Jumu'ah rows", () => {
    const form = settingsToForm(SETTINGS);
    expect(form.jumuah).toHaveLength(MAX_JUMUAH_SLOTS);
    expect(form.jumuah[1]).toEqual({ label: "2nd Jumu'ah", time: "13:30" });
    expect(form.jumuah[2]).toEqual({ label: "", time: "" });
    expect(settingsToForm({ ...SETTINGS, jumuah: [] }).jumuah.every((row) => row.label === "" && row.time === "")).toBe(
      true,
    );
  });

  it("brings a stored adjustment outside the range back into it", () => {
    expect(settingsToForm({ ...SETTINGS, hijriAdjustment: 5 }).hijriAdjustment).toBe("2");
    expect(settingsToForm({ ...SETTINGS, hijriAdjustment: -9 }).hijriAdjustment).toBe("-2");
  });
});

describe("settingsFormsEqual", () => {
  it("is true for the same settings read twice", () => {
    expect(settingsFormsEqual(settingsToForm(SETTINGS), settingsToForm(SETTINGS))).toBe(true);
  });

  it("notices a change to any field", () => {
    const base = settingsToForm(SETTINGS);
    expect(settingsFormsEqual(base, { ...base, tagline: "New" })).toBe(false);
    expect(settingsFormsEqual(base, { ...base, hijriRollAtMaghrib: !base.hijriRollAtMaghrib })).toBe(false);
    expect(settingsFormsEqual(base, { ...base, tvAnnouncementSeconds: "21" })).toBe(false);
  });

  it("notices a change inside a Jumu'ah row", () => {
    const base = settingsToForm(SETTINGS);
    const changed = { ...base, jumuah: base.jumuah.map((row, index) => (index === 3 ? { ...row, time: "14:00" } : row)) };
    expect(settingsFormsEqual(base, changed)).toBe(false);
  });
});

describe("field names", () => {
  it("match the property paths the save action reads", () => {
    expect(SETTINGS_FIELD_NAMES.tvTheme).toBe("tv.theme");
    expect(SETTINGS_FIELD_NAMES.tvJamaatInProgressMinutes).toBe("tv.jamaatInProgressMinutes");
    expect(jumuahFieldName(0, "label")).toBe("jumuah.0.label");
    expect(jumuahFieldName(3, "time")).toBe("jumuah.3.time");
  });
});

describe("Hijri adjustment", () => {
  it("words each adjustment", () => {
    expect(HIJRI_ADJUSTMENTS.map(adjustmentLabel)).toEqual([
      "2 days earlier",
      "1 day earlier",
      "No adjustment",
      "1 day later",
      "2 days later",
    ]);
  });

  it("previews five consecutive Hijri dates for today", () => {
    const previews = hijriPreviews("2026-11-25");
    expect(previews.map((preview) => preview.value)).toEqual(["-2", "-1", "0", "1", "2"]);
    expect(new Set(previews.map((preview) => preview.hijri)).size).toBe(5);
    for (const preview of previews) expect(preview.hijri).toMatch(/^\d{1,2} .+ \d{4} AH$/);
  });
});

describe("sectionsWithErrors", () => {
  it("names the sections that need attention, in form order", () => {
    expect(sectionsWithErrors({ "tv.announcementSeconds": "x", email: "y" })).toEqual(["Mosque details", "TV display"]);
    expect(sectionsWithErrors({ "jumuah.1.time": "x" })).toEqual(["Jumu'ah"]);
    expect(sectionsWithErrors({ timezone: "x" })).toEqual(["Time and calendar"]);
  });

  it("is empty without field errors", () => {
    expect(sectionsWithErrors(undefined)).toEqual([]);
    expect(sectionsWithErrors({})).toEqual([]);
  });
});
