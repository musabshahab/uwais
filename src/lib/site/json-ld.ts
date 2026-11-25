/**
 * Structured data for search engines: the mosque as a schema.org `Mosque`
 * (a kind of `PlaceOfWorship`), built from the public site settings.
 */

import type { SiteSettings } from "@/lib/types";
import { externalHref } from "./contact";

/** The schema.org description of the mosque; optional properties are left out when unknown. */
export interface MosqueJsonLd {
  "@context": "https://schema.org";
  "@type": "Mosque";
  name: string;
  url: string;
  description?: string;
  address?: string;
  telephone?: string;
  email?: string;
  hasMap?: string;
}

/**
 * Describes the mosque for search engines. Only details that have been
 * filled in are included, so an unconfigured site claims nothing it does not
 * know.
 * @param settings The site settings.
 * @param url The public address of the site's home page.
 */
export function mosqueJsonLd(
  settings: Pick<SiteSettings, "mosqueName" | "tagline" | "address" | "phone" | "email" | "mapUrl">,
  url: string,
): MosqueJsonLd {
  const data: MosqueJsonLd = {
    "@context": "https://schema.org",
    "@type": "Mosque",
    name: settings.mosqueName,
    url,
  };
  const tagline = settings.tagline.trim();
  if (tagline !== "") data.description = tagline;
  const address = settings.address.replace(/\s*\r?\n\s*/g, ", ").trim();
  if (address !== "") data.address = address;
  const phone = settings.phone.trim();
  if (phone !== "") data.telephone = phone;
  const email = settings.email.trim();
  if (email !== "") data.email = email;
  const map = externalHref(settings.mapUrl);
  if (map !== null) data.hasMap = map;
  return data;
}

/** Characters that could end the script element or break a JavaScript parser, and their escapes. */
const UNSAFE_CHARACTERS: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Serialises structured data for an inline `<script type="application/ld+json">`.
 * The settings are text typed by people, so every character that could close
 * the script element or open markup (`<`, `>`, `&`, and the two line
 * separators JSON allows but older JavaScript does not) is written as a
 * unicode escape. The result is still the same JSON value.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => UNSAFE_CHARACTERS[character]);
}
