import { describe, expect, it } from "vitest";
import { mosqueJsonLd, serializeJsonLd } from "./json-ld";

const EMPTY = { mosqueName: "Masjid Example", tagline: "", address: "", phone: "", email: "", mapUrl: "" };

describe("mosqueJsonLd", () => {
  it("describes an unconfigured mosque by name and address of the site only", () => {
    expect(mosqueJsonLd(EMPTY, "https://masjid.example/")).toEqual({
      "@context": "https://schema.org",
      "@type": "Mosque",
      name: "Masjid Example",
      url: "https://masjid.example/",
    });
  });

  it("adds each detail that has been filled in", () => {
    const data = mosqueJsonLd(
      {
        mosqueName: "Masjid Example",
        tagline: " A welcoming mosque ",
        address: "12 Example Road\r\nManchester\n M1 1AA ",
        phone: " 0161 496 0000 ",
        email: " info@masjid.example ",
        mapUrl: "https://maps.example/masjid",
      },
      "https://masjid.example/",
    );
    expect(data).toMatchObject({
      description: "A welcoming mosque",
      address: "12 Example Road, Manchester, M1 1AA",
      telephone: "0161 496 0000",
      email: "info@masjid.example",
      hasMap: "https://maps.example/masjid",
    });
  });

  it("leaves out a map link that is not a web address", () => {
    expect(mosqueJsonLd({ ...EMPTY, mapUrl: "javascript:alert(1)" }, "https://masjid.example/")).not.toHaveProperty("hasMap");
  });
});

describe("serializeJsonLd", () => {
  it("round-trips to the same value", () => {
    const value = { name: "Masjid <Example> & Sons", note: "line\u2028separator\u2029s", nested: ["</script>", 1, null] };
    expect(JSON.parse(serializeJsonLd(value))).toEqual(value);
  });

  it("cannot close the script element or open markup", () => {
    const text = serializeJsonLd({ name: "</script><script>alert(1)</script>", tagline: "<!-- & -->" });
    expect(text).not.toMatch(/[<>&]/);
    expect(text).toContain("\\u003c/script\\u003e");
    expect(text).toContain("\\u0026");
  });

  it("escapes the line separators that JSON allows raw", () => {
    const text = serializeJsonLd({ note: "a\u2028b\u2029c" });
    expect(text).not.toMatch(/[\u2028\u2029]/);
    expect(text).toContain("a\\u2028b\\u2029c");
  });
});
