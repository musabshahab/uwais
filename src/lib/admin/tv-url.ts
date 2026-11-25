/**
 * The address of the TV display for one screen. A caretaker types it into
 * the screen's browser once, so it carries only the options that differ from
 * the mosque's settings: `/tv?theme=day&rotate=90`.
 *
 * The option names and values are the ones the TV page reads
 * (`theme=night|day`, `inset=0..10`, `rotate=0|90|180|270`, `seconds=0|1`).
 */

/** The path of the TV display. */
export const TV_PATH = "/tv";

/** Largest extra margin a screen can ask for, in percent of the screen. */
export const TV_MAX_INSET = 10;

/** The rotations a screen can ask for, in degrees clockwise. */
export const TV_ROTATIONS = [0, 90, 180, 270] as const;

/** One of {@link TV_ROTATIONS}. */
export type TvRotationChoice = (typeof TV_ROTATIONS)[number];

/** What the address builder lets a caretaker choose for one screen. */
export interface TvAddressOptions {
  /** `settings` follows the mosque's TV settings; otherwise force a theme. */
  theme: "settings" | "night" | "day";
  /** `settings` follows the mosque's TV settings; otherwise force seconds on or off. */
  seconds: "settings" | "on" | "off";
  /** Clockwise rotation, for a screen mounted sideways or upside down. */
  rotate: TvRotationChoice;
  /** Extra margin on every side, 0 to {@link TV_MAX_INSET} percent. */
  inset: number;
}

/** A screen that follows the settings in every respect: the plain `/tv` address. */
export const DEFAULT_TV_ADDRESS_OPTIONS: TvAddressOptions = {
  theme: "settings",
  seconds: "settings",
  rotate: 0,
  inset: 0,
};

/** Brings an inset into the range a screen can use: a whole number of percent, 0 to {@link TV_MAX_INSET}. */
export function clampInset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(TV_MAX_INSET, Math.max(0, Math.round(value)));
}

/** The query string for a set of options, without the question mark; empty when nothing differs from the settings. */
export function tvQueryString(options: TvAddressOptions): string {
  const params = new URLSearchParams();
  if (options.theme !== "settings") params.set("theme", options.theme);
  if (options.seconds !== "settings") params.set("seconds", options.seconds === "on" ? "1" : "0");
  if (options.rotate !== 0) params.set("rotate", String(options.rotate));
  const inset = clampInset(options.inset);
  if (inset !== 0) params.set("inset", String(inset));
  return params.toString();
}

/** The path of the TV display with its options: `/tv` or `/tv?theme=day&rotate=90`. */
export function tvPath(options: TvAddressOptions = DEFAULT_TV_ADDRESS_OPTIONS): string {
  const query = tvQueryString(options);
  return query === "" ? TV_PATH : `${TV_PATH}?${query}`;
}

/**
 * The full address to type into a screen's browser.
 * @param origin The site's origin (`https://masjid.example`), or null when it
 *               is not known yet; the path alone is returned then.
 */
export function tvAddress(origin: string | null, options: TvAddressOptions = DEFAULT_TV_ADDRESS_OPTIONS): string {
  const path = tvPath(options);
  if (origin === null) return path;
  return `${origin.replace(/\/+$/, "")}${path}`;
}

/**
 * The address as a person would read it out or type it: without `https://`,
 * which every browser adds by itself. An `http://` address keeps its scheme,
 * because a browser would otherwise try the secure one first.
 */
export function tvAddressForTyping(origin: string | null, options: TvAddressOptions = DEFAULT_TV_ADDRESS_OPTIONS): string {
  return tvAddress(origin, options).replace(/^https:\/\//, "");
}
