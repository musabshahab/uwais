import { mosqueJsonLd, serializeJsonLd } from "@/lib/site/json-ld";
import { absoluteUrl } from "@/lib/site/site-url";
import type { SiteSettings } from "@/lib/types";

/** Props of {@link MosqueJsonLd}. */
export interface MosqueJsonLdProps {
  settings: SiteSettings;
}

/**
 * Structured data describing the mosque (schema.org `Mosque`) for search
 * engines: name and address of the site, plus the address, phone, email and
 * map link when they are set. The settings are text typed by people, so the
 * JSON is escaped before it goes into the script element. Server Component.
 */
export function MosqueJsonLd({ settings }: MosqueJsonLdProps) {
  const data = mosqueJsonLd(settings, absoluteUrl("/"));
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
