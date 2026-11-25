/**
 * Request-time data loaders: the one way pages, layouts and Route Handlers
 * read from the database.
 *
 * CALLERS MUST RENDER INSIDE `<Suspense>`. Every loader waits for a real
 * request before it reads anything, so the component that awaits one is left
 * out of the prerendered shell and streams in afterwards. Outside a
 * `<Suspense>` boundary the whole route would wait instead, and Next.js
 * reports that as an error while building.
 *
 * Why nothing here is cached across requests
 * ------------------------------------------
 * The timetable, the announcements and the coverage must be current on every
 * request: a mosque that corrects tonight's Isha time needs every screen to
 * show it, and the payload carries the server clock, which a cached copy
 * would freeze.
 *
 * The settings change rarely and a `"use cache"` variant (tagged, with a
 * short `cacheLife`) was considered and deliberately left out:
 *
 * - Cached output is filled while building. The database is normally absent
 *   then (Docker image builds, CI), so the build would bake the DEFAULT
 *   mosque name into the static shell and the page title of every route, and
 *   the first visitors after each deployment would see it. The TV screens
 *   reload on exactly that occasion.
 * - Excluding the cached value from the build (a lifetime too short to
 *   prerender) avoids that, but then it sits in a `<Suspense>` hole like any
 *   request-time read and only saves a primary-key lookup in a local file.
 * - A request-time read cannot be stale, so saving the settings needs no
 *   cache invalidation to be correct.
 *
 * Instead, each loader is memoised per render with React's `cache()`: a
 * layout, its page and `generateMetadata` can all call `loadSettings()` and
 * the database is asked once.
 *
 * Why `connection()` and not `io()`
 * ---------------------------------
 * The local SQLite driver answers synchronously, so without a deferral a
 * query would finish during prerendering and its result would be baked into
 * the build. Both functions prevent that. `connection()` additionally throws
 * inside a `"use cache"` scope, where `io()` would quietly let the read
 * through; a loader that somebody later wraps in a cache therefore fails
 * loudly instead of serving frozen prayer times.
 */

import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  DEFAULT_IMPORT_LOG_LIMIT,
  findMissingDates,
  getCoverage,
  getPrayerDays,
  listAnnouncements,
  listImportLog,
  readSettings,
  type DateRange,
  type ImportLogEntry,
} from "@/lib/db";
import {
  addDays,
  diffDays,
  firstDayOfMonth,
  isValidMonthString,
  lastDayOfMonth,
  type MonthString,
} from "@/lib/time";
import type {
  Announcement,
  DateString,
  DisplayPayload,
  PrayerDay,
  SiteSettings,
  TimetableCoverage,
} from "@/lib/types";
import { serverNowMs } from "./clock";
import { buildDisplayPayload, mosqueToday } from "./display";

/** How far ahead the admin overview looks for days without prayer times. */
export const ADMIN_LOOKAHEAD_DAYS = 60;

/**
 * The instant of the current request, epoch milliseconds. One reading per
 * render, so every loader agrees on what "now" and "today" are.
 */
const requestNow = cache(async (): Promise<number> => {
  await connection();
  return serverNowMs();
});

/** The stored settings and whether anything has been saved yet. One read per render. */
const loadSettingsSnapshot = cache(async () => {
  await connection();
  return readSettings();
});

/**
 * The site settings, complete: stored values over the defaults.
 * On a new installation these are the defaults (with `MOSQUE_TIMEZONE`).
 */
export const loadSettings: () => Promise<SiteSettings> = cache(async () => {
  const snapshot = await loadSettingsSnapshot();
  return snapshot.settings;
});

/**
 * Everything the public pages and the TV screen render from: settings, the
 * timetable from yesterday to five weeks ahead, current announcements and
 * the timetable's extent. Same content as `GET /api/display`.
 */
export const loadDisplayPayload: () => Promise<DisplayPayload> = cache(async () => {
  const serverNow = await requestNow();
  return buildDisplayPayload(serverNow, await loadSettings());
});

/** A slice of the timetable with what is needed to present it. */
export interface TimetableRange extends DateRange {
  /** The stored rows inside the range, ascending. Dates without a row are simply absent. */
  days: PrayerDay[];
  settings: SiteSettings;
}

/**
 * The timetable rows from `from` to `to`, both inclusive, with the settings.
 * @throws ZodError when a date is not a valid `YYYY-MM-DD`. Validate
 *         untrusted input first (the API does, with `parseTimetableQuery`).
 */
