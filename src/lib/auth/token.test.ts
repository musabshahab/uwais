import { SignJWT, decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { readAdminConfig, type AdminEnabled } from "./config";
import {
  SESSION_LIFETIME_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionKeys,
} from "./token";

const NOW = Date.UTC(2026, 10, 25, 12);
const NOW_SECONDS = NOW / 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Keys for a password, through the real derivation. */
function keysFor(password: string, secret?: string): AdminEnabled {
  const config = readAdminConfig({ ADMIN_PASSWORD: password, SESSION_SECRET: secret });
  if (!config.enabled) throw new Error(config.message);
  return config;
}

const keys = keysFor("correct horse battery");

/** Signs arbitrary claims with the session key, to forge tokens the app would never issue. */
function forge(
  claims: Record<string, unknown>,
  options: { issuedAt?: number; expiresAt?: number | null; subject?: string } = {},
): Promise<string> {
  const issuedAt = options.issuedAt ?? NOW_SECONDS;
  let token = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("uwais")
    .setSubject(options.subject ?? "admin")
    .setIssuedAt(issuedAt);
  if (options.expiresAt !== null) {
    token = token.setExpirationTime(options.expiresAt ?? issuedAt + SESSION_LIFETIME_SECONDS);
  }
  return token.sign(keys.signingKey);
}

/** Replaces one of the three dot-separated parts of a token. */
function withPart(token: string, index: number, value: string): string {
  const parts = token.split(".");
  parts[index] = value;
  return parts.join(".");
}

/** Base64url-encodes a JSON value, as a JWT part. */
function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("signSessionToken", () => {
  it("issues an HS256 token that lasts seven days", async () => {
    const token = await signSessionToken(keys, NOW);

    expect(decodeProtectedHeader(token)).toEqual({ alg: "HS256" });
    expect(decodeJwt(token)).toEqual({
      iss: "uwais",
      sub: "admin",
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + 7 * 24 * 60 * 60,
      sv: keys.sessionVersion,
    });
  });

  it("puts neither the password nor the key into the token", async () => {
    const token = await signSessionToken(keys, NOW);
    const readable = Buffer.from(token.split(".")[1], "base64url").toString("utf8");

    expect(readable).not.toContain("correct horse battery");
    expect(token).not.toContain(Buffer.from(keys.signingKey).toString("base64url"));
  });
});

describe("verifySessionToken", () => {
  it("accepts a fresh token and reports its lifetime", async () => {
    const token = await signSessionToken(keys, NOW);
    expect(await verifySessionToken(token, keys, NOW)).toEqual({
      issuedAt: NOW_SECONDS,
      expiresAt: NOW_SECONDS + SESSION_LIFETIME_SECONDS,
    });
  });

  it("accepts a token until the moment it expires, and not after", async () => {
    const token = await signSessionToken(keys, NOW);
    const expiry = NOW + SESSION_LIFETIME_SECONDS * 1000;

    expect(await verifySessionToken(token, keys, NOW + 6 * DAY_MS)).not.toBeNull();
    expect(await verifySessionToken(token, keys, expiry - 1000)).not.toBeNull();
    expect(await verifySessionToken(token, keys, expiry)).toBeNull();
    expect(await verifySessionToken(token, keys, expiry + DAY_MS)).toBeNull();
  });

  it("rejects a token that claims to come from the future", async () => {
    const token = await signSessionToken(keys, NOW + DAY_MS);
    expect(await verifySessionToken(token, keys, NOW)).toBeNull();
  });

  it("rejects every token once the password has changed", async () => {
    const token = await signSessionToken(keys, NOW);

    expect(await verifySessionToken(token, keysFor("a new passphrase"), NOW)).toBeNull();
    expect(await verifySessionToken(token, keysFor("correct horse battery"), NOW)).not.toBeNull();
  });

  it("rejects old tokens after a password change even when the signing secret stays", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const before = keysFor("correct horse battery", secret);
    const after = keysFor("a new passphrase", secret);
    expect(after.signingKey).toEqual(before.signingKey);

    const token = await signSessionToken(before, NOW);

    expect(await verifySessionToken(token, before, NOW)).not.toBeNull();
    expect(await verifySessionToken(token, after, NOW)).toBeNull();
  });

  it("rejects every token once the session secret has changed", async () => {
    const before = keysFor("correct horse battery", "0123456789abcdef0123456789abcdef");
    const after = keysFor("correct horse battery", "fedcba9876543210fedcba9876543210");
    const token = await signSessionToken(before, NOW);

    expect(await verifySessionToken(token, after, NOW)).toBeNull();
  });

  it("rejects a token whose payload was altered", async () => {
    const token = await signSessionToken(keys, NOW);
    const payload = decodeJwt(token);
    const extended = withPart(token, 1, encode({ ...payload, exp: NOW_SECONDS + 10 ** 9 }));

    expect(await verifySessionToken(extended, keys, NOW)).toBeNull();
  });

  it("rejects a token whose signature was altered", async () => {
    const token = await signSessionToken(keys, NOW);
    const signature = token.split(".")[2];
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);

    expect(await verifySessionToken(withPart(token, 2, flipped), keys, NOW)).toBeNull();
    expect(await verifySessionToken(withPart(token, 2, ""), keys, NOW)).toBeNull();
  });

  it("rejects an unsigned token and one that names another algorithm", async () => {
    const token = await signSessionToken(keys, NOW);
    const payload = token.split(".")[1];

    const unsigned = `${encode({ alg: "none" })}.${payload}.`;
    const otherAlgorithm = await new SignJWT({ sv: keys.sessionVersion })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuer("uwais")
      .setSubject("admin")
      .setIssuedAt(NOW_SECONDS)
      .setExpirationTime(NOW_SECONDS + 60)
      .sign(new Uint8Array(64).fill(7));

    const relabelled = withPart(token, 0, encode({ alg: "none" }));
    const longKey: SessionKeys = { ...keys, signingKey: new Uint8Array(64).fill(7) };

    expect(await verifySessionToken(unsigned, keys, NOW)).toBeNull();
    expect(await verifySessionToken(relabelled, keys, NOW)).toBeNull();
    expect(await verifySessionToken(otherAlgorithm, longKey, NOW)).toBeNull();
  });

  it("rejects a token signed with another key", async () => {
    const stranger: SessionKeys = { ...keys, signingKey: new Uint8Array(32).fill(1) };
    const token = await signSessionToken(stranger, NOW);
    expect(await verifySessionToken(token, keys, NOW)).toBeNull();
  });

  it("rejects correctly signed tokens with missing or wrong claims", async () => {
    const sv = keys.sessionVersion;
    const forged = [
      await forge({}),
      await forge({ sv: 42 }),
      await forge({ sv: `${sv}x` }),
      await forge({ sv }, { subject: "visitor" }),
      await forge({ sv }, { expiresAt: null }),
      await forge(
        { sv },
        { issuedAt: NOW_SECONDS - SESSION_LIFETIME_SECONDS - 60, expiresAt: NOW_SECONDS + 3600 },
      ),
      await new SignJWT({ sv })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("admin")
        .setIssuedAt(NOW_SECONDS)
        .setExpirationTime(NOW_SECONDS + 60)
        .sign(keys.signingKey),
      await new SignJWT({ sv })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("uwais")
        .setSubject("admin")
        .setExpirationTime(NOW_SECONDS + 60)
        .sign(keys.signingKey),
    ];

    for (const token of forged) {
      expect(await verifySessionToken(token, keys, NOW)).toBeNull();
    }
    // The helper itself produces a valid token when nothing is wrong with the claims.
    expect(await verifySessionToken(await forge({ sv }), keys, NOW)).not.toBeNull();
  });

  it.each([undefined, null, "", "not-a-token", "a.b.c", "....", "x".repeat(5000)])(
    "returns null for %j instead of throwing",
    async (token) => {
      expect(await verifySessionToken(token, keys, NOW)).toBeNull();
    },
  );
});
