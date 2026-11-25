/**
 * Sizing of free text on the TV display. A wall screen cannot scroll and
 * must not overflow, so text of unknown length is set one size down when it
 * is long, and cut off with an ellipsis by the stylesheet as a last resort.
 */

/** The size the mosque's name is set in. */
export type NameScale = "regular" | "compact" | "dense";

/** Names up to this many characters are set in the regular size, on one line. */
export const REGULAR_NAME_MAX = 22;

/** Names up to this many characters are set in the compact size, on up to two lines. */
export const COMPACT_NAME_MAX = 44;

/**
 * The size for a mosque name: `Masjid Uwais` is regular, `Central Jamia
 * Mosque and Islamic Centre` compact, and anything longer dense.
 */
export function nameScale(name: string): NameScale {
  const length = name.trim().length;
  if (length <= REGULAR_NAME_MAX) return "regular";
  return length <= COMPACT_NAME_MAX ? "compact" : "dense";
}
