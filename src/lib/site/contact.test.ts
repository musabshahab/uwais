import { describe, expect, it } from "vitest";
import { addressLines, externalHref, mailtoHref, telHref } from "./contact";

describe("telHref", () => {
  it("keeps the digits of a number written for people", () => {
    expect(telHref("0161 496 0000")).toBe("tel:01614960000");
    expect(telHref(" (0161) 496-0000 ")).toBe("tel:01614960000");
  });

  it("keeps the plus of an international number and drops its optional (0)", () => {
    expect(telHref("+44 161 496 0000")).toBe("tel:+441614960000");
    expect(telHref("+44 (0)161 496 0000")).toBe("tel:+441614960000");
  });

  it("does not drop a (0) from a national number", () => {
    expect(telHref("(0)161 496 0000")).toBe("tel:01614960000");
  });

  it("is null when there is nothing to dial", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("   ")).toBeNull();
    expect(telHref("ask at the office")).toBeNull();
    expect(telHref("12")).toBeNull();
  });
});

describe("mailtoHref", () => {
  it("links a single plain address", () => {
    expect(mailtoHref(" info@masjid.example ")).toBe("mailto:info@masjid.example");
  });

  it("is null for anything that is not one address", () => {
    expect(mailtoHref("")).toBeNull();
    expect(mailtoHref("info at masjid.example")).toBeNull();
    expect(mailtoHref("info@masjid")).toBeNull();
    expect(mailtoHref("a@b.example, c@d.example")).toBeNull();
  });

  it("refuses characters that could start markup, a query or a second header", () => {
    expect(mailtoHref('"><script>@x.example')).toBeNull();
    expect(mailtoHref("info@masjid.example?subject=hello")).toBeNull();
    expect(mailtoHref("info@masjid.example?bcc=x@y.example")).toBeNull();
    expect(mailtoHref("info@masjid.example\nbcc: x@y.example")).toBeNull();
  });

  it("allows plus addressing and dots", () => {
    expect(mailtoHref("first.last+times@mail.masjid.example")).toBe("mailto:first.last+times@mail.masjid.example");
  });
});

describe("externalHref", () => {
  it("accepts well-formed http and https addresses", () => {
    expect(externalHref("https://maps.example/place?q=masjid")).toBe("https://maps.example/place?q=masjid");
    expect(externalHref(" http://donate.example ")).toBe("http://donate.example/");
  });

  it("is null for an empty value", () => {
    expect(externalHref("")).toBeNull();
    expect(externalHref("   ")).toBeNull();
  });

  it("never links anything that is not a web address", () => {
    expect(externalHref("javascript:alert(1)")).toBeNull();
    expect(externalHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(externalHref("mailto:info@masjid.example")).toBeNull();
    expect(externalHref("maps.example/place")).toBeNull();
    expect(externalHref("/admin")).toBeNull();
  });
});

describe("addressLines", () => {
  it("splits on line breaks, trims and drops blank lines", () => {
    expect(addressLines("12 Example Road\r\n  Manchester \n\nM1 1AA\n")).toEqual(["12 Example Road", "Manchester", "M1 1AA"]);
  });

  it("keeps a one-line address whole, commas and all", () => {
    expect(addressLines("12 Example Road, Manchester, M1 1AA")).toEqual(["12 Example Road, Manchester, M1 1AA"]);
  });

  it("is empty for an empty address", () => {
    expect(addressLines("")).toEqual([]);
    expect(addressLines(" \n ")).toEqual([]);
  });
});
