import { formatDateLong } from "@/lib/time";
import type { DateString } from "@/lib/types";

/** Props of {@link TvNoData}. */
export interface TvNoDataProps {
  /** Today's date in the mosque's timezone. */
  date: DateString;
  /** True when the timetable has no days at all, false when only today is missing. */
  empty: boolean;
}

/**
 * Shown in place of the timetable when there are no prayer times for today.
 * It says so plainly to the congregation, and tells staff what to do about
 * it. The clock beside it keeps running.
 */
export function TvNoData({ date, empty }: TvNoDataProps) {
  return (
    <section className="tvx-table tvx-nodata" role="status">
      <h2 className="tv-display tvx-nodata-title">Prayer times are not available for today</h2>
      <p className="tvx-nodata-text">
        The clock is still correct. The times will appear here as soon as the timetable is updated.
      </p>
      <p className="tvx-nodata-staff">
        <span className="tvx-nodata-staff-label">For staff</span>
        {empty
          ? "No timetable has been added yet. Sign in to the admin area and import one to get started."
          : `The timetable has no times for ${formatDateLong(date)}. Sign in to the admin area and import or enter them.`}
      </p>
    </section>
  );
}
