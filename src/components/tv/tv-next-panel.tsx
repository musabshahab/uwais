"use client";

import { Countdown, TimeText } from "@/components/display";
import { cn } from "@/components/ui/cn";
import { useDisplay, usePrayerState } from "@/lib/client";
import { nextEventView } from "@/lib/tv/next-event";

/** A no-break space: holds a line of text open while the real text is not known yet. */
const LINE_PLACEHOLDER = " ";

/**
 * What the congregation is waiting for: `Asr jamaat in` and a large
 * countdown, moving from the start of a prayer time to its congregation and
 * on to the next prayer as the day goes. In the final five minutes before a
 * congregation the panel turns brass; the change is a slow colour transition,
 * never a flash.
 *
 * Before the page has mounted the panel is drawn empty at its final size.
 * When the timetable has nothing ahead it is left out.
 *
 * Must be rendered inside `DisplayProvider`.
 */
export function TvNextPanel() {
  const state = usePrayerState();
  const { settings } = useDisplay();

  if (state === null) {
    return (
      <section className="tvx-next" aria-hidden="true">
        <p className="tv-display tvx-next-label display-pending">{LINE_PLACEHOLDER}</p>
        <Countdown seconds={null} className="tv-display tvx-next-count display-pending" />
      </section>
    );
  }

  const view = nextEventView(state);
  if (view === null) return null;

  return (
    <section className={cn("tvx-next", view.urgent && "tvx-next-urgent")} aria-label="Next prayer time">
      <p className="tv-display tvx-next-label display-appear">
        <span className="tvx-next-what">{view.label}</span>
        <TimeText
          time={view.event.time}
          format={settings.timeFormat}
          className="tv-numerals tvx-next-at"
        />
      </p>
      <Countdown
        seconds={view.event.secondsUntil}
        label={view.timerLabel}
        className="tv-display tvx-next-count display-appear"
      />
    </section>
  );
}
