import { afterEach, describe, expect, it } from "vitest";
import {
  MIN_ADMIN_PASSWORD_LENGTH,
  MIN_SESSION_SECRET_LENGTH,
  getAdminConfig,
  readAdminConfig,
  type AdminEnabled,
} from "./config";

const PASSWORD = "correct horse battery";
const SECRET = "s".repeat(MIN_SESSION_SECRET_LENGTH);
const savedPassword = process.env.ADMIN_PASSWORD;
const savedSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedPassword;
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
});

/** The configuration for an environment that must enable the admin area. */
function enabled(env: Record<string, string | undefined>): AdminEnabled {
  const config = readAdminConfig(env);
  if (!config.enabled) throw new Error(`Expected the admin area to be on: ${config.message}`);
  return config;
}

describe("readAdminConfig", () => {
  it.each([{}, { ADMIN_PASSWORD: "" }, { ADMIN_PASSWORD: "   " }])(
    "switches the admin area off without a password (%j)",
    (env) => {
      const config = readAdminConfig(env);
      expect(config).toMatchObject({ enabled: false, reason: "missing_password" });
      expect(config).not.toHaveProperty("password");
      expect(config).not.toHaveProperty("signingKey");
    },
  );

  it("refuses a password that is too short and accepts one of the minimum length", () => {
    const short = "x".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1);
    expect(readAdminConfig({ ADMIN_PASSWORD: short })).toMatchObject({
      enabled: false,
      reason: "weak_password",
    });
    expect(readAdminConfig({ ADMIN_PASSWORD: `${short}x` }).enabled).toBe(true);
  });

  it("refuses a session secret that is too short rather than signing with it", () => {
    const config = readAdminConfig({
      ADMIN_PASSWORD: PASSWORD,
      SESSION_SECRET: "s".repeat(MIN_SESSION_SECRET_LENGTH - 1),
    });
    expect(config).toMatchObject({ enabled: false, reason: "weak_session_secret" });
  });

  it("never puts a secret in the explanation", () => {
    const short = readAdminConfig({ ADMIN_PASSWORD: "hunter2" });
    const weakSecret = readAdminConfig({ ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: "tiny-secret" });
    expect(JSON.stringify(short)).not.toContain("hunter2");
    expect(JSON.stringify(weakSecret)).not.toContain("tiny-secret");
    expect(JSON.stringify(weakSecret)).not.toContain(PASSWORD);
  });

  it("derives a 32-byte signing key from the password when no secret is set", () => {
    const config = enabled({ ADMIN_PASSWORD: PASSWORD });
    expect(config.password).toBe(PASSWORD);
    expect(config.signingKey).toBeInstanceOf(Uint8Array);
    expect(config.signingKey).toHaveLength(32);
    expect(config.sessionVersion).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("treats a blank secret as no secret", () => {
    const derived = enabled({ ADMIN_PASSWORD: PASSWORD });
    const blank = enabled({ ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: "   " });
    expect(blank.signingKey).toEqual(derived.signingKey);
  });

  it("is deterministic, so every process and the proxy agree", () => {
    const first = enabled({ ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: SECRET });
    const second = enabled({ ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: SECRET });
    expect(second.signingKey).toEqual(first.signingKey);
    expect(second.sessionVersion).toBe(first.sessionVersion);
  });

  it("signs with the secret when one is set, and keeps the version tied to the password", () => {
    const derived = enabled({ ADMIN_PASSWORD: PASSWORD });
    const withSecret = enabled({ ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: SECRET });
    const otherSecret = enabled({ ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: `${SECRET}!` });

    expect(withSecret.signingKey).not.toEqual(derived.signingKey);
    expect(otherSecret.signingKey).not.toEqual(withSecret.signingKey);
    expect(withSecret.sessionVersion).toBe(derived.sessionVersion);
  });

  it("changes the session version and the derived key when the password changes", () => {
    const before = enabled({ ADMIN_PASSWORD: PASSWORD });
    const after = enabled({ ADMIN_PASSWORD: `${PASSWORD}!` });
    expect(after.sessionVersion).not.toBe(before.sessionVersion);
    expect(after.signingKey).not.toEqual(before.signingKey);

    const withSecretBefore = enabled({ ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: SECRET });
    const withSecretAfter = enabled({ ADMIN_PASSWORD: `${PASSWORD}!`, SESSION_SECRET: SECRET });
    expect(withSecretAfter.signingKey).toEqual(withSecretBefore.signingKey);
    expect(withSecretAfter.sessionVersion).not.toBe(withSecretBefore.sessionVersion);
  });

  it("does not use the signing key or the password itself as the session version", () => {
    const config = enabled({ ADMIN_PASSWORD: PASSWORD });
    expect(config.sessionVersion).not.toContain(PASSWORD);
    expect(Buffer.from(config.signingKey).toString("base64url")).not.toContain(
      config.sessionVersion,
    );
  });

  it("treats differently composed forms of the same password alike", () => {
    const composed = enabled({ ADMIN_PASSWORD: "café-au-lait" });
    const decomposed = enabled({ ADMIN_PASSWORD: "café-au-lait" });
    expect(decomposed.sessionVersion).toBe(composed.sessionVersion);
  });
});

describe("getAdminConfig", () => {
  it("reads the environment and remembers the answer until it changes", () => {
    delete process.env.SESSION_SECRET;
    process.env.ADMIN_PASSWORD = PASSWORD;
    const first = getAdminConfig();
    expect(first.enabled).toBe(true);
    expect(getAdminConfig()).toBe(first);

    process.env.ADMIN_PASSWORD = `${PASSWORD}!`;
    const second = getAdminConfig();
    expect(second).not.toBe(first);
    expect(second.enabled && first.enabled && second.sessionVersion !== first.sessionVersion).toBe(
      true,
    );

    delete process.env.ADMIN_PASSWORD;
    expect(getAdminConfig()).toMatchObject({ enabled: false, reason: "missing_password" });
  });
});
