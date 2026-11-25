/**
 * Wording of a failed sign-in. Kept apart from the action so the mapping can
 * be tested without a request.
 */

import type { SignInResult } from "@/lib/auth/sign-in";
import { formatCountdownWords } from "@/lib/time";
import type { LoginState } from "../types";

/** A sign-in attempt that did not succeed. */
export type FailedSignIn = Exclude<SignInResult, { ok: true }>;

const SECONDS_PER_MINUTE = 60;

/** Shown when the sign-in itself broke, as opposed to being refused. */
export const LOGIN_SERVER_PROBLEM =
  "Signing in did not work because of a problem on the server. Please try again in a moment.";

/**
 * The form state for a refused sign-in.
 *
 * The messages are generic on purpose. After a wrong password the form does
 * not say how many attempts remain, and when the admin area is switched off
 * it does not say which setting is missing: the sign-in page shows that to
 * the operator itself, from `getAdminStatus()`.
 */
export function loginFailureState(result: FailedSignIn): LoginState {
  if (result.reason === "locked") {
    // Rounded up to the whole minute: the wording counts in minutes, and
    // "in 1 min" with 119 seconds to go would invite an attempt that still fails.
    const wait = Math.ceil(result.retryAfterSeconds / SECONDS_PER_MINUTE) * SECONDS_PER_MINUTE;
    return {
      error: `Too many failed attempts. Signing in is paused; try again in ${formatCountdownWords(wait)}.`,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  if (result.reason === "disabled") {
    return { error: "Signing in is switched off on this website at the moment." };
  }
  return { error: "That password is not correct. Check it and try again." };
}
