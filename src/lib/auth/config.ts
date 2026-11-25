/**
 * Admin credentials, read from the environment.
 *
 * There is one admin account and its password is `ADMIN_PASSWORD`. No
 * password, no admin area: there is deliberately no default to fall back on,
 * because a default password on a public website is an open door.
 *
 * Nothing here imports Next.js, so the proxy, the session module and the unit
 * tests share one implementation.
 */

import { createHmac, scryptSync } from "node:crypto";

/** Shortest `ADMIN_PASSWORD` that enables the admin area. */
export const MIN_ADMIN_PASSWORD_LENGTH = 8;

/** Shortest `SESSION_SECRET` that is accepted. */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** Why the admin area is switched off. */
export type AdminDisabledReason = "missing_password" | "weak_password" | "weak_session_secret";

/** The admin area is usable. */
export interface AdminEnabled {
  enabled: true;
  /** The configured password. Compare with `verifyPassword`; never log or send it. */
  password: string;
  /** Key that signs session tokens (32 bytes, HS256). */
  signingKey: Uint8Array;
  /**
   * Fingerprint of the password carried in every session token. Changing
   * `ADMIN_PASSWORD` changes it, which signs everybody out.
   */
  sessionVersion: string;
}

/** The admin area is switched off; nobody can sign in. */
export interface AdminDisabled {
  enabled: false;
  reason: AdminDisabledReason;
  /** Explanation for the person running the site. Contains no secrets. */
  message: string;
}

/** The admin configuration of this deployment. */
export type AdminConfig = AdminEnabled | AdminDisabled;

/**
 * Salt for the key derivation. A fixed, application-wide salt is enough here:
 * there is a single account, so there are no other users whose hashes it
 * would need to keep apart, and no hash is ever stored.
 */
const KDF_SALT = "uwais/admin-password/v1";

/**
 * scrypt cost. The derived values leave the server inside session tokens
 * (as the version claim, and as the signature when no `SESSION_SECRET` is
 * set), so anyone holding a token could test password guesses offline. A
 * memory-hard derivation makes each guess cost about 32 MiB and tens of
 * milliseconds instead of one cheap hash.
 */
const KDF_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/** Stretches the password into 32 bytes of key material. */
function derivePasswordKey(password: string): Buffer {
  return scryptSync(password.normalize("NFC"), KDF_SALT, 32, KDF_PARAMS);
}

/** A sub-key of `key` for one purpose, so no two uses share key material. */
function deriveSubKey(key: Uint8Array | string, purpose: string): Buffer {
  return createHmac("sha256", key).update(`uwais/${purpose}/v1`).digest();
}

/** Builds the "switched off" answer. */
function disabled(reason: AdminDisabledReason, message: string): AdminDisabled {
  return { enabled: false, reason, message };
}

/**
 * Works out the admin configuration from environment variables.
 *
 * - `ADMIN_PASSWORD` unset or blank: the admin area is off.
 * - `ADMIN_PASSWORD` shorter than `MIN_ADMIN_PASSWORD_LENGTH`: off.
 * - `SESSION_SECRET` set but shorter than `MIN_SESSION_SECRET_LENGTH`: off,
 *   rather than quietly signing sessions with a weak key.
 * - `SESSION_SECRET` unset: the signing key is derived from the password.
 *
 * Slow on purpose (one scrypt run); use `getAdminConfig()` for the memoised
 * answer.
 */
export function readAdminConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AdminConfig {
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = (env.SESSION_SECRET ?? "").trim();

  if (password.trim() === "") {
    return disabled(
      "missing_password",
      "The admin area is switched off. Set the ADMIN_PASSWORD environment variable to turn it on.",
    );
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return disabled(
      "weak_password",
      "The admin area is switched off because ADMIN_PASSWORD is shorter than " +
        `${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (secret !== "" && secret.length < MIN_SESSION_SECRET_LENGTH) {
    return disabled(
      "weak_session_secret",
      "The admin area is switched off because SESSION_SECRET is shorter than " +
        `${MIN_SESSION_SECRET_LENGTH} characters. Use a longer value, or remove it to ` +
        "derive the key from ADMIN_PASSWORD.",
    );
  }

  const passwordKey = derivePasswordKey(password);
  return {
    enabled: true,
    password,
    signingKey: new Uint8Array(deriveSubKey(secret === "" ? passwordKey : secret, "session-key")),
    sessionVersion: deriveSubKey(passwordKey, "session-version")
      .subarray(0, 16)
      .toString("base64url"),
  };
}

/** A configuration together with the inputs it was worked out from. */
interface ConfigMemo {
  password: string | undefined;
  secret: string | undefined;
  config: AdminConfig;
}

/** The last configuration worked out. */
let memo: ConfigMemo | null = null;

/**
 * The admin configuration of the running process. The key derivation runs
 * once and again only if the two environment variables change (which, outside
 * tests, they do not).
 */
export function getAdminConfig(): AdminConfig {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (memo === null || memo.password !== password || memo.secret !== secret) {
    const config = readAdminConfig({ ADMIN_PASSWORD: password, SESSION_SECRET: secret });
    memo = { password, secret, config };
  }
  return memo.config;
}
