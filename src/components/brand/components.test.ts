import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MARK_SPEC } from "./geometry";
import * as icons from "./icons";
import { Lattice, OrnamentRule } from "./lattice";
import { LogoMark } from "./logo";
import { Wordmark } from "./wordmark";

const html = (element: ReactElement): string => renderToStaticMarkup(element);
const count = (markup: string, pattern: RegExp): number => (markup.match(pattern) ?? []).length;

describe("LogoMark", () => {
  it("draws the eight facets at ordinary sizes, one of them in the accent colour", () => {
    const markup = html(createElement(LogoMark, { size: 48 }));
    expect(count(markup, /<path /g)).toBe(MARK_SPEC.tips);
    expect(count(markup, /fill="var\(--accent, currentColor\)"/g)).toBe(1);
    expect(count(markup, /fill="var\(--mark, currentColor\)"/g)).toBe(MARK_SPEC.tips - 1);
  });

  it("switches to the compact star below 28 pixels", () => {
    const small = html(createElement(LogoMark, { size: 16 }));
    expect(count(small, /<path /g)).toBe(2);
    expect(small).toContain('fill-rule="evenodd"');
    expect(count(html(createElement(LogoMark, { size: 27 })), /<path /g)).toBe(2);
    expect(count(html(createElement(LogoMark, { size: 28 })), /<path /g)).toBe(MARK_SPEC.tips);
  });

  it("cannot guess the pixel size of a CSS length, so it draws the full mark", () => {
    expect(count(html(createElement(LogoMark, { size: "1.5em" })), /<path /g)).toBe(MARK_SPEC.tips);
  });

  it("obeys an explicit level of detail at any size", () => {
    expect(count(html(createElement(LogoMark, { size: 16, detail: "facets" })), /<path /g)).toBe(MARK_SPEC.tips);
    expect(count(html(createElement(LogoMark, { size: 512, detail: "solid" })), /<path /g)).toBe(2);
  });

  it("uses only the text colour in mono", () => {
    for (const size of [16, 64]) {
      const markup = html(createElement(LogoMark, { size, tone: "mono" }));
      expect(markup).not.toContain("var(");
      expect(markup).toContain('fill="currentColor"');
    }
    // One colour needs no overlay for the accent point.
    expect(count(html(createElement(LogoMark, { size: 16, tone: "mono" })), /<path /g)).toBe(1);
  });

  it("is decorative unless it is given a name", () => {
    const decorative = html(createElement(LogoMark));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("role=");

    const named = html(createElement(LogoMark, { title: "Masjid Uwais" }));
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Masjid Uwais"');
    expect(named).not.toContain("aria-hidden");
  });

  it("sets its size on the element", () => {
    expect(html(createElement(LogoMark, { size: 40 }))).toContain('width="40" height="40"');
    expect(html(createElement(LogoMark))).toContain('width="32" height="32"');
  });
});

describe("Wordmark", () => {
  it("shows the mosque name as text next to a decorative mark", () => {
    const markup = html(createElement(Wordmark, { name: "Masjid Uwais" }));
    expect(markup).toContain('<span class="wordmark-name">Masjid Uwais</span>');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("wordmark-tagline");
  });

  it("adds the tagline when there is one", () => {
    const markup = html(createElement(Wordmark, { name: "Masjid Uwais", tagline: "Prayer times and community updates" }));
    expect(markup).toContain('<span class="wordmark-tagline">Prayer times and community updates</span>');
  });

  it("escapes a name that contains markup", () => {
    expect(html(createElement(Wordmark, { name: 'Al-Noor <b>& "Friends"</b>' }))).toContain("Al-Noor &lt;b&gt;&amp; &quot;Friends&quot;&lt;/b&gt;");
  });

  it("keeps the wordmark class when given more classes", () => {
    expect(html(createElement(Wordmark, { name: "Uwais", className: "text-xl" }))).toMatch(/^<span class="wordmark text-xl">/);
  });
});

