/**
 * What the admin screens do when the session has ended, and how the sign-in
 * page reads its address. Pure, so the same rules serve Server and Client
 * Components.
 */

import type { ActionFailure } from "@/lib/actions/types";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH, NEXT_PARAM, safeAdminRedirect } from "@/lib/auth/paths";

/** Query parameter that tells the sign-in page the visitor was signed out while working. */
export const EXPIRED_PARAM = "expired";

/** A query string value as Next.js hands it to a page. */
export type QueryValue = string | readonly string[] | undefined;

/** The first value given for a query parameter, or undefined. */
export function firstQueryValue(value: QueryValue): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

/**
 * The sign-in address that brings the user back to `returnTo` afterwards.
 * Anything that is not a page inside the admin area returns to the dashboard.
 * @param returnTo Path and query of the page the user was on.
 * @param expired  Adds the note that the session ended while they were working.
 */
export function loginHref(returnTo: string, { expired = false }: { expired?: boolean } = {}): string {
  const target = safeAdminRedirect(returnTo);
  const params = new URLSearchParams();
  if (target !== ADMIN_HOME_PATH) params.set(NEXT_PARAM, target);
  if (expired) params.set(EXPIRED_PARAM, "1");
  const query = params.toString();
  return query === "" ? ADMIN_LOGIN_PATH : `${ADMIN_LOGIN_PATH}?${query}`;
}

/** What the sign-in page reads from its query string. */
export interface LoginQuery {
  /** The page to return to, already made safe; the dashboard when absent or unsafe. */
  next: string;
  /** True when the visitor was sent here because their session ended. */
  expired: boolean;
}

/** Reads the sign-in page's query string. Never trusts `next`: see `safeAdminRedirect`. */
export function readLoginQuery(query: Readonly<Record<string, QueryValue>>): LoginQuery {
  return {
    next: safeAdminRedirect(firstQueryValue(query[NEXT_PARAM])),
    expired: firstQueryValue(query[EXPIRED_PARAM]) === "1",
  };
}

/**
 * The failure shown when an action could not be delivered at all: the
 * connection dropped, or the server refused the request before the action ran.
 */
export const UNREACHABLE_FAILURE: ActionFailure = {
  ok: false,
  code: "failed",
  error: "The server could not be reached. Check your connection and try again; nothing was changed.",
};

/** True when a result says nobody is signed in any more. */
export function isSignedOut(result: { ok: boolean; code?: string }): boolean {
  return !result.ok && result.code === "unauthenticated";
}
