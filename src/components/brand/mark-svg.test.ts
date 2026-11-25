import { describe, expect, it } from "vitest";
import { MARK_COMPACT_SPEC, MARK_SPEC, MARK_VIEWBOX, markFacetPaths, markSolidPath } from "./geometry";
import { MASKABLE_SAFE_RADIUS, fitsMaskableSafeZone, markReach, renderMarkSvg } from "./mark-svg";

describe("markReach", () => {
  it("is the tip radius as a fraction of the icon", () => {
    expect(markReach(1)).toBeCloseTo(MARK_SPEC.outer / MARK_VIEWBOX);
    expect(markReach(0.5)).toBeCloseTo(MARK_SPEC.outer / MARK_VIEWBOX / 2);
  });

  it("accounts for the longer points of the compact mark", () => {
    expect(markReach(1, "solid")).toBeCloseTo(MARK_COMPACT_SPEC.outer / MARK_VIEWBOX);
    expect(markReach(1, "solid")).toBeGreaterThan(markReach(1, "facets"));
  });
});

describe("fitsMaskableSafeZone", () => {
  it("rejects a full-size mark, whose tips a circular mask would crop", () => {
    expect(fitsMaskableSafeZone(1)).toBe(false);
  });

  it("accepts a mark scaled inside the safe circle", () => {
    expect(fitsMaskableSafeZone(0.8)).toBe(true);
    expect(fitsMaskableSafeZone(0.6)).toBe(true);
  });

  it("puts the boundary where the tips touch the safe radius", () => {
    const limit = MASKABLE_SAFE_RADIUS / (MARK_SPEC.outer / MARK_VIEWBOX);
    expect(fitsMaskableSafeZone(limit - 0.001)).toBe(true);
    expect(fitsMaskableSafeZone(limit + 0.001)).toBe(false);
  });
});

describe("renderMarkSvg", () => {
  it("renders a standalone SVG document of the requested size", () => {
    const svg = renderMarkSvg({ size: 192, foreground: "#fff" });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 100 100">')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("draws all eight facets in the foreground colour when there is no accent", () => {
    const svg = renderMarkSvg({ size: 64, foreground: "#123456" });
    expect(svg.match(/<path /g)).toHaveLength(MARK_SPEC.tips);
    expect(svg.match(/fill="#123456"/g)).toHaveLength(MARK_SPEC.tips);
    for (const d of markFacetPaths()) expect(svg).toContain(`d="${d}"`);
  });

  it("colours exactly one facet with the accent", () => {
    const svg = renderMarkSvg({ size: 64, foreground: "#111111", accent: "#b98a2f" });
    expect(svg.match(/fill="#b98a2f"/g)).toHaveLength(1);
    expect(svg.match(/fill="#111111"/g)).toHaveLength(MARK_SPEC.tips - 1);
  });

  it("has a transparent background unless one is given", () => {
    expect(renderMarkSvg({ size: 64, foreground: "#000" })).not.toContain("<rect");
    const svg = renderMarkSvg({ size: 64, foreground: "#fff", background: "#15493f", cornerRadius: 0.22 });
    expect(svg).toContain('<rect width="100" height="100" rx="22" fill="#15493f"/>');
    // The background must be painted first, underneath the mark.
    expect(svg.indexOf("<rect")).toBeLessThan(svg.indexOf("<path"));
  });

  it("scales the mark around the centre of the icon", () => {
    expect(renderMarkSvg({ size: 64, foreground: "#000" })).toContain("<g>");
    expect(renderMarkSvg({ size: 64, foreground: "#000", scale: 0.6 })).toContain('<g transform="translate(20 20) scale(0.6)">');
  });

  it("draws the compact mark as a single even-odd path, with the accent slice on top", () => {
    const plain = renderMarkSvg({ size: 16, foreground: "#000", detail: "solid" });
    expect(plain.match(/<path /g)).toHaveLength(1);
    expect(plain).toContain(`fill-rule="evenodd" d="${markSolidPath()}"`);

    const twoColour = renderMarkSvg({ size: 16, foreground: "#000", accent: "#b98a2f", detail: "solid" });
    expect(twoColour.match(/<path /g)).toHaveLength(2);
    expect(twoColour.indexOf('fill="#000"')).toBeLessThan(twoColour.indexOf('fill="#b98a2f"'));
  });

  it.each([0, -1, Number.NaN])("rejects size %s", (size) => {
    expect(() => renderMarkSvg({ size, foreground: "#000" })).toThrow(RangeError);
  });

  it.each([0, -0.5, 1.01, Number.NaN])("rejects scale %s", (scale) => {
    expect(() => renderMarkSvg({ size: 64, foreground: "#000", scale })).toThrow(RangeError);
  });

  it.each([-0.1, 0.51, Number.NaN])("rejects corner radius %s", (cornerRadius) => {
    expect(() => renderMarkSvg({ size: 64, foreground: "#000", background: "#fff", cornerRadius })).toThrow(RangeError);
  });

  it("accepts the limits of each range", () => {
    expect(() => renderMarkSvg({ size: 1, foreground: "#000", scale: 1, cornerRadius: 0 })).not.toThrow();
    expect(() => renderMarkSvg({ size: 1, foreground: "#000", background: "#fff", cornerRadius: 0.5 })).not.toThrow();
  });
});
