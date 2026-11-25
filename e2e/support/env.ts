/**
 * The fixed world the end-to-end tests run in. `playwright.config.ts` starts
 * the server with these values; the tests read them to know what to expect.
 */

/** The mosque's timezone in tests. The browser is put in a different one on purpose. */
export const MOSQUE_TIMEZONE = "Europe/London";

/**
 * The instant the server's clock starts at (`UWAIS_FAKE_NOW`): Wednesday
 * 10 March 2027, 10:00 in London. It is mid-morning, more than two hours
 * before Dhuhr, so "the next prayer" does not change while a run is going.
 * The clock is not frozen; it runs on from here.
 */
export const FAKE_NOW = "2027-03-10T10:00:00Z";

/** The mosque's date at `FAKE_NOW`. */
export const TODAY = "2027-03-10";

/** Password of the admin area in tests. */
export const ADMIN_PASSWORD = "e2e-test-password";

/** Signs the admin session cookie in tests. */
export const SESSION_SECRET = "e2e-session-secret-0123456789abcdef0123456789abcdef";
