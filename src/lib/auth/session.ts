/**
 * The admin session: a signed token in an httpOnly cookie.
 *
 * This is the authority on "is this request from the signed-in admin".
 * Every admin page, Server Action and admin data loader must call
 * `requireAdmin()` (or check `getSession()`) itself; the proxy in
 * `src/proxy.ts` only saves signed-out visitors a round trip and is not a
 * security boundary.
 *
 * Reading the session uses `cookies()`, a request-time API: render whatever
 * calls it inside `<Suspense>`, or the whole route waits for the request.
 */

import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminConfig, type AdminDisabledReason } from "./config";
import { ADMIN_LOGIN_PATH } from "./paths";
import {
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./token";

/** What is known about the current request's session. */
export interface Session {
  /** True when the request carries a valid, unexpired admin session. */
  authenticated: boolean;
}

/** Whether signing in is possible on this deployment, without any of the secrets. */
export type AdminStatus =
  | { enabled: true }
  | {
      enabled: false;
      reason: AdminDisabledReason;
      /** Explanation for the person running the site, safe to show on the sign-in page. */
      message: string;
    };

/** Attributes of the session cookie. */
export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  /** Lifetime in seconds; 0 removes the cookie. */
  maxAge: number;
}

/** First value of a comma-separated header, lower-cased; "" when absent. */
function firstValue(header: string | null): string {
  return (header ?? "").split(",")[0].trim().toLowerCase();
}

/**
 * True when the visitor reached the site over HTTPS.
 *
 * Decided from the request, never from `NODE_ENV`: a production build served
 * over plain HTTP on a mosque's local network must still be able to sign in
 * (browsers drop `Secure` cookies there), and an HTTPS site must get a
 * `Secure` cookie even from a development build. `X-Forwarded-Proto` is what
 * a reverse proxy reports and what Next.js itself fills in when there is
 * none; the request URL and the browser's `Origin` header are fallbacks.
 * @param requestHeaders Headers of the incoming request.
 * @param requestUrl     The request URL, where the caller has one.
 */
export function isSecureRequest(
  requestHeaders: Pick<Headers, "get">,
  requestUrl?: string,
): boolean {
  const forwardedProto = firstValue(requestHeaders.get("x-forwarded-proto"));
  if (forwardedProto !== "") return forwardedProto === "https";
  if (requestUrl !== undefined) return requestUrl.toLowerCase().startsWith("https:");
  return firstValue(requestHeaders.get("origin")).startsWith("https://");
}

/**
 * The attributes the session cookie is set with: not readable by scripts,
 * sent on same-site requests and top-level navigations only, valid for the
 * whole site so the public pages can tell an admin is signed in.
 * @param secure Whether to restrict the cookie to HTTPS; see `isSecureRequest`.
 * @param maxAge Lifetime in seconds.
 */
export function sessionCookieOptions(
  secure: boolean,
  maxAge: number = SESSION_LIFETIME_SECONDS,
): SessionCookieOptions {
  return { httpOnly: true, sameSite: "lax", path: "/", secure, maxAge };
}

/**
 * Whether the admin area is switched on, and if not, why. For the sign-in
 * page, which must tell the operator how to enable it.
 *
 * Waits for a request first: the environment of a build is not the
 * environment of the running server (an image is built without
 * `ADMIN_PASSWORD`), so an answer worked out while prerendering would be
 * wrong for good. Render the caller inside `<Suspense>`.
 */
export async function getAdminStatus(): Promise<AdminStatus> {
  await connection();
  const config = getAdminConfig();
  return config.enabled
    ? { enabled: true }
    : { enabled: false, reason: config.reason, message: config.message };
}

/**
 * Starts an admin session by setting the session cookie. Call it only after
 * the password has been verified, and only from a Server Action or a Route
 * Handler (cookies cannot be set while a page renders).
 * @param nowMs Clock, epoch milliseconds.
 * @throws Error when the admin area is switched off.
 */
export async function createSession(nowMs: number = Date.now()): Promise<void> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const config = getAdminConfig();
  if (!config.enabled) throw new Error("Cannot start a session: the admin area is switched off.");
  const token = await signSessionToken(config, nowMs);
  cookieStore.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(isSecureRequest(requestHeaders)),
  );
}

/**
 * Ends the session by removing the cookie. Server Action or Route Handler
 * only. The token itself is not revocable; it simply stops being sent, and
 * expires on its own within the session lifetime.
 */
export async function destroySession(): Promise<void> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  // Same attributes as when it was set, so the browser matches and removes it.
  const secure = isSecureRequest(requestHeaders);
  cookieStore.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(secure, 0));
}

/**
 * The session of the current request. Checked once per render however many
 * components ask.
 *
 * `cookies()` is awaited before anything else on purpose: it ties the answer
 * to a real request, so a build can never prerender "signed out" (or a
 * redirect to the sign-in page) into an admin route just because
 * `ADMIN_PASSWORD` was not set while building.
 */
export const getSession: () => Promise<Session> = cache(async (): Promise<Session> => {
  const cookieStore = await cookies();
  const config = getAdminConfig();
  if (!config.enabled) return { authenticated: false };
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claims = await verifySessionToken(token, config, Date.now());
  return { authenticated: claims !== null };
});

/**
 * Lets the signed-in admin through and sends everybody else to the sign-in
 * page. Use it at the top of every admin page, Server Action and loader.
 *
 * It redirects by throwing, as `redirect()` does: do not wrap the call in a
 * `try` block that swallows errors.
 */
export async function requireAdmin(): Promise<void> {
  const session = await getSession();
  if (!session.authenticated) redirect(ADMIN_LOGIN_PATH);
}