export const loadTimetableRange: (from: DateString, to: DateString) => Promise<TimetableRange> =
  cache(async (from: DateString, to: DateString) => {
    await connection();
    const [settings, days] = await Promise.all([loadSettings(), getPrayerDays(from, to)]);
    return { from, to, days, settings };
  });

/** One calendar month of the timetable. */
export interface MonthTimetable extends TimetableRange {
  /** The month, `YYYY-MM`. */
  month: MonthString;
  /** Today's date on the mosque's wall clock, for highlighting the current row. */
  today: DateString;
  /** Extent of the whole stored timetable, for previous/next month links. */
  coverage: TimetableCoverage;
  /** Server clock when the data was read, epoch milliseconds. */
  serverNow: number;
}

/**
 * The timetable for one month, or null when `month` is not a real `YYYY-MM`
 * month (so a page can answer a mistyped address with "not found").
 * @param month Untrusted text, typically a route parameter.
 */
export const loadMonth: (month: string) => Promise<MonthTimetable | null> = cache(
  async (month: string) => {
    if (!isValidMonthString(month)) return null;
    const serverNow = await requestNow();
    const [range, coverage] = await Promise.all([
      loadTimetableRange(firstDayOfMonth(month), lastDayOfMonth(month)),
      getCoverage(),
    ]);
    return {
      ...range,
      month,
      today: mosqueToday(range.settings.timezone, serverNow),
      coverage,
      serverNow,
    };
  },
);

/** What the admin dashboard shows at a glance. */
export interface AdminOverview {
  settings: SiteSettings;
  /** False on a new installation where no setting has been saved yet. */
  settingsStored: boolean;
  /** Today's date on the mosque's wall clock. */
  today: DateString;
  coverage: TimetableCoverage;
  /**
   * Days of timetable left after today: 0 when it ends today or has already
   * run out, null when there is no timetable at all.
   */
  daysRemaining: number | null;
  /** Dates from today through the next `lookaheadDays` days that have no prayer times. */
  missingDates: DateString[];
  /** Length of the period `missingDates` covers, counting today. */
  lookaheadDays: number;
  /** Every announcement, drafts and expired ones included, pinned and newest first. */
  announcements: Announcement[];
  /** The most recent timetable imports, newest first. */
  recentImports: ImportLogEntry[];
  /** Server clock when the data was read, epoch milliseconds. */
  serverNow: number;
}

/**
 * Loads the admin dashboard. Signed-out visitors are redirected to the
 * sign-in page before anything is read: drafts and the import history are
 * not public.
 */
export const loadAdminOverview: () => Promise<AdminOverview> = cache(async () => {
  await requireAdmin();
  const serverNow = await requestNow();
  const snapshot = await loadSettingsSnapshot();
  const today = mosqueToday(snapshot.settings.timezone, serverNow);
  const [coverage, missingDates, announcements, recentImports] = await Promise.all([
    getCoverage(),
    findMissingDates(today, addDays(today, ADMIN_LOOKAHEAD_DAYS - 1)),
    listAnnouncements(),
    listImportLog(DEFAULT_IMPORT_LOG_LIMIT),
  ]);
  return {
    settings: snapshot.settings,
    settingsStored: snapshot.stored,
    today,
    coverage,
    daysRemaining:
      coverage.lastDate === null ? null : Math.max(0, diffDays(today, coverage.lastDate)),
    missingDates,
    lookaheadDays: ADMIN_LOOKAHEAD_DAYS,
    announcements,
    recentImports,
    serverNow,
  };
});

/**
 * Every announcement, for the admin's list: drafts, scheduled and expired
 * ones included. Redirects signed-out visitors to the sign-in page.
 */
export const loadAdminAnnouncements: () => Promise<Announcement[]> = cache(async () => {
  await requireAdmin();
  return listAnnouncements();
});

/**
 * The import history, newest first. Redirects signed-out visitors to the
 * sign-in page.
 * @param limit Number of entries, 1 to `MAX_IMPORT_LOG_LIMIT`.
 */
export const loadImportHistory: (limit?: number) => Promise<ImportLogEntry[]> = cache(
  async (limit: number = DEFAULT_IMPORT_LOG_LIMIT) => {
    await requireAdmin();
    return listImportLog(limit);
  },
);
