import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  /** Cookies the browser sent, plus whatever the code under test set. */
  jar: new Map<string, string>(),
  /** Every `cookies().set()` call, in order. */
  written: [] as { name: string; value: string; options: unknown }[],
  headers: new Headers(),
  /** When set, `cookies()` rejects with it, as it does without a request. */
  cookiesError: null as Error | null,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => {
    if (request.cookiesError) throw request.cookiesError;
    return {
      get: (name: string) =>
        request.jar.has(name) ? { name, value: request.jar.get(name) } : undefined,
      set: (name: string, value: string, options: unknown) => {
        request.written.push({ name, value, options });
        request.jar.set(name, value);
      },
    };
  }),
  headers: vi.fn(async () => request.headers),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

// `connection()` throws outside a Next.js request; the tests stand in for the framework.
vi.mock("next/server", () => ({ connection: vi.fn(async (): Promise<void> => undefined) }));

import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  createSession,
  destroySession,
  getAdminStatus,
  getSession,
  isSecureRequest,
  requireAdmin,
  sessionCookieOptions,
} from "./session";
import { SESSION_COOKIE_NAME, SESSION_LIFETIME_SECONDS } from "./token";

const NOON = Date.UTC(2026, 10, 25, 12);
const DAY_MS = 24 * 60 * 60 * 1000;
const savedPassword = process.env.ADMIN_PASSWORD;
const savedSecret = process.env.SESSION_SECRET;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
  request.jar.clear();
  request.written.length = 0;
  request.headers = new Headers();
  request.cookiesError = null;
  process.env.ADMIN_PASSWORD = "correct horse battery";
  delete process.env.SESSION_SECRET;
  vi.mocked(redirect).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedPassword;
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
});

