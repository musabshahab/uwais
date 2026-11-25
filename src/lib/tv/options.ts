/**
 * Per-screen options of the TV display, read from the query string of the
 * page address (`/tv?theme=day&rotate=90`). A caretaker types that address
 * once on a remote control, so parsing is forgiving about case and spaces,
 * and anything that cannot be understood falls back to a safe default rather
 * than breaking the screen.
 */

import type { SiteSettings, TvTheme } from "@/lib/types";

/** Clockwise rotation of the picture, in degrees. */
export type TvRotation = 0 | 90 | 180 | 270;

/** The query string as Next.js hands it to a page: one value, several, or none per name. */
export type TvSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

/** What the address of one screen asks for. Null means "follow the mosque's settings". */
export interface TvQueryOptions {
  /** `?theme=night|day`, or null to use `settings.tv.theme`. */
  theme: TvTheme | null;
  /** `?inset=0..10`: extra margin on every side, in percent of the screen. */
  inset: number;
  /** `?rotate=0|90|180|270`: turns the picture for a screen mounted sideways or upside down. */
  rotate: TvRotation;
  /** `?seconds=0|1`, or null to use `settings.tv.showSeconds`. */
  seconds: boolean | null;
}

/** The options one screen actually renders with: the address over the settings. */
export interface TvScreenOptions {
  theme: TvTheme;
  showSeconds: boolean;
  /** Extra margin on every side as a fraction of the screen, 0 to 0.1. */
  insetFraction: number;
  rotate: TvRotation;
  /** True when the picture is turned a quarter, so its width runs along the screen's height. */
  sideways: boolean;
}

/** Largest extra margin a screen can ask for, in percent. */
export const MAX_INSET_PERCENT = 10;

/** The options of an address without a query string. */
export const DEFAULT_TV_QUERY_OPTIONS: TvQueryOptions = {
  theme: null,
  inset: 0,
  rotate: 0,
  seconds: null,
};

const ROTATIONS: readonly TvRotation[] = [0, 90, 180, 270];

/** The names this module reads from a query string. */
const OPTION_NAMES = ["theme", "inset", "rotate", "seconds"] as const;

/** A plain decimal number such as `5` or `2.5`; no signs, exponents or units. */
const DECIMAL = /^\d+(\.\d+)?$/;

/** The first value given for a name, trimmed and lower-cased, or null when absent or empty. */
function firstValue(params: TvSearchParams, name: string): string | null {
  const raw = params[name];
  const value = typeof raw === "string" ? raw : raw === undefined ? undefined : raw[0];
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  return cleaned === "" ? null : cleaned;
}

function parseTheme(value: string | null): TvTheme | null {
  return value === "night" || value === "day" ? value : null;
}

/** A number of percent, clamped to what a screen can use; anything else is no inset. */
function parseInset(value: string | null): number {
  if (value === null || !DECIMAL.test(value)) return 0;
  return Math.min(MAX_INSET_PERCENT, Number(value));
}

function parseRotation(value: string | null): TvRotation {
  if (value === null || !DECIMAL.test(value)) return 0;
  const degrees = Number(value);
  for (const rotation of ROTATIONS) {
    if (rotation === degrees) return rotation;
  }
  return 0;
}

function parseSwitch(value: string | null): boolean | null {
  if (value === "1" || value === "true" || value === "on" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "off" || value === "no") return false;
  return null;
}

/**
 * Reads the per-screen options from a query string. Never throws: a missing,
 * repeated, malformed or out-of-range value yields the default for that
 * option (an inset above the maximum is brought down to it), and unknown
 * names are ignored.
 */
export function parseTvOptions(params: TvSearchParams | null | undefined): TvQueryOptions {
  if (params === null || params === undefined) return DEFAULT_TV_QUERY_OPTIONS;
  return {
    theme: parseTheme(firstValue(params, "theme")),
    inset: parseInset(firstValue(params, "inset")),
    rotate: parseRotation(firstValue(params, "rotate")),
    seconds: parseSwitch(firstValue(params, "seconds")),
  };
}

/**
 * The same, from the raw query string of an address (`location.search`, with
 * or without its question mark). For code that has no page `searchParams`
 * to read, such as the error screen.
 */
export function parseTvQueryString(search: string): TvQueryOptions {
  const query = new URLSearchParams(search);
  const params: Record<string, string[]> = {};
  for (const name of OPTION_NAMES) params[name] = query.getAll(name);
  return parseTvOptions(params);
}

/**
 * Combines what the address asks for with the mosque's TV settings. Called
 * on every render, so a change of theme in the admin area reaches a screen
 * that does not override it without a reload.
 */
export function resolveTvOptions(
  query: TvQueryOptions,
  tv: Pick<SiteSettings["tv"], "theme" | "showSeconds">,
): TvScreenOptions {
  return {
    theme: query.theme ?? tv.theme,
    showSeconds: query.seconds ?? tv.showSeconds,
    insetFraction: query.inset / 100,
    rotate: query.rotate,
    sideways: query.rotate === 90 || query.rotate === 270,
  };
}
