import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInResult } from "@/lib/auth/sign-in";
import {
  createAnnouncement,
  getAllPrayerDays,
  getPrayerDay,
  listAnnouncements,
  listImportLog,
  readSettings,
  setDatabase,
  upsertPrayerDays,
} from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ authenticated: boolean }>>(),
  destroySession: vi.fn<() => Promise<void>>(),
  signIn: vi.fn<(password: unknown) => Promise<SignInResult>>(),
  refresh: vi.fn<() => void>(),
}));

// The session, the sign-in and `refresh()` need a Next.js request; the tests stand in for it.
vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
  destroySession: mocks.destroySession,
}));
vi.mock("@/lib/auth/sign-in", () => ({ signIn: mocks.signIn }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
// The real module, so that redirects are the real signals; `redirect` is only watched.
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, redirect: vi.fn(actual.redirect) };
});

import { notFound, permanentRedirect, redirect } from "next/navigation";
import * as announcementActions from "./announcements";
import * as authActions from "./auth";
import { LOGIN_SERVER_PROBLEM } from "./core/login";
import { csvFile, fullDay, fullDays, importForm } from "./core/testing";
import { denyUnlessAdmin, runMutation, runQuery } from "./guard";
import * as importActions from "./import";
import * as settingsActions from "./settings";
import * as timetableActions from "./timetable";
import { INITIAL_LOGIN_STATE, LOGIN_FORM_FIELDS } from "./types";

const { createAnnouncementAction, deleteAnnouncementAction, updateAnnouncementAction } =
  announcementActions;
const { loginAction, logoutAction } = authActions;
const { commitImportAction, previewImportAction } = importActions;
const { saveSettingsAction } = settingsActions;
const { deleteDaysAction, saveDayAction } = timetableActions;

/** Every `"use server"` file of this folder. */
const ACTION_MODULES = {
  announcements: announcementActions,
  auth: authActions,
  import: importActions,
  settings: settingsActions,
  timetable: timetableActions,
} as const;

/** The modules whose every action needs a signed-in admin. */
const GUARDED_MODULES = [announcementActions, importActions, settingsActions, timetableActions];

const REDIRECT_SIGNAL = { digest: expect.stringMatching(/^NEXT_REDIRECT;/) };

let database: TestDatabase;
let announcementId: number;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  await database.client.batch(
    [
      "DELETE FROM prayer_days",
      "DELETE FROM import_log",
      "DELETE FROM settings",
      "DELETE FROM announcements",
    ],
    "write",
  );
  await upsertPrayerDays(fullDays("2027-01-01", 3));
  announcementId = (await createAnnouncement({ title: "Car park closed" })).id;

  mocks.getSession.mockReset().mockResolvedValue({ authenticated: true });
  mocks.destroySession.mockReset().mockResolvedValue(undefined);
  mocks.signIn.mockReset().mockResolvedValue({ ok: true });
  mocks.refresh.mockReset();
  vi.mocked(redirect).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Everything the actions can change, for before-and-after comparisons. */
async function storedState(): Promise<unknown> {
  return {
    days: await getAllPrayerDays(),
    announcements: await listAnnouncements(),
    settings: await readSettings(),
    imports: await listImportLog(),
  };
}

