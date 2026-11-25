import { describe, expect, it } from "vitest";
import { ADMIN_HOME_PATH, isLoginPath, safeAdminRedirect } from "./paths";

describe("safeAdminRedirect", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/", "/admin/"],
    ["/admin/timetable", "/admin/timetable"],
    ["/admin/timetable?month=2026-12&view=list", "/admin/timetable?month=2026-12&view=list"],
    ["/admin/announcements/12/edit", "/admin/announcements/12/edit"],
    ["/admin/settings#tv", "/admin/settings"],
    ["/admin/./settings", "/admin/settings"],
    ["/admin/a/../settings", "/admin/settings"],
  ])("keeps %j inside the admin area", (next, expected) => {
    expect(safeAdminRedirect(next)).toBe(expected);
  });

  it.each([
    "https://evil.example/admin",
    "http://evil.example/admin",
    "//evil.example/admin",
    "///evil.example/admin",
    "/\\evil.example/admin",
    "\\\\evil.example\\admin",
    "/admin\\..\\..\\evil",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "admin/settings",
    "/",
    "",
    "/administrator",
    "/admin-tools",
    "/tv",
    "/api/display",
    "/admin/../tv",
    "/admin/%2e%2e/tv",
    "/admin/..%2f..%2ftv/../../tv",
    "/admin/login",
    "/admin/login/",
    "/admin/login?next=/admin/login",
    "/admin/settings\nSet-Cookie: x=1",
    "/admin/\u0000",
    "/admin/\tsettings",
    `/admin/${"a".repeat(600)}`,
  ])("falls back to the dashboard for %j", (next) => {
    expect(safeAdminRedirect(next)).toBe(ADMIN_HOME_PATH);
  });

  it.each([undefined, null, 42, ["/admin/settings"], { toString: () => "/admin/settings" }])(
    "falls back to the dashboard for a non-string (%j)",
    (next) => {
      expect(safeAdminRedirect(next)).toBe(ADMIN_HOME_PATH);
    },
  );

  it("only ever returns a path on this site", () => {
    for (const next of ["/admin/x?to=https://evil.example", "/admin/@evil.example", "/admin//x"]) {
      const result = safeAdminRedirect(next);
      expect(result.startsWith("/admin")).toBe(true);
      expect(new URL(result, "https://mosque.example").origin).toBe("https://mosque.example");
    }
  });
});

describe("isLoginPath", () => {
  it("recognises the sign-in page with or without a trailing slash", () => {
    expect(isLoginPath("/admin/login")).toBe(true);
    expect(isLoginPath("/admin/login/")).toBe(true);
    expect(isLoginPath("/admin")).toBe(false);
    expect(isLoginPath("/admin/login/help")).toBe(false);
    expect(isLoginPath("/login")).toBe(false);
  });
});
