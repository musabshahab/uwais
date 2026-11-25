import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAdminConfig } from "@/lib/auth/config";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/token";
import { config, proxy } from "./proxy";

const ORIGIN = "https://mosque.example";
const savedPassword = process.env.ADMIN_PASSWORD;
const savedSecret = process.env.SESSION_SECRET;

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse battery";
  delete process.env.SESSION_SECRET;
});

afterEach(() => {
  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedPassword;
  if (savedSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedSecret;
});

/** A session token as the sign-in flow would issue it, `ageMs` ago. */
async function sessionToken(ageMs = 0): Promise<string> {
  const admin = getAdminConfig();
  if (!admin.enabled) throw new Error(admin.message);
  return signSessionToken(admin, Date.now() - ageMs);
}

/** A request for `path`, optionally carrying a session cookie. */
function requestFor(path: string, options: { token?: string; method?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.token !== undefined) headers.set("cookie", `${SESSION_COOKIE_NAME}=${options.token}`);
  return new NextRequest(`${ORIGIN}${path}`, { method: options.method ?? "GET", headers });
}

/** Where a response redirects to, or null when the request was let through. */
function redirectTarget(response: Response): string | null {
  return response.headers.get("location");
}

/** True when the response lets the request continue to the page. */
function passedThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1" && redirectTarget(response) === null;
}

/** True when the response tells the browser to drop the session cookie. */
function clearsCookie(response: Response): boolean {
  const header = response.headers.get("set-cookie") ?? "";
  return header.startsWith(`${SESSION_COOKIE_NAME}=;`);
}

describe("matcher", () => {
  it("covers the admin area only", () => {
    expect(config.matcher).toEqual(["/admin/:path*"]);
  });
});

describe("signed-out visitors", () => {
  it("are sent from the dashboard to the sign-in page", async () => {
    const response = await proxy(requestFor("/admin"));
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe(`${ORIGIN}/admin/login`);
  });

  it("are sent back to the page they asked for after signing in", async () => {
    const response = await proxy(requestFor("/admin/timetable?month=2026-12&view=list"));
    const target = new URL(redirectTarget(response) ?? "");

    expect(target.origin + target.pathname).toBe(`${ORIGIN}/admin/login`);
    expect(target.searchParams.get("next")).toBe("/admin/timetable?month=2026-12&view=list");
  });

  it("can open the sign-in page", async () => {
    expect(passedThrough(await proxy(requestFor("/admin/login")))).toBe(true);
    expect(passedThrough(await proxy(requestFor("/admin/login?next=/admin/settings")))).toBe(true);
  });

  it("are redirected for HEAD requests too", async () => {
    const response = await proxy(requestFor("/admin/settings", { method: "HEAD" }));
    expect(redirectTarget(response)).toContain("/admin/login");
  });

  it("have form posts passed on to the action, which checks the session itself", async () => {
    expect(passedThrough(await proxy(requestFor("/admin/settings", { method: "POST" })))).toBe(true);
    expect(passedThrough(await proxy(requestFor("/admin/login", { method: "POST" })))).toBe(true);
  });

  it("never redirect to another site", async () => {
    for (const path of ["/admin//evil.example", "/admin/x?next=https://evil.example"]) {
      const target = new URL(redirectTarget(await proxy(requestFor(path))) ?? "");
      expect(target.origin).toBe(ORIGIN);
      expect(target.pathname).toBe("/admin/login");
    }
  });
});

describe("visitors with a cookie that is no longer good", () => {
  it("are treated as signed out and lose the cookie", async () => {
    for (const token of ["garbage", await sessionToken(8 * 24 * 60 * 60 * 1000)]) {
      const response = await proxy(requestFor("/admin/settings", { token }));
      expect(redirectTarget(response)).toContain("/admin/login?next=%2Fadmin%2Fsettings");
      expect(clearsCookie(response)).toBe(true);
    }
  });

  it("stay on the sign-in page instead of bouncing to the dashboard and back", async () => {
    const response = await proxy(requestFor("/admin/login", { token: "garbage" }));
    expect(passedThrough(response)).toBe(true);
    expect(clearsCookie(response)).toBe(true);
  });

  it("are signed out by a password change", async () => {
    const token = await sessionToken();
    process.env.ADMIN_PASSWORD = "a new passphrase";

    const response = await proxy(requestFor("/admin", { token }));

    expect(redirectTarget(response)).toBe(`${ORIGIN}/admin/login`);
    expect(clearsCookie(response)).toBe(true);
  });
});

describe("the signed-in admin", () => {
  it("reaches admin pages without a redirect or a cookie change", async () => {
    const token = await sessionToken();
    for (const path of ["/admin", "/admin/timetable?month=2026-12", "/admin/announcements/3"]) {
      const response = await proxy(requestFor(path, { token }));
      expect(passedThrough(response)).toBe(true);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("is sent from the sign-in page to the dashboard", async () => {
    const response = await proxy(requestFor("/admin/login", { token: await sessionToken() }));
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe(`${ORIGIN}/admin`);
  });

  it("is sent from the sign-in page to the page named by next, if it is an admin page", async () => {
    const token = await sessionToken();
    const cases: [string, string][] = [
      ["/admin/login?next=%2Fadmin%2Fsettings", "/admin/settings"],
      ["/admin/login?next=%2Fadmin%2Ftimetable%3Fmonth%3D2026-12", "/admin/timetable?month=2026-12"],
      ["/admin/login?next=https%3A%2F%2Fevil.example%2Fadmin", "/admin"],
      ["/admin/login?next=%2F%2Fevil.example", "/admin"],
      ["/admin/login?next=%2Ftv", "/admin"],
      ["/admin/login?next=%2Fadmin%2Flogin", "/admin"],
    ];
    for (const [path, expected] of cases) {
      const response = await proxy(requestFor(path, { token }));
      expect(redirectTarget(response)).toBe(`${ORIGIN}${expected}`);
    }
  });
});

describe("with the admin area switched off", () => {
  it("sends every admin page to the sign-in page, which explains why", async () => {
    const token = await sessionToken();
    delete process.env.ADMIN_PASSWORD;

    expect(redirectTarget(await proxy(requestFor("/admin", { token })))).toBe(
      `${ORIGIN}/admin/login`,
    );
    expect(passedThrough(await proxy(requestFor("/admin/login")))).toBe(true);
  });
});
