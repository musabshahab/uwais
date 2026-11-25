import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site/site-url";

/**
 * `sitemap.xml`: the two public pages. Today's times change every day; the
 * timetable page moves on to a new month by itself.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/timetable"), changeFrequency: "weekly", priority: 0.8 },
  ];
}
