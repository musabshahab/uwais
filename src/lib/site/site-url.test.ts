import { describe, expect, it } from "vitest";
import { FALLBACK_SITE_URL, absoluteUrl, configuredSiteUrl, displayHost, siteUrl } from "./site-url";

describe("configuredSiteUrl", () => {
  it("reads an http(s) address from SITE_URL", () => {
    expect(configuredSiteUrl({ SITE_URL: "https://masjid.example" })?.href).toBe("https://masjid.example/");
    expect(configuredSiteUrl({ SITE_URL: "http://10.0.0.5:8080" })?.href).toBe("http://10.0.0.5:8080/");
  });

  it("is null when SITE_URL is unset, empty, malformed or not a web address", () => {
    expect(configuredSiteUrl({})).toBeNull();
    expect(configuredSiteUrl({ SITE_URL: "" })).toBeNull();
    expect(configuredSiteUrl({ SITE_URL: "masjid.example" })).toBeNull();
    expect(configuredSiteUrl({ SITE_URL: "ftp://masjid.example" })).toBeNull();
    expect(configuredSiteUrl({ SITE_URL: "javascript:alert(1)" })).toBeNull();
  });
});

describe("siteUrl", () => {
  it("falls back to localhost, as the root layout does", () => {
    expect(siteUrl({}).href).toBe(`${FALLBACK_SITE_URL}/`);
    expect(siteUrl({ SITE_URL: "not a url" }).href).toBe(`${FALLBACK_SITE_URL}/`);
  });

  it("uses SITE_URL when it is valid", () => {
    expect(siteUrl({ SITE_URL: "https://masjid.example" }).origin).toBe("https://masjid.example");
  });
});

describe("absoluteUrl", () => {
  const env = { SITE_URL: "https://masjid.example" };

  it("joins a path to the site's origin", () => {
    expect(absoluteUrl("/", env)).toBe("https://masjid.example/");
    expect(absoluteUrl("/timetable", env)).toBe("https://masjid.example/timetable");
    expect(absoluteUrl("/sitemap.xml", env)).toBe("https://masjid.example/sitemap.xml");
  });

  it("ignores a path or a trailing slash in SITE_URL", () => {
    expect(absoluteUrl("/timetable", { SITE_URL: "https://masjid.example/" })).toBe("https://masjid.example/timetable");
    expect(absoluteUrl("/timetable", { SITE_URL: "https://masjid.example/app/" })).toBe("https://masjid.example/timetable");
  });

  it("uses the fallback when SITE_URL is missing", () => {
    expect(absoluteUrl("/timetable", {})).toBe(`${FALLBACK_SITE_URL}/timetable`);
  });
});

describe("displayHost", () => {
  it("is the host without www, keeping a port", () => {
    expect(displayHost(new URL("https://www.masjid.example/"))).toBe("masjid.example");
    expect(displayHost(new URL("https://times.masjid.example/x"))).toBe("times.masjid.example");
    expect(displayHost(new URL("http://localhost:3000"))).toBe("localhost:3000");
  });
});