describe("Lattice", () => {
  it("is a decorative layer", () => {
    const markup = html(createElement(Lattice));
    expect(markup).toMatch(/^<svg class="lattice"/);
    expect(markup).toContain('aria-hidden="true"');
  });

  it("fills itself with the pattern it defines", () => {
    const markup = html(createElement(Lattice));
    const id = markup.match(/<pattern id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(markup).toContain(`fill="url(#${id})"`);
  });

  it("has no mask unless it fades", () => {
    expect(html(createElement(Lattice))).not.toContain("<mask");
    expect(html(createElement(Lattice, { fade: "none" }))).not.toContain("Gradient");
  });

  it.each([
    ["down", "linearGradient"],
    ["up", "linearGradient"],
    ["edges", "radialGradient"],
  ] as const)("fades %s through a %s mask", (fade, gradient) => {
    const markup = html(createElement(Lattice, { fade }));
    const maskId = markup.match(/<mask id="([^"]+)"/)?.[1];
    expect(markup).toContain(`<${gradient} `);
    expect(markup).toContain(`mask="url(#${maskId})"`);
  });

  it("fades in opposite directions for up and down", () => {
    expect(html(createElement(Lattice, { fade: "down" }))).toContain('y1="0" y2="1"');
    expect(html(createElement(Lattice, { fade: "up" }))).toContain('y1="1" y2="0"');
  });

  it("keeps the line weight constant when the tile is scaled", () => {
    const markup = html(createElement(Lattice, { tile: 192, strokeWidth: 2 }));
    expect(markup).toContain('patternTransform="scale(2)"');
    expect(markup).toContain('stroke-width="1"');
  });

  it("gives two lattices on one page different ids", () => {
    const markup = html(createElement("div", null, createElement(Lattice), createElement(Lattice)));
    const ids = [...markup.matchAll(/<pattern id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("OrnamentRule", () => {
  it("is a separator with a decorative star", () => {
    const markup = html(createElement(OrnamentRule));
    expect(markup).toMatch(/^<div class="ornament-rule" role="separator">/);
    expect(markup).toContain('aria-hidden="true"');
  });
});

describe("icons", () => {
  const components = Object.entries(icons).filter((entry): entry is [string, icons.IconComponent] => typeof entry[1] === "function");

  it("exports every icon the product needs", () => {
    const names = components.map(([name]) => name);
    for (const required of [
      "Calendar",
      "Clock",
      "Upload",
      "Download",
      "Tv",
      "Settings",
      "Megaphone",
      "Check",
      "Warning",
      "Close",
      "ChevronDown",
      "ChevronUp",
      "ChevronLeft",
      "ChevronRight",
      "Sun",
      "Sunrise",
      "Moon",
      "Plus",
      "Trash",
      "Pencil",
      "Logout",
      "Menu",
      "WifiOff",
      "Install",
      "ExternalLink",
      "Printer",
    ]) {
      expect(names).toContain(`${required}Icon`);
    }
  });

  it.each(components)("%s is drawn on the 24 grid in the text colour and hidden by default", (_name, Icon) => {
    const markup = html(createElement(Icon));
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("NaN");
    expect(markup).toMatch(/<(path|circle|rect) /);
  });

  it("draws every icon differently", () => {
    const bodies = components.map(([, Icon]) => html(createElement(Icon)).replace(/^<svg[^>]*>/, ""));
    expect(new Set(bodies).size).toBe(components.length);
  });

  it("becomes an image with a name when given a title", () => {
    const markup = html(createElement(icons.WifiOffIcon, { title: "Offline" }));
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Offline"');
    expect(markup).not.toContain("aria-hidden");
  });

  it("takes a size in pixels or as a CSS length and tracks the text by default", () => {
    expect(html(createElement(icons.ClockIcon))).toContain('width="1.25em" height="1.25em"');
    expect(html(createElement(icons.ClockIcon, { size: 16 }))).toContain('width="16" height="16"');
  });

  it("draws the cog as a closed outline with eight teeth", () => {
    const markup = html(createElement(icons.SettingsIcon));
    const outline = markup.match(/<path d="(M[^"]+Z)"/)?.[1] ?? "";
    // Four corners per tooth.
    expect(count(outline, /[ML]/g)).toBe(32);
  });
});
