/**
 * The sign-in procedure, in the only order that is safe: rate limit, then
 * password, then session. The sign-in Server Action calls `signIn()` and
 * turns the result into a redirect or a form message; keeping the sequence
 * here means no caller can forget the rate limit.
 */

import "server-only";

import { headers } from "next/headers";
import { getAdminConfig, type AdminDisabledReason } from "./config";
import { verifyPassword } from "./password";
import { clientKeyFromHeaders, getLoginRateLimiter } from "./rate-limit";
import { createSession } from "./session";

/** Outcome of a sign-in attempt. */
export type SignInResult =
  /** The password was right and the session cookie is set. */
  | { ok: true }
  /** The admin area is switched off; `message` tells the operator why. */
  | { ok: false; reason: "disabled"; cause: AdminDisabledReason; message: string }
  /** Wrong password. `remainingAttempts` more failures lock this client out. */
  | { ok: false; reason: "invalid"; remainingAttempts: number }
  /** Too many failures; nothing was checked. Try again after `retryAfterSeconds`. */
  | { ok: false; reason: "locked"; retryAfterSeconds: number };

/**
 * Tries to sign the current visitor in with `password`.
 *
 * While the visitor's address (or the site as a whole) is locked out the
 * password is not looked at, so guessing during a lock-out reveals nothing.
 * A correct password clears the visitor's failure count and sets the session
 * cookie. Call it from a Server Action or a Route Handler.
 * @param password The submitted password (untrusted; anything but the exact string fails).
 */
export async function signIn(password: unknown): Promise<SignInResult> {
  const requestHeaders = await headers();
  const config = getAdminConfig();
  if (!config.enabled) {
    return { ok: false, reason: "disabled", cause: config.reason, message: config.message };
  }

  const limiter = getLoginRateLimiter();
  const client = clientKeyFromHeaders(requestHeaders);
  const before = limiter.check(client);
  if (!before.allowed) {
    return { ok: false, reason: "locked", retryAfterSeconds: before.retryAfterSeconds };
  }

  if (!verifyPassword(password, config.password)) {
    const after = limiter.recordFailure(client);
    return after.allowed
      ? { ok: false, reason: "invalid", remainingAttempts: after.remainingAttempts }
      : { ok: false, reason: "locked", retryAfterSeconds: after.retryAfterSeconds };
  }

  limiter.recordSuccess(client);
  await createSession();
  return { ok: true };
}
