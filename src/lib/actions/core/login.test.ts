import { describe, expect, it } from "vitest";
import { INITIAL_LOGIN_STATE } from "../types";
import { LOGIN_SERVER_PROBLEM, loginFailureState } from "./login";

describe("loginFailureState", () => {
  it("says the password is wrong without saying how many attempts remain", () => {
    const few = loginFailureState({ ok: false, reason: "invalid", remainingAttempts: 4 });
    const last = loginFailureState({ ok: false, reason: "invalid", remainingAttempts: 0 });

    expect(few).toStrictEqual({ error: "That password is not correct. Check it and try again." });
    expect(last).toStrictEqual(few);
  });

  it.each([
    [0, "less than a minute"],
    [1, "1 min"],
    [45, "1 min"],
    [60, "1 min"],
    [61, "2 min"],
    [900, "15 min"],
    [3600, "1 hr"],
    [3601, "1 hr 1 min"],
  ])("gives the wait of a locked sign-in in whole minutes, rounded up (%i s)", (seconds, words) => {
    const state = loginFailureState({ ok: false, reason: "locked", retryAfterSeconds: seconds });

    expect(state.retryAfterSeconds).toBe(seconds);
    expect(state.error).toBe(
      `Too many failed attempts. Signing in is paused; try again in ${words}.`,
    );
  });

  it("does not tell a visitor which setting is missing when the admin area is off", () => {
    const state = loginFailureState({
      ok: false,
      reason: "disabled",
      cause: "missing_password",
      message: "Set ADMIN_PASSWORD in the environment to switch the admin area on.",
    });

    expect(state).toStrictEqual({
      error: "Signing in is switched off on this website at the moment.",
    });
    expect(JSON.stringify(state)).not.toMatch(/ADMIN_PASSWORD|environment|missing/);
  });

  it("only carries retryAfterSeconds while sign-in is locked", () => {
    expect(loginFailureState({ ok: false, reason: "invalid", remainingAttempts: 1 })).not.toHaveProperty(
      "retryAfterSeconds",
    );
    expect(INITIAL_LOGIN_STATE).toStrictEqual({ error: null });
  });

  it("words a server problem differently from a refusal", () => {
    expect(LOGIN_SERVER_PROBLEM).toMatch(/problem on the server/);
    expect(LOGIN_SERVER_PROBLEM).not.toMatch(/password/i);
  });
});
