import { describe, expect, it } from "vitest";
import { AAA_TEXT, AA_LARGE, AA_TEXT, contrastRatio, parseHex, relativeLuminance } from "./contrast";

describe("parseHex", () => {
  it("reads six-digit colours, with or without the hash, in either case", () => {
    expect(parseHex("#15493f")).toEqual([21, 73, 63]);
    expect(parseHex("15493F")).toEqual([21, 73, 63]);
    expect(parseHex("  #FFFFFF ")).toEqual([255, 255, 255]);
  });

  it("expands three-digit shorthand", () => {
    expect(parseHex("#fa0")).toEqual([255, 170, 0]);
    expect(parseHex("#000")).toEqual([0, 0, 0]);
  });

  it.each(["", "#", "#12", "#1234", "#12345", "#1234567", "#15493f80", "#gggggg", "rgb(0,0,0)", "white"])("rejects %j", (value) => {
    expect(() => parseHex(value)).toThrow(RangeError);
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });

  it("weights green above red above blue, as the eye does", () => {
    const red = relativeLuminance([255, 0, 0]);
    const green = relativeLuminance([0, 255, 0]);
    const blue = relativeLuminance([0, 0, 255]);
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
    expect(red + green + blue).toBeCloseTo(1, 10);
  });

  it("uses the linear segment of the sRGB curve for very dark channels", () => {
    // 10/255 is below the 0.04045 knee, so it is a plain division by 12.92.
    expect(relativeLuminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 10);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#15493f", "#15493f")).toBe(1);
  });

  it("does not depend on which colour is the foreground", () => {
    expect(contrastRatio("#15493f", "#f2f4ef")).toBe(contrastRatio("#f2f4ef", "#15493f"));
  });

  it("matches the published WCAG reference value for #767676 on white", () => {
    // The lightest grey that passes AA on white: 4.54:1.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(AA_TEXT);
  });

  it("propagates parse errors instead of returning NaN", () => {
    expect(() => contrastRatio("#fff", "transparent")).toThrow(RangeError);
  });
});

describe("thresholds", () => {
  it("are the WCAG 2 values, in increasing order", () => {
    expect([AA_LARGE, AA_TEXT, AAA_TEXT]).toEqual([3, 4.5, 7]);
  });
});
