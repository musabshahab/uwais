/**
 * Where the admin area lives, and the one rule for "send the user back to
 * where they were going" links. Free of server-only imports because the proxy,
 * Server Actions and client components all need the same answers.
 */

/** The admin dashboard. */
export const ADMIN_HOME_PATH = "/admin";

/** The sign-in page. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Query parameter that carries the page to return to after signing in. */
export const NEXT_PARAM = "next";

/** Longest return path that is honoured; anything longer is not a link a person followed. */
const MAX_NEXT_LENGTH = 512;

/** Stand-in origin for resolving a path; never contacted. */
const PLACEHOLDER_ORIGIN = "http://uwais.invalid";

/** True for ASCII control characters, which browsers drop or reinterpret inside URLs. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Turns an untrusted "return to" value into a path that is safe to redirect
 * to: a page inside the admin area on this site, or the dashboard when the
 * value is anything else.
 *
 * Refused: other sites (`https://evil.example`, `//evil.example`,
 * `/\evil.example`), paths that climb out of `/admin`, the sign-in page
 * itself (it would loop) and values that are not strings. The fragment is
 * dropped; the query string is kept.
 */
export function safeAdminRedirect(next: unknown): string {
  if (typeof next !== "string" || next.length > MAX_NEXT_LENGTH) return ADMIN_HOME_PATH;
  if (!next.startsWith("/") || next.includes("\\") || hasControlCharacter(next)) {
    return ADMIN_HOME_PATH;
  }
  let url: URL;
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return ADMIN_HOME_PATH;
  }
  // `//host/path` parses as another origin; the parser also resolves `..` segments.
  if (url.origin !== PLACEHOLDER_ORIGIN) return ADMIN_HOME_PATH;
  const insideAdmin =
    url.pathname === ADMIN_HOME_PATH || url.pathname.startsWith(`${ADMIN_HOME_PATH}/`);
  if (!insideAdmin || isLoginPath(url.pathname)) return ADMIN_HOME_PATH;
  return url.pathname + url.search;
}

/** True for the sign-in page, with or without a trailing slash. */
export function isLoginPath(pathname: string): boolean {
  return pathname === ADMIN_LOGIN_PATH || pathname === `${ADMIN_LOGIN_PATH}/`;
}
