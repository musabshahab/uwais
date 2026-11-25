import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  headers: new Headers(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      request.jar.has(name) ? { name, value: request.jar.get(name) } : undefined,
    set: (name: string, value: string) => {
      request.jar.set(name, value);
    },
  })),
  headers: vi.fn(async () => request.headers),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getLoginRateLimiter } from "./rate-limit";
import { getSession } from "./session";
import { signIn } from "./sign-in";
import { SESSION_COOKIE_NAME } from "./token";

const PASSWORD = "correct horse battery";
const NOON = Date.UTC(2026, 10, 25, 12);
const MINUTE = 60 * 1000;
const savedPassword = process.env.ADMIN_PASSWORD;
const savedSecret = process.env.SESSION_SECRET;

/** Makes the next sign-in attempts come from `address`. */
function from(address: string): void {
  request.headers = new Headers({ "x-forwarded-for": address });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
  request.jar.clear();
  from("203.0.113.1");
  process.env.ADMIN_PASSWORD = PASSWORD;
  delete process.env.SESSION_SECRET;
  getLoginRateLimiter().reset();
});

afterEach(() => {
  vi.useRealTimers();
  getLoginRateLimiter().reset();
  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedPassword;
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
});

describe("signIn", () => {
  it("starts a session for the right password", async () => {
    expect(await signIn(PASSWORD)).toEqual({ ok: true });
    expect(request.jar.has(SESSION_COOKIE_NAME)).toBe(true);
    expect(await getSession()).toEqual({ authenticated: true });
  });

  it("rejects a wrong password, sets no cookie and counts down the attempts", async () => {
    expect(await signIn("wrong")).toEqual({ ok: false, reason: "invalid", remainingAttempts: 4 });
    expect(await signIn("")).toEqual({ ok: false, reason: "invalid", remainingAttempts: 3 });
    expect(request.jar.size).toBe(0);
  });

  it.each([undefined, null, 42, [PASSWORD], { password: PASSWORD }])(
    "rejects a password that is not a string (%j)",
    async (password) => {
      expect(await signIn(password)).toMatchObject({ ok: false, reason: "invalid" });
      expect(request.jar.size).toBe(0);
    },
  );

  it("locks the client out on the fifth failure and says for how long", async () => {
    for (let attempt = 0; attempt < 4; attempt++) await signIn("wrong");

    expect(await signIn("wrong")).toEqual({
      ok: false,
      reason: "locked",
      retryAfterSeconds: 15 * 60,
    });
  });

  it("does not look at the password while the client is locked out", async () => {
    for (let attempt = 0; attempt < 5; attempt++) await signIn("wrong");

    expect(await signIn(PASSWORD)).toMatchObject({ ok: false, reason: "locked" });
    expect(request.jar.size).toBe(0);
  });

  it("lets the client try again once the window has passed", async () => {
    for (let attempt = 0; attempt < 5; attempt++) await signIn("wrong");

    vi.setSystemTime(NOON + 15 * MINUTE - 1000);
    expect(await signIn(PASSWORD)).toEqual({ ok: false, reason: "locked", retryAfterSeconds: 1 });

    vi.setSystemTime(NOON + 15 * MINUTE);
    expect(await signIn(PASSWORD)).toEqual({ ok: true });
  });

  it("clears the count after a successful sign-in", async () => {
    for (let attempt = 0; attempt < 4; attempt++) await signIn("wrong");
    expect(await signIn(PASSWORD)).toEqual({ ok: true });

    expect(await signIn("wrong")).toEqual({ ok: false, reason: "invalid", remainingAttempts: 4 });
  });

  it("counts each address separately, by the first hop of X-Forwarded-For", async () => {
    from("203.0.113.1, 10.0.0.1");
    for (let attempt = 0; attempt < 5; attempt++) await signIn("wrong");

    from("203.0.113.1");
    expect(await signIn(PASSWORD)).toMatchObject({ ok: false, reason: "locked" });

    from("203.0.113.2, 10.0.0.1");
    expect(await signIn(PASSWORD)).toEqual({ ok: true });
  });

  it("puts requests without a usable address into one shared bucket", async () => {
    request.headers = new Headers();
    for (let attempt = 0; attempt < 3; attempt++) await signIn("wrong");

    request.headers = new Headers({ "x-forwarded-for": "not an address" });
    expect(await signIn("wrong")).toEqual({ ok: false, reason: "invalid", remainingAttempts: 1 });
  });

  it("stops a guesser who changes address on every attempt", async () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      from(`198.51.100.${attempt + 1}`);
      expect(await signIn("wrong")).toMatchObject({ ok: false });
    }

    from("203.0.113.200");
    expect(await signIn(PASSWORD)).toMatchObject({ ok: false, reason: "locked" });
    expect(request.jar.size).toBe(0);
  });

  it("refuses everything while the admin area is switched off", async () => {
    delete process.env.ADMIN_PASSWORD;

    for (const password of ["", "undefined", "admin", "password", PASSWORD]) {
      expect(await signIn(password)).toMatchObject({
        ok: false,
        reason: "disabled",
        cause: "missing_password",
      });
    }
    expect(request.jar.size).toBe(0);
    // A switched-off admin area is not a failed guess: nothing was counted.
    expect(getLoginRateLimiter().check("203.0.113.1").remainingAttempts).toBe(5);
  });

  it("explains a weak configuration instead of signing in", async () => {
    process.env.ADMIN_PASSWORD = "short";
    expect(await signIn("short")).toMatchObject({
      ok: false,
      reason: "disabled",
      cause: "weak_password",
    });

    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.SESSION_SECRET = "too-short";
    expect(await signIn(PASSWORD)).toMatchObject({
      ok: false,
      reason: "disabled",
      cause: "weak_session_secret",
    });
  });
});
