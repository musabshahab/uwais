import { describe, expect, it } from "vitest";
import { UNREACHABLE_FAILURE, firstQueryValue, isSignedOut, loginHref, readLoginQuery } from "./session";

describe("loginHref", () => {
  it("returns to the page the user was on, query string included", () => {
    expect(loginHref("/admin/timetable?month=2027-03")).toBe(
      "/admin/login?next=%2Fadmin%2Ftimetable%3Fmonth%3D2027-03",
    );
  });

  it("leaves the dashboard out, as it is the default", () => {
    expect(loginHref("/admin")).toBe("/admin/login");
  });

  it("can say that the session ended", () => {
    expect(loginHref("/admin/import", { expired: true })).toBe("/admin/login?next=%2Fadmin%2Fimport&expired=1");
    expect(loginHref("/admin", { expired: true })).toBe("/admin/login?expired=1");
  });

  it("never returns to somewhere outside the admin area", () => {
    expect(loginHref("https://evil.example/admin")).toBe("/admin/login");
    expect(loginHref("//evil.example")).toBe("/admin/login");
    expect(loginHref("/timetable")).toBe("/admin/login");
    expect(loginHref("/admin/login?next=/admin/login")).toBe("/admin/login");
  });
});

describe("readLoginQuery", () => {
  it("reads a safe return path and the expired note", () => {
    expect(readLoginQuery({ next: "/admin/settings", expired: "1" })).toEqual({
      next: "/admin/settings",
      expired: true,
    });
  });

  it("falls back to the dashboard for a missing or unsafe return path", () => {
    expect(readLoginQuery({})).toEqual({ next: "/admin", expired: false });
    expect(readLoginQuery({ next: "https://evil.example" }).next).toBe("/admin");
    expect(readLoginQuery({ next: "/\\evil.example" }).next).toBe("/admin");
  });

  it("uses the first value of a repeated parameter", () => {
    expect(readLoginQuery({ next: ["/admin/import", "/admin/settings"] }).next).toBe("/admin/import");
    expect(readLoginQuery({ expired: ["0", "1"] }).expired).toBe(false);
  });

  it("round-trips with loginHref", () => {
    const href = loginHref("/admin/timetable?month=2027-03", { expired: true });
    const query = Object.fromEntries(new URL(href, "http://x.invalid").searchParams.entries());
    expect(readLoginQuery(query)).toEqual({ next: "/admin/timetable?month=2027-03", expired: true });
  });
});

describe("firstQueryValue", () => {
  it("handles one, several and no values", () => {
    expect(firstQueryValue("a")).toBe("a");
    expect(firstQueryValue(["a", "b"])).toBe("a");
    expect(firstQueryValue([])).toBeUndefined();
    expect(firstQueryValue(undefined)).toBeUndefined();
  });
});

describe("isSignedOut", () => {
  it("recognises only the unauthenticated failure", () => {
    expect(isSignedOut({ ok: false, code: "unauthenticated" })).toBe(true);
    expect(isSignedOut({ ok: false, code: "invalid" })).toBe(false);
    expect(isSignedOut({ ok: true })).toBe(false);
    expect(isSignedOut(UNREACHABLE_FAILURE)).toBe(false);
  });
});
