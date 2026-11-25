"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui/cn";
import { useDisplay, usePrayerState } from "@/lib/client/prayer-state";
import { formatTime, resolveTimeZone, zonedNow, type ZonedNow } from "@/lib/time";
import type { TimeFormat } from "@/lib/types";
import "./display.css";

/** Props of {@link ClockFace}. */
export interface ClockFaceProps {
  /** The wall clock to show. */
  clock: Pick<ZonedNow, "time" | "second">;
  /** 12-hour or 24-hour display. */
  format: TimeFormat;
  /** Show the seconds, smaller, after the minutes. */
  showSeconds?: boolean;
  /** Show AM/PM in 12-hour format. Defaults to true. */
  showPeriod?: boolean;
  /**
   * Render as an invisible placeholder that only reserves the space. Used
   * until the real time is known.
   */
  pending?: boolean;
  /** Size, face and colour: `time-numerals text-time-xl` on the site, `tv-clock` on the TV. */
  className?: string;
}

/** Props of {@link LiveClock}. */
export interface LiveClockProps {
  /** 12-hour or 24-hour display. Defaults to the mosque's setting. */
  format?: TimeFormat;
  /** Show the seconds. Defaults to false; the TV passes `settings.tv.showSeconds`. */
  showSeconds?: boolean;
  /** Show AM/PM in 12-hour format. Defaults to true. */
  showPeriod?: boolean;
  /** Size, face and colour: `time-numerals text-time-xl` on the site, `tv-clock` on the TV. */
  className?: string;
}

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * A clock face for a given wall-clock time: hours and minutes, with optional
 * smaller seconds and AM/PM. `LiveClock` is this, driven by the display
 * clock.
 */
export function ClockFace({
  clock,
  format,
  showSeconds = false,
  showPeriod = true,
  pending = false,
  className,
}: ClockFaceProps) {
  const { text, period } = formatTime(clock.time, format);
  const seconds = twoDigits(clock.second);
  return (
    <time
      dateTime={pending ? undefined : `${clock.time}:${seconds}`}
      aria-hidden={pending ? true : undefined}
      className={cn("display-clock", pending ? "display-pending" : "display-appear", className)}
    >
      {text}
      {showSeconds ? (
        // A screen reader reading the clock should say "2:05 PM", not count the seconds.
        <span aria-hidden="true" className="display-clock-minor display-clock-seconds">
          {`:${seconds}`}
        </span>
      ) : null}
      {showPeriod && period !== null ? (
        <span className="display-clock-minor display-clock-period">{` ${period}`}</span>
      ) : null}
    </time>
  );
}

/**
 * The mosque's wall clock, ticking. It shows the time in the mosque's
 * timezone on the server-corrected clock, whatever the device is set to.
 *
 * Nothing is shown until the page has mounted and the time is known: the
 * server cannot know the viewer's "now", and a page restored from an offline
 * cache would otherwise show the time it was saved at. Until then an
 * invisible placeholder of the same shape holds the space, so nothing moves
 * when the clock appears.
 *
 * Must be rendered inside `DisplayProvider`.
 */
export function LiveClock({ format, showSeconds, showPeriod, className }: LiveClockProps) {
  const state = usePrayerState();
  const { payload } = useDisplay();
  const { serverNow } = payload;
  const { timezone, timeFormat } = payload.settings;
  // The same on the server and during hydration: both derive it from the payload.
  const placeholder = useMemo(
    () => zonedNow(resolveTimeZone(timezone), serverNow),
    [timezone, serverNow],
  );
  return (
    <ClockFace
      clock={state === null ? placeholder : state.clock}
      format={format ?? timeFormat}
      showSeconds={showSeconds}
      showPeriod={showPeriod}
      pending={state === null}
      className={className}
    />
  );
}
