/**
 * Shapes of the JSON API responses. Types only, so client code may
 * `import type` from here without pulling in anything that runs on the server.
 * `GET /api/display` answers with `DisplayPayload` from `@/lib/types`.
 */

import type { DateString, PrayerDay, SiteSettings } from "@/lib/types";

/** `GET /api/timetable`: the stored rows of the requested period. */
export interface TimetableResponse {
  /** First day of the period that was asked for, inclusive. */
  from: DateString;
  /** Last day of the period, inclusive. */
  to: DateString;
  /** The stored rows inside the period, ascending. Dates without a row are absent. */
  days: PrayerDay[];
  /** The settings needed to present the times. */
  settings: Pick<SiteSettings, "timezone" | "timeFormat" | "mosqueName">;
}

/** `GET /api/version`: lets a screen notice a deployment and correct its clock. */
export interface VersionResponse {
  /** Build id of the running server. */
  version: string;
  /** Server clock, epoch milliseconds. */
  serverNow: number;
}

/** `GET /api/health`: 200 with both true, or 503 with both false. */
export interface HealthResponse {
  ok: boolean;
  /** Whether the database answered a query. */
  db: boolean;
}
