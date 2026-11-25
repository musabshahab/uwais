/**
 * Builds the display payload: everything the public site, the installed app
 * and the TV screen need to render and to keep running without a connection.
 *
 * This module is free of Next.js APIs on purpose. The current instant is an
 * argument, so the payload can be built in unit tests and scripts; inside the
 * app go through `loadDisplayPayload()` in `./data`, which first makes sure
 * the read happens at request time.
 */

import {
  getCoverage,
  getPrayerDays,
  getSettings,
  listActiveAnnouncements,
  type DateRange,
} from "@/lib/db";
import { addDays, resolveTimeZone, zonedNow } from "@/lib/time";
import {
  DISPLAY_WINDOW_DAYS_AHEAD,
  DISPLAY_WINDOW_DAYS_BEHIND,
  type DateString,
  type DisplayPayload,
  type SiteSettings,
} from "@/lib/types";

/** Version reported when the app runs outside a Next.js build, as in unit tests. */
export const DEV_VERSION = "dev";

/** The dates a display payload covers. */
export interface DisplayWindow extends DateRange {
  /** Today's date on the mosque's wall clock. */
  today: DateString;
}

/**
 * The mosque's calendar date at an instant. A zone the server's timezone
 * database does not know falls back the same way the screens do, so the
 * server and the browsers agree on which day it is.
 */
export function mosqueToday(timeZone: string, nowMs: number): DateString {
  return zonedNow(resolveTimeZone(timeZone), nowMs).date;
}

/**
 * The window of days sent to the screens: from yesterday (a screen that is
 * still showing last night's Isha needs it) to five weeks ahead (so a TV or
 * an installed app survives a long outage).
 * @param timeZone The mosque's IANA zone; "today" is its calendar date.
 * @param nowMs    Epoch milliseconds.
 */
export function displayWindow(timeZone: string, nowMs: number): DisplayWindow {
  const today = mosqueToday(timeZone, nowMs);
  return {
    today,
    from: addDays(today, -DISPLAY_WINDOW_DAYS_BEHIND),
    to: addDays(today, DISPLAY_WINDOW_DAYS_AHEAD),
  };
}

/**
 * The id of the running build. Screens compare it with the one they loaded
 * and reload themselves after a deployment.
 */
export function buildVersion(): string {
  // Spelled out in full because Next.js substitutes this exact expression at build time.
  return process.env.NEXT_PUBLIC_BUILD_ID || DEV_VERSION;
}

/**
 * Reads everything a screen needs as of `nowMs`: the settings, the timetable
 * rows of the display window, the announcements whose dates touch that window
 * and the extent of the stored timetable.
 *
 * Announcements for either audience are included and each screen picks its
 * own; drafts (shown nowhere) never leave the server. On an empty database
 * this is the default settings with no days and no announcements.
 * @param nowMs    Epoch milliseconds; returned unchanged as `serverNow`.
 * @param settings Settings the caller has already loaded, to save reading them again.
 */
export async function buildDisplayPayload(
  nowMs: number,
  settings?: SiteSettings,
): Promise<DisplayPayload> {
  const current = settings ?? (await getSettings());
  const { from, to } = displayWindow(current.timezone, nowMs);
  const [days, announcements, coverage] = await Promise.all([
    getPrayerDays(from, to),
    listActiveAnnouncements({ from, to, audience: "any" }),
    getCoverage(),
  ]);
  return {
    version: buildVersion(),
    serverNow: nowMs,
    settings: current,
    days,
    announcements,
    coverage,
  };
}
