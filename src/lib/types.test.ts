import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, PRAYERS, PRAYER_KEYS, TIME_FIELDS } from "./types";

describe("shared types", () => {
  it("lists the five prayers in order with their timetable fields", () => {
    expect(PRAYERS.map((p) => p.key)).toEqual([...PRAYER_KEYS]);
    for (const prayer of PRAYERS) {
      expect(TIME_FIELDS).toContain(prayer.beginsField);
      expect(TIME_FIELDS).toContain(prayer.jamaatField);
    }
  });

  it("has sane default settings", () => {
    expect(DEFAULT_SETTINGS.timezone).toBe("Europe/London");
    expect(DEFAULT_SETTINGS.jumuah.length).toBeGreaterThan(0);
  });
});
