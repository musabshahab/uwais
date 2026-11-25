/**
 * Turns the free-text contact details from the settings into links that are
 * safe to render. The admin area validates these fields when they are saved;
 * the checks here are the second lock on the door, because a link target is
 * the one place where stored text can do harm.
 */

/**
 * A `tel:` link for a phone number as people write it, e.g. `0161 496 0000`
 * or `+44 (0)161 496 0000`, or null when it holds no dialable number. The
 * optional `(0)` of UK numbers written in international form is dropped,
 * since dialling it gives a wrong number.
 */
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const international = trimmed.startsWith("+");
  const digits = (international ? trimmed.replace(/\(0\)/g, "") : trimmed).replace(/\D/g, "");
  if (digits.length < 3) return null;
  return `tel:${international ? "+" : ""}${digits}`;
}

/**
 * A `mailto:` link, or null when the text is not a plausible single address.
 * Characters that would add a second recipient or a query (`?subject=`) to
 * the link are refused.
 */
export function mailtoHref(email: string): string | null {
  const trimmed = email.trim();
  return /^[^\s@<>,;:"?&#%]+@[^\s@<>,;:"?&#%]+\.[^\s@<>,;:"?&#%]+$/.test(trimmed) ? `mailto:${trimmed}` : null;
}

/**
 * The address of an outside page (map, donations) when it is a well-formed
 * http(s) URL, else null. Anything else, `javascript:` in particular, is
 * never turned into a link.
 */
export function externalHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    const web = url.protocol === "http:" || url.protocol === "https:";
    return web && url.hostname !== "" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The lines of a postal address as it was typed, trimmed, with blank lines dropped. */
export function addressLines(address: string): string[] {
  return address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