describe("isSecureRequest", () => {
  /** Headers with the given entries. */
  function headersOf(entries: Record<string, string>): Headers {
    return new Headers(entries);
  }

  it("trusts the protocol the nearest proxy reports", () => {
    expect(isSecureRequest(headersOf({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(isSecureRequest(headersOf({ "x-forwarded-proto": "HTTPS" }))).toBe(true);
    expect(isSecureRequest(headersOf({ "x-forwarded-proto": "https, http" }))).toBe(true);
    expect(isSecureRequest(headersOf({ "x-forwarded-proto": "http" }))).toBe(false);
    expect(isSecureRequest(headersOf({ "x-forwarded-proto": "http, https" }))).toBe(false);
  });

  it("prefers the forwarded protocol over the URL the server itself saw", () => {
    const behindTlsProxy = headersOf({ "x-forwarded-proto": "https" });
    expect(isSecureRequest(behindTlsProxy, "http://10.0.0.5:3000/admin/login")).toBe(true);
    const plain = headersOf({ "x-forwarded-proto": "http" });
    expect(isSecureRequest(plain, "https://mosque.example/admin/login")).toBe(false);
  });

  it("falls back to the request URL, then to the Origin header", () => {
    expect(isSecureRequest(headersOf({}), "https://mosque.example/admin")).toBe(true);
    expect(isSecureRequest(headersOf({}), "http://mosque.example/admin")).toBe(false);
    expect(isSecureRequest(headersOf({ origin: "https://mosque.example" }))).toBe(true);
    expect(isSecureRequest(headersOf({ origin: "http://192.168.1.20:3000" }))).toBe(false);
    expect(isSecureRequest(headersOf({}))).toBe(false);
  });

  it("does not depend on NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isSecureRequest(headersOf({ "x-forwarded-proto": "http" }))).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(isSecureRequest(headersOf({ "x-forwarded-proto": "https" }))).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("getAdminStatus", () => {
  it("says the admin area is on, and nothing else", async () => {
    expect(await getAdminStatus()).toEqual({ enabled: true });
  });

  it("explains why the admin area is off without revealing a secret", async () => {
    delete process.env.ADMIN_PASSWORD;
    expect(await getAdminStatus()).toMatchObject({ enabled: false, reason: "missing_password" });

    process.env.ADMIN_PASSWORD = "hunter2";
    const weak = await getAdminStatus();
    expect(weak).toMatchObject({ enabled: false, reason: "weak_password" });
    expect(JSON.stringify(weak)).not.toContain("hunter2");
  });

  it("waits for a request, because a build does not have the server's environment", async () => {
    vi.mocked(connection).mockRejectedValueOnce(new Error("no request yet"));
    await expect(getAdminStatus()).rejects.toThrow("no request yet");
  });
});

describe("sessionCookieOptions", () => {
  it("describes an httpOnly, same-site, site-wide cookie that lasts seven days", () => {
    expect(sessionCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 7 * 24 * 60 * 60,
    });
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});

describe("createSession", () => {
  it("sets the session cookie, without Secure over plain HTTP", async () => {
    request.headers = new Headers({ "x-forwarded-proto": "http" });

    await createSession();

    expect(request.written).toHaveLength(1);
    expect(request.written[0].name).toBe(SESSION_COOKIE_NAME);
    expect(request.written[0].name).toBe("uwais_admin");
    expect(request.written[0].value.split(".")).toHaveLength(3);
    expect(request.written[0].options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: SESSION_LIFETIME_SECONDS,
    });
  });

  it("marks the cookie Secure when the visitor is on HTTPS", async () => {
    request.headers = new Headers({ "x-forwarded-proto": "https" });
    await createSession();
    expect(request.written[0].options).toMatchObject({ secure: true, httpOnly: true });
  });

  it("refuses to start a session while the admin area is switched off", async () => {
    delete process.env.ADMIN_PASSWORD;
    await expect(createSession()).rejects.toThrow(/switched off/);
    expect(request.written).toEqual([]);
  });
});

describe("getSession", () => {
  it("is signed out without a cookie", async () => {
    expect(await getSession()).toEqual({ authenticated: false });
  });

  it("is signed in after createSession, for seven days", async () => {
    await createSession();
    expect(await getSession()).toEqual({ authenticated: true });

    vi.setSystemTime(NOON + 7 * DAY_MS - 1000);
    expect(await getSession()).toEqual({ authenticated: true });

    vi.setSystemTime(NOON + 7 * DAY_MS);
    expect(await getSession()).toEqual({ authenticated: false });
  });

  it("is signed out for a cookie that is not a valid token", async () => {
    request.jar.set(SESSION_COOKIE_NAME, "garbage");
    expect(await getSession()).toEqual({ authenticated: false });
  });

  it("signs everybody out when the password changes", async () => {
    await createSession();
    process.env.ADMIN_PASSWORD = "a new passphrase";
    expect(await getSession()).toEqual({ authenticated: false });

    process.env.ADMIN_PASSWORD = "correct horse battery";
    expect(await getSession()).toEqual({ authenticated: true });
  });

  it("signs everybody out when the admin area is switched off", async () => {
    await createSession();
    delete process.env.ADMIN_PASSWORD;
    expect(await getSession()).toEqual({ authenticated: false });
  });

  it("never answers without a request, even when the admin area is switched off", async () => {
    // During a build `cookies()` does not resolve. Answering "signed out" from the
    // environment alone would prerender a redirect into every admin page.
    delete process.env.ADMIN_PASSWORD;
    request.cookiesError = new Error("no request yet");
    await expect(getSession()).rejects.toThrow("no request yet");
  });
});

describe("destroySession", () => {
  it("expires the cookie with the attributes it was set with", async () => {
    request.headers = new Headers({ "x-forwarded-proto": "https" });
    await createSession();

    await destroySession();

    expect(request.written[1]).toEqual({
      name: SESSION_COOKIE_NAME,
      value: "",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 0 },
    });
    expect(await getSession()).toEqual({ authenticated: false });
  });
});

describe("requireAdmin", () => {
  it("lets the signed-in admin through", async () => {
    await createSession();
    await expect(requireAdmin()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects everybody else to the sign-in page", async () => {
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/login");

    request.jar.set(SESSION_COOKIE_NAME, "garbage");
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/login");

    delete process.env.ADMIN_PASSWORD;
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(redirect).toHaveBeenCalledTimes(3);
  });
});
