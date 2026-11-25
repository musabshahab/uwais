import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site/site-url";

/**
 * `robots.txt`: the public pages may be indexed; the admin area and the API
 * are not for search engines. Points crawlers at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
