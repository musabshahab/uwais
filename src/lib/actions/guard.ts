/**
 * What every Server Action does around its real work: check the session,
 * turn an unexpected exception into a generic failure, and make the admin's
 * screen show the new data after a change.
 *
 * Not a `"use server"` file: nothing in here is callable from the browser.
 */

import "server-only";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getSession, type Session } from "@/lib/auth/session";
import { unauthenticatedFailure, unexpectedFailure } from "./core/result";
import type { ActionFailure } from "./types";

/**
 * Checks the admin session of the current request. Returns null for the
 * signed-in admin and the failure to hand back for everybody else.
 *
 * Every action calls this as its first statement. A Server Action is a public
 * HTTP endpoint: the page that renders its form being protected says nothing
 * about who is calling it, and the proxy lets POST requests through.
 *
 * It answers with a result instead of redirecting to the sign-in page, so a
 * session that expired while a form was open does not throw away what the
 * user typed. A check that itself breaks denies: the caller gets the generic
 * failure and the action does not run.
 */
export async function denyUnlessAdmin(): Promise<ActionFailure | null> {
  let session: Session;
  try {
    session = await getSession();
  } catch (error) {
    unstable_rethrow(error);
    return unexpectedFailure("session check", error);
  }
  return session.authenticated ? null : unauthenticatedFailure();
}

/**
 * Makes the admin's own screen show what an action just changed.
 *
 * The caching policy in `@/lib/server/data` is that nothing read from the
 * database is cached across requests: every loader runs at request time, so
 * the public site, the TV screen and `/api/display` see a change on their
 * next request with nothing to invalidate. No cache tag exists, hence no
 * `updateTag` call here; if that policy ever gains a tagged cache, this is
 * the one place to expire it.
 *
 * What does hold old data is the browser of the admin who made the change.
 * `refresh()` re-renders the route they are on as part of the action's
 * response and clears the client router cache, so the other admin pages are
 * fetched afresh when they are next opened.
 */
function showChangeToAdmin(): void {
  refresh();
}

/**
 * Runs the body of an action that only reads. An unexpected exception is
 * logged on the server and answered with a generic failure.
 * @param action Name of the action, for the log line.
 */
export async function runQuery<R>(action: string, work: () => Promise<R>): Promise<R | ActionFailure> {
  try {
    return await work();
  } catch (error) {
    // Redirects and other framework signals travel as exceptions and must pass through.
    unstable_rethrow(error);
    return unexpectedFailure(action, error);
  }
}

/**
 * Runs the body of an action that changes data. As `runQuery`, and after a
 * successful change the admin's screen is refreshed.
 * @param action Name of the action, for the log line.
 */
export async function runMutation<R extends { ok: boolean }>(
  action: string,
  work: () => Promise<R>,
): Promise<R | ActionFailure> {
  const result = await runQuery(action, work);
  if (result.ok) showChangeToAdmin();
  return result;
}
