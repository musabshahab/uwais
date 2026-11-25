import { describe, expect, it } from "vitest";
import { adminDisabledHelp } from "./sign-in-help";

describe("adminDisabledHelp", () => {
  it("explains how to set a password on a new installation", () => {
    const help = adminDisabledHelp("missing_password", 8, 32);
    expect(help.title).toBe("The admin area is not switched on yet");
    expect(help.steps).toHaveLength(3);
    expect(help.steps[1]).toContain("ADMIN_PASSWORD");
    expect(help.steps[1]).toContain("at least 8 characters");
  });

  it("names the setting to change for each other reason", () => {
    expect(adminDisabledHelp("weak_password", 10, 32).steps[0]).toContain("at least 10 characters");
    expect(adminDisabledHelp("weak_session_secret", 8, 40).steps[0]).toContain("at least 40 characters");
    expect(adminDisabledHelp("weak_session_secret", 8, 40).body).toContain("SESSION_SECRET");
  });

  it("always ends with restarting the website", () => {
    for (const reason of ["missing_password", "weak_password", "weak_session_secret"] as const) {
      expect(adminDisabledHelp(reason, 8, 32).steps.at(-1)).toMatch(/^Restart or redeploy/);
    }
  });
});
