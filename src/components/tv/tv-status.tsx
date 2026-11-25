"use client";

import { WarningIcon } from "@/components/brand/icons";
import { ConnectionBadge } from "@/components/display";
import { useDisplay, usePrayerSchedule } from "@/lib/client";
import { isTimeZoneFallback } from "@/lib/tv/status";

/**
 * The small print of the TV display, shown only when something needs a
 * caretaker's attention:
 * - the data is not current (offline, or the server cannot be reached), with
 *   the time the times on screen date from;
 * - this screen's browser does not know the mosque's timezone, so its clock
 *   is running on UTC.
 *
 * Takes no space while all is well. Must be rendered inside `DisplayProvider`.
 */
export function TvStatus() {
  const { settings } = useDisplay();
  const schedule = usePrayerSchedule();
  const wrongZone = schedule !== null && isTimeZoneFallback(schedule.timezone, settings.timezone);
  return (
    <div className="tvx-status">
      <ConnectionBadge className="tvx-status-chip" />
      <span role="status" aria-live="polite">
        {wrongZone ? (
          <span className="display-badge display-badge-offline tvx-status-chip tvx-status-chip-long">
            <WarningIcon className="display-badge-icon" size="1.15em" />
            <span className="display-badge-label">Check this screen</span>
            <span className="display-badge-detail">
              {`It does not know the time zone ${settings.timezone} and is showing UTC`}
            </span>
          </span>
        ) : null}
      </span>
    </div>
  );
}
