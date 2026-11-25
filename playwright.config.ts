import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build with its own throwaway
 * database, so they never touch real data.
 */
const PORT = Number(process.env.E2E_PORT || 3210);
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
    // The mosque timezone in tests is Europe/London; the browser is put in a
    // different zone on purpose to prove the site never uses the viewer's zone.
    timezoneId: "Asia/Karachi",
    locale: "en-GB",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT} --hostname 127.0.0.1`,
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: "file:./data/e2e.db",
      ADMIN_PASSWORD: "e2e-test-password",
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef0123456789abcdef",
      MOSQUE_TIMEZONE: "Europe/London",
      BUILD_ID: "e2e",
    },
  },
});