/** A sign-in form. */
function loginForm(fields: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

/**
 * A call of every guarded action that would change something (or, for the
 * preview, read something) if it were let through.
 */
function guardedCalls(): Record<string, () => Promise<{ ok: boolean } | null>> {
  const upload = () => importForm(csvFile("jan.csv", fullDays("2027-01-02", 4)), { acknowledgeWarnings: "true" });
  return {
    previewImportAction: () => previewImportAction(upload()),
    commitImportAction: () => commitImportAction(upload()),
    saveDayAction: () => saveDayAction(fullDay("2027-01-02", { ishaJamaat: "20:00" })),
    deleteDaysAction: () => deleteDaysAction({ from: "2027-01-01", to: "2027-01-03", confirm: true }),
    saveSettingsAction: () => saveSettingsAction(null, { mosqueName: "Changed" }),
    createAnnouncementAction: () => createAnnouncementAction({ title: "New" }),
    updateAnnouncementAction: () => updateAnnouncementAction(announcementId, { title: "Changed" }),
    deleteAnnouncementAction: () => deleteAnnouncementAction(announcementId),
  };
}

describe("the action files", () => {
  it.each(Object.keys(ACTION_MODULES))("%s.ts starts with the use server directive", (name) => {
    const source = readFileSync(fileURLToPath(new URL(`./${name}.ts`, import.meta.url)), "utf8");
    expect(source.startsWith('"use server";\n')).toBe(true);
  });

  it.each(Object.entries(ACTION_MODULES))("%s.ts exports nothing but async functions", (_name, module) => {
    const exported = Object.values(module);
    expect(exported.length).toBeGreaterThan(0);
    for (const value of exported) {
      expect(typeof value).toBe("function");
      expect(value.constructor.name).toBe("AsyncFunction");
    }
  });
});

describe("without a session", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ authenticated: false });
  });

  it("has a signed-out check for every action that exists", () => {
    const exported = GUARDED_MODULES.flatMap((module) => Object.keys(module)).sort();
    expect(Object.keys(guardedCalls()).sort()).toStrictEqual(exported);
  });

  it("refuses every action and changes nothing", async () => {
    const before = await storedState();

    for (const [name, call] of Object.entries(guardedCalls())) {
      const result = await call();
      expect(result, name).toMatchObject({ ok: false, code: "unauthenticated" });
      expect(result, name).not.toHaveProperty("fieldErrors");
    }

    expect(await storedState()).toStrictEqual(before);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.getSession).toHaveBeenCalledTimes(Object.keys(guardedCalls()).length);
  });

  it("checks the session before it looks at the input", async () => {
    const invalid = await saveDayAction({ date: "not a date" });
    expect(invalid).toMatchObject({ ok: false, code: "unauthenticated" });

    const unreadable = await previewImportAction(new FormData());
    expect(unreadable).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("denies, with the generic failure, when the session check itself breaks", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const problem = new Error("SESSION_SECRET could not be read");
    mocks.getSession.mockRejectedValue(problem);
    const before = await storedState();

    const result = await deleteDaysAction({ from: "2027-01-01", to: "2027-01-03", confirm: true });

    expect(result).toMatchObject({ ok: false, code: "failed" });
    expect(JSON.stringify(result)).not.toMatch(/SESSION_SECRET/);
    expect(log).toHaveBeenCalledWith("[action] session check failed", problem);
    expect(await storedState()).toStrictEqual(before);
  });
});

