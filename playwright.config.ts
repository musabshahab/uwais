import { defineConfig, devices } from "@playwright/test";
import { ADMIN_PASSWORD, FAKE_NOW, MOSQUE_TIMEZONE, SESSION_SECRET } from "./e2e/support/env";

/**
 * End-to-end tests run against a production build with its own throwaway
 * database and a fixed clock, so they never touch real data and give the
 * same result on any day.
 *
 * Every run deletes and re-seeds the database, builds, and starts its own
 * server. While writing tests, start that server once yourself and set
 * `E2E_REUSE=1` to run against it. `E2E_PORT`, `E2E_DATABASE_URL` and
 * `E2E_DIST_DIR` (a build directory other than `.next`) let two runs share
 * one checkout.
 */
const PORT = Number(process.env.E2E_PORT || 3210);
const DIST_DIR = process.env.E2E_DIST_DIR;
const DATABASE_URL = process.env.E2E_DATABASE_URL || "file:./data/e2e.db";
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "off",
    // The browser is put in a different zone from the mosque on purpose, to
    // prove the site never uses the viewer's timezone.
    timezoneId: "Asia/Karachi",
    locale: "en-GB",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run e2e:prepare && npm run build && npm run start -- --port ${PORT} --hostname 127.0.0.1`,
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: process.env.E2E_REUSE === "1",
    env: {
      ...(DIST_DIR ? { NEXT_DIST_DIR: DIST_DIR } : {}),
      DATABASE_URL,
      ADMIN_PASSWORD,
      SESSION_SECRET,
      MOSQUE_TIMEZONE,
      UWAIS_FAKE_NOW: FAKE_NOW,
      SITE_URL: baseURL,
      BUILD_ID: "e2e",
    },
  },
});
