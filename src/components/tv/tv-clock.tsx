"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui/cn";
import { useDisplay, usePrayerState } from "@/lib/client";
import { formatTime, resolveTimeZone, zonedNow } from "@/lib/time";

/** Props of {@link TvClock}. */
export interface TvClockProps {
  /** Show the seconds beside the minutes. */
  showSeconds: boolean;
  /** Extra classes: the size of the clock. */
  className?: string;
}

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The wall clock of the TV display: hours and minutes as large as the screen
 * allows, with AM/PM and the seconds stacked in a narrow column beside them
 * rather than in a row, which keeps the digits big.
 *
 * It shows the mosque's time on the server-corrected clock. Until the page
 * has mounted and that time is known, an invisible placeholder of the same
 * shape holds the space (the server cannot know the viewer's "now").
 *
 * Must be rendered inside `DisplayProvider`.
 */
export function TvClock({ showSeconds, className }: TvClockProps) {
  const state = usePrayerState();
  const { payload } = useDisplay();
  const { serverNow } = payload;
  const { timezone, timeFormat } = payload.settings;
  // The same on the server and during hydration: both derive it from the payload.
  const placeholder = useMemo(
    () => zonedNow(resolveTimeZone(timezone), serverNow),
    [timezone, serverNow],
  );
  const pending = state === null;
  const clock = pending ? placeholder : state.clock;
  const { text, period } = formatTime(clock.time, timeFormat);
  const seconds = twoDigits(clock.second);
  const stacked = showSeconds && period !== null;

  return (
    <time
      dateTime={pending ? undefined : `${clock.time}:${seconds}`}
      aria-hidden={pending ? true : undefined}
      className={cn("tv-clock tvx-clock", pending ? "display-pending" : "display-appear", className)}
    >
      {text}
      {showSeconds || period !== null ? (
        <span className={cn("tvx-clock-side", stacked && "tvx-clock-side-stacked")}>
          {/* The space keeps "2:05 PM" two words for screen readers. */}
          {period === null ? null : <span className="tvx-clock-period">{` ${period}`}</span>}
          {showSeconds ? (
            // A screen reader reading the clock should say "2:05 PM", not count the seconds.
            <span aria-hidden="true" className="tvx-clock-seconds">
              {seconds}
            </span>
          ) : null}
        </span>
      ) : null}
    </time>
  );
}
