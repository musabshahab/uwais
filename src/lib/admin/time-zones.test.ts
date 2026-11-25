import { describe, expect, it } from "vitest";
import { listTimeZones } from "@/lib/time";
import {
  GENERAL_REGION,
  filterTimeZones,
  groupTimeZones,
  timeZoneLabel,
  timeZoneRegion,
  withSelectedZone,
} from "./time-zones";

const ZONES = ["UTC", "America/Argentina/Buenos_Aires", "America/New_York", "Asia/Karachi", "Europe/London"];

describe("labels", () => {
  it("splits a zone into region and place", () => {
    expect(timeZoneRegion("Europe/London")).toBe("Europe");
    expect(timeZoneLabel("Europe/London")).toBe("London");
    expect(timeZoneLabel("America/New_York")).toBe("New York");
    expect(timeZoneLabel("America/Argentina/Buenos_Aires")).toBe("Argentina, Buenos Aires");
  });

  it("puts a zone without a region in the general group", () => {
    expect(timeZoneRegion("UTC")).toBe(GENERAL_REGION);
    expect(timeZoneLabel("UTC")).toBe("UTC");
  });
});

describe("withSelectedZone", () => {
  it("leaves a list that already has the value alone", () => {
    expect(withSelectedZone(ZONES, "Europe/London")).toEqual(ZONES);
  });

  it("adds a stored value the runtime does not list", () => {
    expect(withSelectedZone(ZONES, "Europe/Kyiv")[0]).toBe("Europe/Kyiv");
    expect(withSelectedZone(ZONES, "Europe/Kyiv")).toHaveLength(ZONES.length + 1);
  });

  it("does not add an empty value", () => {
    expect(withSelectedZone(ZONES, "")).toEqual(ZONES);
  });
});

describe("filterTimeZones", () => {
  it("returns everything for an empty search", () => {
    expect(filterTimeZones(ZONES, "  ", "Europe/London")).toEqual(ZONES);
  });

  it("ignores case, spaces, underscores and slashes", () => {
    expect(filterTimeZones(ZONES, "new york", "")).toEqual(["America/New_York"]);
    expect(filterTimeZones(ZONES, "New_York", "")).toEqual(["America/New_York"]);
    expect(filterTimeZones(ZONES, "america/new", "")).toEqual(["America/New_York"]);
    expect(filterTimeZones(ZONES, "KARACHI", "")).toEqual(["Asia/Karachi"]);
  });

  it("matches the region too", () => {
    expect(filterTimeZones(ZONES, "america", "")).toEqual(["America/Argentina/Buenos_Aires", "America/New_York"]);
  });

  it("always keeps the chosen zone, so searching cannot change the value", () => {
    expect(filterTimeZones(ZONES, "karachi", "Europe/London")).toEqual(["Asia/Karachi", "Europe/London"]);
    expect(filterTimeZones(ZONES, "zzzz", "Europe/London")).toEqual(["Europe/London"]);
  });

  it("can find nothing", () => {
    expect(filterTimeZones(ZONES, "zzzz", "")).toEqual([]);
  });
});

describe("groupTimeZones", () => {
  it("groups by region and keeps the given order", () => {
    expect(groupTimeZones(ZONES)).toEqual([
      { region: "General", zones: [{ value: "UTC", label: "UTC" }] },
      {
        region: "America",
        zones: [
          { value: "America/Argentina/Buenos_Aires", label: "Argentina, Buenos Aires" },
          { value: "America/New_York", label: "New York" },
        ],
      },
      { region: "Asia", zones: [{ value: "Asia/Karachi", label: "Karachi" }] },
      { region: "Europe", zones: [{ value: "Europe/London", label: "London" }] },
    ]);
  });

  it("handles the real list without losing a zone", () => {
    const zones = listTimeZones();
    const grouped = groupTimeZones(zones);
    expect(grouped.reduce((count, group) => count + group.zones.length, 0)).toBe(zones.length);
    expect(grouped[0].region).toBe(GENERAL_REGION);
  });
});