describe("with a session", () => {
  it("saves a day and refreshes the admin's screen", async () => {
    const result = await saveDayAction(fullDay("2027-01-02", { ishaJamaat: "20:00" }));

    expect(result).toMatchObject({ ok: true, outcome: "updated" });
    expect((await getPrayerDay("2027-01-02"))?.ishaJamaat).toBe("20:00");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when a day is refused", async () => {
    const result = await saveDayAction(fullDay("2027-01-02", { ishaJamaat: "8pm" }));

    expect(result).toMatchObject({ ok: false, code: "invalid", fieldErrors: { ishaJamaat: expect.any(String) } });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("asks before deleting days, and refreshes only once they are gone", async () => {
    const range = { from: "2027-01-01", to: "2027-01-02" };

    expect(await deleteDaysAction(range)).toMatchObject({ ok: false, code: "confirmation-required" });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(await getAllPrayerDays()).toHaveLength(3);

    expect(await deleteDaysAction({ ...range, confirm: true })).toStrictEqual({ ok: true, deleted: 2, ...range });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect((await getAllPrayerDays()).map((day) => day.date)).toStrictEqual(["2027-01-03"]);
  });

  it("previews an import without saving or refreshing", async () => {
    const before = await storedState();

    const preview = await previewImportAction(importForm(csvFile("jan.csv", fullDays("2027-01-02", 4))));

    expect(preview).toMatchObject({
      ok: true,
      canCommit: true,
      requiresAcknowledgement: false,
      diff: { added: 2, updated: 0, unchanged: 2 },
    });
    expect(await storedState()).toStrictEqual(before);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("commits an import, records it and refreshes", async () => {
    const result = await commitImportAction(importForm(csvFile("jan.csv", fullDays("2027-01-02", 4))));

    expect(result).toStrictEqual({
      ok: true,
      added: 2,
      updated: 0,
      unchanged: 2,
      firstDate: "2027-01-02",
      lastDate: "2027-01-05",
      warnings: 0,
      fileName: "jan.csv",
    });
    expect(await getAllPrayerDays()).toHaveLength(5);
    expect(await listImportLog()).toHaveLength(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when an import is refused", async () => {
    expect(await commitImportAction(new FormData())).toMatchObject({
      ok: false,
      code: "invalid",
      fieldErrors: { file: expect.any(String) },
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("saves settings from an object and from the form state it is given", async () => {
    const first = await saveSettingsAction(null, { mosqueName: "Masjid Al-Noor" });
    expect(first).toMatchObject({ ok: true, settings: { mosqueName: "Masjid Al-Noor" } });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    // The previous state is passed back in by useActionState and plays no part.
    const second = await saveSettingsAction(first, { tv: { theme: "day" } });
    expect(second).toMatchObject({
      ok: true,
      settings: { mosqueName: "Masjid Al-Noor", tv: { theme: "day" } },
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("reports the fields of an incomplete settings form and does not refresh", async () => {
    const formData = new FormData();
    formData.set("mosqueName", "Masjid Al-Noor");

    const result = await saveSettingsAction(null, formData);

    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(result?.ok === false ? result.fieldErrors : null).toHaveProperty("timezone");
    expect((await readSettings()).stored).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("creates, changes and deletes an announcement, refreshing each time", async () => {
    const created = await createAnnouncementAction({ title: "Eid prayer at 8:00" });
    expect(created).toMatchObject({ ok: true, announcement: { title: "Eid prayer at 8:00" } });
    const id = created.ok ? created.announcement.id : 0;

    const formData = new FormData();
    formData.set("title", "Eid prayer at 8:30");
    formData.set("pinned", "on");
    expect(await updateAnnouncementAction(id, formData)).toMatchObject({
      ok: true,
      announcement: { id, title: "Eid prayer at 8:30", pinned: true, showOnSite: false },
    });

    expect(await deleteAnnouncementAction(id)).toStrictEqual({ ok: true, id });
    expect(mocks.refresh).toHaveBeenCalledTimes(3);

    expect(await deleteAnnouncementAction(id)).toMatchObject({ ok: false, code: "not-found" });
    expect(await updateAnnouncementAction(id, { pinned: false })).toMatchObject({ ok: false, code: "not-found" });
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
  });

  it("answers a server fault with a generic failure and keeps the details in the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = await createTestDatabase();
    try {
      await broken.client.batch(["DROP TABLE announcements", "DROP TABLE prayer_days"], "write");

      const changed = await createAnnouncementAction({ title: "Eid prayer at 8:00" });
      const read = await previewImportAction(importForm(csvFile("jan.csv", fullDays("2027-01-02", 4))));

      for (const result of [changed, read]) {
        expect(result).toMatchObject({ ok: false, code: "failed" });
        expect(result).not.toHaveProperty("fieldErrors");
        expect(JSON.stringify(result)).not.toMatch(/SQLITE|no such table|announcements|prayer_days/i);
      }
      expect(log).toHaveBeenCalledWith("[action] createAnnouncement failed", expect.any(Error));
      expect(log).toHaveBeenCalledWith("[action] previewImport failed", expect.any(Error));
      expect(mocks.refresh).not.toHaveBeenCalled();
    } finally {
      broken.close();
      setDatabase(database.client);
    }
  });
});

describe("the guard", () => {
  it("lets the signed-in admin through and nobody else", async () => {
    expect(await denyUnlessAdmin()).toBeNull();

    mocks.getSession.mockResolvedValue({ authenticated: false });
    expect(await denyUnlessAdmin()).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("lets framework signals pass instead of reporting them as failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runMutation("test", async () => permanentRedirect("/admin"))).rejects.toMatchObject(
      REDIRECT_SIGNAL,
    );
    await expect(runQuery("test", async () => notFound())).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/),
    });
    mocks.getSession.mockImplementation(async () => permanentRedirect("/admin/login"));
    await expect(denyUnlessAdmin()).rejects.toMatchObject(REDIRECT_SIGNAL);

    expect(log).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes after a successful change only", async () => {
    await runMutation("test", async () => ({ ok: true }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    await runMutation("test", async () => ({ ok: false }));
    await runQuery("test", async () => ({ ok: true }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("loginAction", () => {
  it("signs in with the typed password and returns to the page that was asked for", async () => {
    const form = loginForm({
      [LOGIN_FORM_FIELDS.password]: "correct horse",
      [LOGIN_FORM_FIELDS.next]: "/admin/timetable?month=2027-03",
    });

    await expect(loginAction(INITIAL_LOGIN_STATE, form)).rejects.toMatchObject(REDIRECT_SIGNAL);

    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith("correct horse");
    // `replace`, so that Back does not return to the sign-in form.
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/admin/timetable?month=2027-03", "replace");
  });

  it.each([
    ["nowhere", undefined],
    ["another website", "https://evil.example/admin"],
    ["a protocol-relative address", "//evil.example/admin"],
    ["a page outside the admin area", "/tv"],
    ["the sign-in page itself", "/admin/login"],
  ])("goes to the dashboard when the form points to %s", async (_name, next) => {
    const fields: Record<string, string> = { password: "correct horse" };
    if (next !== undefined) fields.next = next;

    await expect(loginAction(INITIAL_LOGIN_STATE, loginForm(fields))).rejects.toMatchObject(
      REDIRECT_SIGNAL,
    );
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/admin", "replace");
  });

  it("returns a generic message for a wrong password and does not redirect", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, reason: "invalid", remainingAttempts: 2 });

    const state = await loginAction(INITIAL_LOGIN_STATE, loginForm({ password: "guess" }));

    expect(state).toStrictEqual({ error: "That password is not correct. Check it and try again." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("says how long to wait while sign-in is locked", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, reason: "locked", retryAfterSeconds: 840 });

    const state = await loginAction(INITIAL_LOGIN_STATE, loginForm({ password: "guess" }));

    expect(state.retryAfterSeconds).toBe(840);
    expect(state.error).toMatch(/try again in 14 min/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not pass the operator's message on when the admin area is off", async () => {
    mocks.signIn.mockResolvedValue({
      ok: false,
      reason: "disabled",
      cause: "missing_password",
      message: "Set ADMIN_PASSWORD to switch the admin area on.",
    });

    const state = await loginAction(INITIAL_LOGIN_STATE, loginForm({ password: "anything" }));

    expect(state).toStrictEqual({ error: "Signing in is switched off on this website at the moment." });
  });

  it("hands whatever arrived to signIn, which refuses what is not a password", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, reason: "invalid", remainingAttempts: 4 });

    // Called directly with something that is not a form.
    const direct = loginAction as (previous: unknown, payload: unknown) => Promise<unknown>;
    expect(await direct(null, { password: "x" })).toMatchObject({ error: expect.any(String) });
    expect(await direct(null, null)).toMatchObject({ error: expect.any(String) });
    expect(mocks.signIn).toHaveBeenNthCalledWith(1, undefined);
    expect(mocks.signIn).toHaveBeenNthCalledWith(2, undefined);

    expect(await loginAction(INITIAL_LOGIN_STATE, new FormData())).toMatchObject({ error: expect.any(String) });
    expect(mocks.signIn).toHaveBeenNthCalledWith(3, null);
  });

  it("reports a fault while signing in as a server problem, with the details in the log only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const problem = new Error("cookies() failed: SESSION_SECRET");
    mocks.signIn.mockRejectedValue(problem);

    const state = await loginAction(INITIAL_LOGIN_STATE, loginForm({ password: "correct horse" }));

    expect(state).toStrictEqual({ error: LOGIN_SERVER_PROBLEM });
    expect(log).toHaveBeenCalledWith("[action] login failed", problem);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("lets a framework signal raised during sign-in pass", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signIn.mockImplementation(async () => permanentRedirect("/elsewhere"));

    await expect(
      loginAction(INITIAL_LOGIN_STATE, loginForm({ password: "correct horse" })),
    ).rejects.toMatchObject(REDIRECT_SIGNAL);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("logoutAction", () => {
  it("removes the session and shows the sign-in page, session or not", async () => {
    mocks.getSession.mockResolvedValue({ authenticated: false });

    await expect(logoutAction()).rejects.toMatchObject(REDIRECT_SIGNAL);

    expect(mocks.destroySession).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/admin/login");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("still leaves the page when the cookie could not be removed, and logs why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const problem = new Error("cookies() failed");
    mocks.destroySession.mockRejectedValue(problem);

    await expect(logoutAction()).rejects.toMatchObject(REDIRECT_SIGNAL);

    expect(log).toHaveBeenCalledWith("[action] logout failed", problem);
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/admin/login");
  });
});
