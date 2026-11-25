/**
 * The public address of the site, for absolute links in `robots.txt`, the
 * sitemap and structured data. It comes from the `SITE_URL` environment
 * variable with the same fallback as the root layout's `metadataBase`.
 */

/** Used when `SITE_URL` is unset or malformed, as on a developer's machine. */
export const FALLBACK_SITE_URL = "http://localhost:3000";

/** The part of the environment this module reads. */
export type SiteUrlEnv = Readonly<Record<string, string | undefined>>;

function parseHttpUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The address the deployment was given, or null when `SITE_URL` is unset or
 * is not an http(s) address. Use it where a made-up address would be worse
 * than none, such as the web address printed on the monthly timetable.
 */
export function configuredSiteUrl(env: SiteUrlEnv = process.env): URL | null {
  return parseHttpUrl(env.SITE_URL);
}

/**
 * Base for absolute URLs. A missing or malformed `SITE_URL` must not take a
 * build down, so it falls back to localhost.
 */
export function siteUrl(env: SiteUrlEnv = process.env): URL {
  return configuredSiteUrl(env) ?? new URL(FALLBACK_SITE_URL);
}

/**
 * An absolute address for a path of this site, e.g. `/timetable`. A path
 * prefix in `SITE_URL` is ignored: the app is always served from the root.
 */
export function absoluteUrl(path: string, env: SiteUrlEnv = process.env): string {
  return new URL(path, siteUrl(env).origin).toString();
}

/** The host name to print for people to type, without `www.`; e.g. `masjid.example`. */
export function displayHost(url: URL): string {
  return url.host.replace(/^www\./, "");
}
