import { describe, expect, it } from "vitest";
import { siteDescription, siteMetadata, timetableMetadata } from "./metadata";

const settings = { mosqueName: "Masjid Example", shortName: "Example", tagline: "A welcoming mosque" };

describe("siteDescription", () => {
  it("names the mosque and mentions prayer times", () => {
    const description = siteDescription(settings);
    expect(description).toContain("Masjid Example");
    expect(description).toMatch(/salah|prayer/);
    expect(description).toContain("jamaat");
  });
});

describe("siteMetadata", () => {
  it("titles the home page with the mosque's name alone and gives other pages a suffix", () => {
    expect(siteMetadata(settings).title).toEqual({ absolute: "Masjid Example", template: "%s | Masjid Example" });
  });

  it("carries the description into the link previews", () => {
    const metadata = siteMetadata(settings);
    expect(metadata.description).toBe(siteDescription(settings));
    expect(metadata.openGraph).toMatchObject({ siteName: "Masjid Example", title: "Masjid Example", url: "/" });
    expect(metadata.twitter).toMatchObject({ card: "summary", title: "Masjid Example" });
  });

  it("uses the short name for the installed app, or the full name when there is none", () => {
    expect(siteMetadata(settings).applicationName).toBe("Example");
    expect(siteMetadata({ ...settings, shortName: "  " }).applicationName).toBe("Masjid Example");
  });
});

describe("timetableMetadata", () => {
  it("names the month in the title and the description", () => {
    const metadata = timetableMetadata(settings, "2026-11");
    expect(metadata.title).toBe("Prayer timetable for November 2026");
    expect(metadata.description).toContain("November 2026");
    expect(metadata.description).toContain("Masjid Example");
  });

  it("gives link previews the full title and the address of that month", () => {
    const metadata = timetableMetadata(settings, "2027-01");
    expect(metadata.openGraph).toMatchObject({
      title: "Prayer timetable for January 2027 | Masjid Example",
      url: "/timetable?month=2027-01",
    });
    expect(metadata.alternates).toEqual({ canonical: "/timetable?month=2027-01" });
  });
});
