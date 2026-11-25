"use client";

import { cn } from "@/components/ui/cn";
import { useMosqueDate, usePrayerSchedule } from "@/lib/client/prayer-state";
import { formatDateLong, formatDateMedium, formatHijri } from "@/lib/time";
import "./display.css";

/** Props of {@link GregorianDateText}. */
export interface GregorianDateTextProps {
  /** `long` is `Wednesday 25 November 2026` (default), `medium` is `Wed 25 Nov`. */
  format?: "long" | "medium";
  className?: string;
}

/** Props of {@link HijriDateText}. */
export interface HijriDateTextProps {
  className?: string;
}

/** A no-break space: holds one line of text open while the real text is not known yet. */
const LINE_PLACEHOLDER = "\u00a0";

/**
 * Today's date in the mosque's timezone. It changes at the mosque's midnight,
 * not the device's.
 *
 * Rendered on the server too: until the clock is running it shows the day the
 * payload was produced on, which is the day the server-rendered timetable
 * rows belong to. Must be rendered inside `DisplayProvider`.
 */
export function GregorianDateText({ format = "long", className }: GregorianDateTextProps) {
  const { date } = useMosqueDate();
  return (
    <time dateTime={date} className={className}>
      {format === "long" ? formatDateLong(date) : formatDateMedium(date)}
    </time>
  );
}

/**
 * Today's Hijri date, e.g. `15 Jumada al-Thani 1448 AH`, with the mosque's
 * moon-sighting adjustment applied; it moves on at Maghrib when the settings
 * say so.
 *
 * Shown only after mount, with a one-line placeholder before: the date
 * depends on the time of day, and the Hijri calendar comes from each
 * browser's own calendar data, which an old TV browser and the server need
 * not agree on. Must be rendered inside `DisplayProvider`.
 */
export function HijriDateText({ className }: HijriDateTextProps) {
  const schedule = usePrayerSchedule();
  if (schedule === null) {
    return (
      <span aria-hidden="true" className={cn("display-pending", className)}>
        {LINE_PLACEHOLDER}
      </span>
    );
  }
  return <span className={cn("display-appear", className)}>{formatHijri(schedule.hijri)}</span>;
}
