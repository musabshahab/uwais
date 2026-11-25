import { cn } from "@/components/ui/cn";
import { TIME_PLACEHOLDER, formatTime, isValidTimeString } from "@/lib/time";
import type { TimeFormat, TimeString } from "@/lib/types";
import "./display.css";

/** Props of {@link TimeText}. */
export interface TimeTextProps {
  /** A timetable time, `HH:mm`; null, undefined or malformed renders the placeholder. */
  time: TimeString | null | undefined;
  /** 12-hour or 24-hour display (`settings.timeFormat`). */
  format: TimeFormat;
  /** Shown instead of a missing time. Defaults to `--:--`. */
  placeholder?: string;
  /** What a screen reader says for a missing time. Defaults to "No time". */
  missingLabel?: string;
  /** Size, face and colour: `time-numerals text-time` on the site, `tv-time` on the TV. */
  className?: string;
}

/**
 * One time of the timetable: the digits, and in 12-hour format a small AM/PM
 * beside them. Figures are tabular, so a column of times lines up. Works in
 * Server and Client Components.
 *
 * @example <TimeText time={row.jamaat} format={settings.timeFormat} className="time-numerals text-time" />
 */
export function TimeText({
  time,
  format,
  placeholder = TIME_PLACEHOLDER,
  missingLabel = "No time",
  className,
}: TimeTextProps) {
  if (!isValidTimeString(time)) {
    return (
      <span className={cn("display-time", className)}>
        {/* Dashes are read out as punctuation or not at all; say what they mean instead. */}
        <span aria-hidden="true">{placeholder}</span>
        <span className="display-sr-only">{missingLabel}</span>
      </span>
    );
  }
  const { text, period } = formatTime(time, format);
  return (
    <time dateTime={time} className={cn("display-time", className)}>
      {text}
      {/* The space keeps "5:07 PM" two words for screen readers and for copy and paste. */}
      {period === null ? null : <span className="display-time-period">{` ${period}`}</span>}
    </time>
  );
}
