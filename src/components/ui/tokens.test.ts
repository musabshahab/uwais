/**
 * Guards the colour tokens in `src/app/globals.css`.
 *
 * The design system promises WCAG AA for every text and control colour in
 * both site themes, and AAA for everything read on the TV. Those promises
 * are easy to break with a one-character colour tweak, so this test reads
 * the stylesheet itself and measures every pairing the components rely on.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AAA_TEXT, AA_LARGE, AA_TEXT, contrastRatio } from "./contrast";

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

type Tokens = Readonly<Record<string, string>>;

/**
 * Custom properties declared in the first rule whose selector is exactly
 * `selector`. `indent` is the whitespace before the selector: two spaces for
 * the system-dark block, which sits inside a media query.
 */
function tokensOf(selector: string, indent = ""): Tokens {
  const start = css.indexOf(`\n${indent}${selector} {`);
  if (start < 0) throw new Error(`No rule for "${selector}" in globals.css`);
  const open = css.indexOf("{", start);
  const end = css.indexOf(`\n${indent}}`, open);
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

/** Follows `var(--other)` references inside one theme until it reaches a colour. */
function colour(tokens: Tokens, name: string): string {
  let value = tokens[name];
  for (let hops = 0; value !== undefined && value.startsWith("var(") && hops < 4; hops += 1) {
    value = tokens[value.slice("var(--".length, -1)];
  }
  if (value === undefined) throw new Error(`Token --${name} is not defined`);
  return value;
}

const light = tokensOf(":root");
const darkSystem = tokensOf(':root:not([data-theme="light"])', "  ");
const darkChosen = tokensOf(':root[data-theme="dark"]');
const tvNight = tokensOf('[data-tv-theme="night"]');
const tvDay = tokensOf('[data-tv-theme="day"]');

const SITE_THEMES = [
  ["light", light],
  ["dark", darkChosen],
] as const;
const TV_THEMES = [
  ["tv night", tvNight],
  ["tv day", tvDay],
] as const;
const ALL_THEMES = [...SITE_THEMES, ...TV_THEMES] as const;

const SURFACES = ["canvas", "surface", "surface-raised", "surface-sunken"] as const;
const TEXT = ["fg", "fg-muted", "fg-subtle"] as const;
const TONES = ["brand", "accent", "success", "warning", "danger", "info"] as const;

/** Tokens that only exist once, on `:root`: type, motion and sizing, not colour. */
const isThemeIndependent = (name: string): boolean => /^(stack-|font-(sans|display|arabic)$|duration-|control$|tv-)/.test(name);

const isHex = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

describe("theme blocks", () => {
  it("finds a full set of tokens in every theme", () => {
    for (const [, tokens] of ALL_THEMES) {
      expect(Object.keys(tokens).length).toBeGreaterThan(50);
    }
  });

  it("keeps the two dark blocks identical", () => {
    expect(darkSystem).toEqual(darkChosen);
  });

  it("defines the same colour tokens in every theme", () => {
    const expected = Object.keys(light)
      .filter((name) => !isThemeIndependent(name))
      .sort();
    for (const [name, tokens] of ALL_THEMES) {
      expect(Object.keys(tokens).filter((token) => !isThemeIndependent(token)).sort(), name).toEqual(expected);
    }
  });

  it("writes every surface, text and fill colour as six-digit hex", () => {
    for (const [name, tokens] of ALL_THEMES) {
      for (const token of [...SURFACES, ...TEXT, ...TONES, "line", "line-strong", "ring", "mark", "on-brand", "on-brand-accent"]) {
        expect(isHex(colour(tokens, token)), `${name} --${token}`).toBe(true);
      }
    }
  });
});

describe.each(ALL_THEMES)("%s theme contrast", (themeName, tokens) => {
  const onTv = themeName.startsWith("tv");
  // Body text: AA on the site, AAA on a screen read from across the hall.
  const textMinimum = onTv ? AAA_TEXT : AA_TEXT;
  const ratio = (foreground: string, background: string): number => contrastRatio(colour(tokens, foreground), colour(tokens, background));

  it.each(SURFACES.flatMap((surface) => TEXT.map((text) => [text, surface] as const)))("%s is readable on %s", (text, surface) => {
    expect(ratio(text, surface)).toBeGreaterThanOrEqual(textMinimum);
  });

  it.each(TONES)("%s-fg is readable on the page, on cards and on its own tint", (tone) => {
    for (const background of ["canvas", "surface", "surface-raised", `${tone}-soft`]) {
      expect(ratio(`${tone}-fg`, background), background).toBeGreaterThanOrEqual(textMinimum);
    }
  });

  it.each(TONES)("body text is readable on the %s tint", (tone) => {
    expect(ratio("fg", `${tone}-soft`)).toBeGreaterThanOrEqual(textMinimum);
  });

  it.each(TONES)("on-%s is readable on its fill", (tone) => {
    expect(ratio(`on-${tone}`, tone)).toBeGreaterThanOrEqual(textMinimum);
  });

  it("keeps button labels readable while hovered", () => {
    expect(ratio("on-brand", "brand-hover")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio("on-accent", "accent-hover")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio("on-danger", "danger-hover")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio("on-primary", "primary")).toBeGreaterThanOrEqual(textMinimum);
    expect(ratio("on-primary", "primary-hover")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("gives brass on the brand fill enough contrast to be read", () => {
    expect(ratio("on-brand-accent", "brand")).toBeGreaterThanOrEqual(textMinimum);
  });

  it("draws control outlines, the focus ring and the mark at 3:1 or better", () => {
    for (const surface of ["canvas", "surface", "surface-raised"]) {
      expect(ratio("line-strong", surface), `line-strong on ${surface}`).toBeGreaterThanOrEqual(AA_LARGE);
      expect(ratio("ring", surface), `ring on ${surface}`).toBeGreaterThanOrEqual(AA_LARGE);
      expect(ratio("mark", surface), `mark on ${surface}`).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

describe.each(TV_THEMES)("%s theme", (_name, tokens) => {
  it("uses neither pure white nor pure black, which glare and burn in on a wall screen", () => {
    for (const [name, value] of Object.entries(tokens)) {
      expect(["#ffffff", "#fff", "#000000", "#000", "white", "black"], `--${name}`).not.toContain(value.toLowerCase());
    }
  });
});
