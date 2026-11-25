/**
 * WCAG 2 contrast maths. Used by the token test, which fails the build when
 * a colour change drops text below AA, and available to any code that has to
 * choose a readable colour at runtime.
 */

/** An sRGB colour with channels from 0 to 255. */
export type Rgb = readonly [red: number, green: number, blue: number];

/**
 * Parses `#rgb` or `#rrggbb`.
 * @throws RangeError for anything else, including colours with alpha.
 */
export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, "");
  const full = value.length === 3 ? value.replace(/./g, (digit) => digit + digit) : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new RangeError(`Not an opaque hex colour: "${hex}"`);
  }
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, from 0 (black) to 1 (white). */
export function relativeLuminance([red, green, blue]: Rgb): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black on white). The order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(parseHex(a));
  const second = relativeLuminance(parseHex(b));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for body text. */
export const AA_TEXT = 4.5;

/** WCAG AA for large text (24px, or 19px bold) and for the outlines of controls. */
export const AA_LARGE = 3;

/** WCAG AAA for body text; the bar for anything read on the TV from across the hall. */
export const AAA_TEXT = 7;
