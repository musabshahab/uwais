/**
 * Password comparison that does not leak, through how long it takes, how much
 * of a guess was right.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Longest password a sign-in attempt may carry; longer input is refused unread. */
export const MAX_PASSWORD_LENGTH = 1024;

/**
 * Key for the comparison digests, new in every process. With it an attacker
 * cannot predict the digests being compared, so even a flaw in the final
 * comparison would reveal nothing about the password itself.
 */
const COMPARE_KEY = randomBytes(32);

/** A fixed-length digest of a string, so the comparison never depends on its length. */
function digest(value: string): Buffer {
  return createHmac("sha256", COMPARE_KEY).update(value.normalize("NFC"), "utf8").digest();
}

/**
 * Compares two strings in constant time. Both sides are reduced to digests of
 * equal length first; `timingSafeEqual` alone would throw on, and so reveal,
 * a difference in length.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * True when `candidate` is the admin password.
 *
 * Both sides are Unicode-normalised, because the same accented character can
 * be typed as different code points on different keyboards. Anything that is
 * not a string, an over-long string and an empty expected password are all
 * rejected, still after one comparison so a rejection is not faster than a
 * near miss.
 * @param candidate What the visitor typed (untrusted).
 * @param expected  The configured password.
 */
export function verifyPassword(candidate: unknown, expected: string): boolean {
  const usable =
    typeof candidate === "string" && candidate.length <= MAX_PASSWORD_LENGTH && expected !== "";
  const matches = constantTimeEqual(usable ? candidate : "", expected);
  return usable && matches;
}
