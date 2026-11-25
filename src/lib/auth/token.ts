/**
 * Session tokens: a signed, expiring statement that "the holder signed in as
 * the admin". The token is a compact JWT (HS256) and lives in a cookie.
 *
 * Pure apart from the cryptography: the clock is an argument, and nothing
 * here touches cookies or Next.js. That keeps it usable from the proxy and
 * testable without a request.
 */

import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/** Name of the cookie that carries the session token. */
export const SESSION_COOKIE_NAME = "uwais_admin";

/** How long a session lasts: seven days, in seconds. */
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

/** Signature algorithm; the only one a token may claim. */
const ALGORITHM = "HS256";

/** Who issued the token and who it is about. */
const ISSUER = "uwais";
const SUBJECT = "admin";

/** Longest token that is looked at; ours are well under 300 characters. */
const MAX_TOKEN_LENGTH = 2048;

/** The secrets a token is signed and checked with; `AdminEnabled` satisfies this. */
export interface SessionKeys {
  /** HS256 key, 32 bytes. */
  signingKey: Uint8Array;
  /** Fingerprint of the current admin password; see `AdminEnabled.sessionVersion`. */
  sessionVersion: string;
}

/** What a valid token says. */
export interface SessionClaims {
  /** When the admin signed in, epoch seconds. */
  issuedAt: number;
  /** When the session ends, epoch seconds. */
  expiresAt: number;
}

/**
 * Issues a token for a session that starts now and lasts
 * `SESSION_LIFETIME_SECONDS`.
 * @param nowMs Clock, epoch milliseconds.
 */
export async function signSessionToken(
  keys: SessionKeys,
  nowMs: number = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000);
  return new SignJWT({ sv: keys.sessionVersion })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setSubject(SUBJECT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_LIFETIME_SECONDS)
    .sign(keys.signingKey);
}

/** Compares two short ASCII strings without revealing where they differ. */
function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks a token and returns what it says, or null when it must not be
 * trusted: missing, malformed, signed with another key or algorithm, expired,
 * issued in the future, older than the session lifetime, or issued before the
 * admin password was last changed.
 *
 * Never throws; every failure is the same null so callers cannot leak which
 * check failed.
 * @param token The cookie value (untrusted).
 * @param nowMs Clock, epoch milliseconds.
 */
export async function verifySessionToken(
  token: string | null | undefined,
  keys: SessionKeys,
  nowMs: number = Date.now(),
): Promise<SessionClaims | null> {
  if (typeof token !== "string" || token === "" || token.length > MAX_TOKEN_LENGTH) return null;
  try {
    const { payload } = await jwtVerify(token, keys.signingKey, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      subject: SUBJECT,
      // Also requires `iat` and refuses tokens dated in the future.
      maxTokenAge: SESSION_LIFETIME_SECONDS,
      requiredClaims: ["exp", "sv"],
      currentDate: new Date(nowMs),
    });
    const { iat, exp, sv } = payload;
    if (typeof iat !== "number" || typeof exp !== "number" || typeof sv !== "string") return null;
    if (!sameText(sv, keys.sessionVersion)) return null;
    return { issuedAt: iat, expiresAt: exp };
  } catch {
    return null;
  }
}
