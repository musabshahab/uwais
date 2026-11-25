"use client";

import { useState, type TransitionEvent } from "react";
import { PrayerName } from "@/components/display";
import { cn } from "@/components/ui/cn";
import { usePrayerSchedule, type ScheduledJamaat } from "@/lib/client";
import { TvClock } from "./tv-clock";

/** Props of {@link TvJamaatOverlay}. */
export interface TvJamaatOverlayProps {
  /** Show the seconds on the small corner clock. */
  showSeconds: boolean;
}

/**
 * The screen during a congregation: "Jamaat in progress", the name of the
 * prayer, and a request to silence phones, on the night colours whatever
 * the theme (a bright screen at the front of the hall would distract), with
 * the clock small in a corner.
 *
 * It is always in the page and fades in and out over a second and a half, so
 * it never flashes. While it fades out it keeps showing the congregation it
 * was up for. Must be rendered inside `DisplayProvider`.
 */
export function TvJamaatOverlay({ showSeconds }: TvJamaatOverlayProps) {
  const schedule = usePrayerSchedule();
  const active = schedule === null ? null : schedule.jamaatInProgress;
  const [last, setLast] = useState<ScheduledJamaat | null>(null);
  // Remember the congregation while rendering, so its name is still there to fade out.
  if (
    active !== null &&
    (last === null || last.startedAtMs !== active.startedAtMs || last.key !== active.key)
  ) {
    setLast(active);
  }
  const shown = active ?? last;
  const on = active !== null;

  /** Once the overlay has faded out, its content (and its ticking clock) is dropped. */
  const onFaded = (event: TransitionEvent<HTMLDivElement>) => {
    if (!on && event.target === event.currentTarget && event.propertyName === "opacity") {
      setLast(null);
    }
  };

  return (
    <div
      className={cn("tvx-overlay", on && "tvx-overlay-on")}
      data-tv-theme="night"
      role="status"
      aria-live="polite"
      aria-hidden={on ? undefined : true}
      onTransitionEnd={onFaded}
    >
      {shown === null ? null : (
        <>
          <TvClock showSeconds={showSeconds} className="tvx-overlay-clock" />
          <div className="tvx-overlay-body tv-drift">
            <p className="tvx-overlay-eyebrow">Jamaat in progress</p>
            <PrayerName
              name={shown.label ?? shown.name}
              arabic={shown.arabic}
              layout="stacked"
              className="tv-display tvx-overlay-name"
              arabicClassName="tvx-overlay-arabic"
            />
            <p className="tv-display tvx-overlay-ask">Please switch your phone to silent</p>
          </div>
        </>
      )}
    </div>
  );
}
