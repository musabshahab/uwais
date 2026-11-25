"use client";

import { useCallback, useEffect, useState } from "react";
import { GregorianDateText, HijriDateText } from "@/components/display";
import {
  isQuietMoment,
  useAutoReloadOnVersionChange,
  useDisplay,
  useFullscreen,
  useIdleCursorHide,
  useWakeLock,
} from "@/lib/client";
import { browserStorage } from "@/lib/client/browser";
import { resolveTvOptions, type TvQueryOptions } from "@/lib/tv/options";
import { clearReconnectAttempts } from "@/lib/tv/reconnect";
import { TvBand } from "./tv-band";
import { TvBrand } from "./tv-brand";
import { TvClock } from "./tv-clock";
import { TvJamaatOverlay } from "./tv-jamaat-overlay";
import { TvNextPanel } from "./tv-next-panel";
import { TvFrame, TvStage } from "./tv-stage";
import { TvStatus } from "./tv-status";
import { TvTimetable } from "./tv-timetable";
import { useTimetableDay } from "./use-timetable-day";

/** Props of {@link TvDisplay}. */
export interface TvDisplayProps {
  /** What the address of this screen asks for (`parseTvOptions`). */
  query: TvQueryOptions;
}

/**
 * The parts of the screen that depend on which day the table shows. This
 * component re-renders every second (it follows the clock to catch the
 * moment the table moves on to tomorrow); the timetable below it is
 * memoised and re-renders only when its content changes.
 */
function TvDay() {
  const day = useTimetableDay();
  return (
    <>
      <TvTimetable day={day} />
      <TvBand day={day} />
    </>
  );
}

/**
 * The TV display: the whole screen for a television in the mosque, rendered
 * by the server from the display payload and kept live by `DisplayProvider`.
 *
 * Besides laying out the screen it looks after the unattended running of it:
 * - keeps the screen awake where the browser allows;
 * - reloads the page after a deployment and once a night, but only at a
 *   quiet moment (never close to a prayer time or during a congregation);
 * - shows the mouse cursor only while somebody is moving it;
 * - goes full screen on a click, Enter (the OK button of a remote) or F.
 *   None of this is required: a screen that is simply left alone works.
 *
 * Must be rendered inside `DisplayProvider`.
 */
export function TvDisplay({ query }: TvDisplayProps) {
  const { settings, getPrayerState } = useDisplay();
  const options = resolveTvOptions(query, settings.tv);

  useWakeLock();
  const canReloadNow = useCallback(() => isQuietMoment(getPrayerState()), [getPrayerState]);
  useAutoReloadOnVersionChange({ canReloadNow });

  // The display is up: the error screen's count of failed reloads starts again from nothing.
  useEffect(() => {
    clearReconnectAttempts(browserStorage("sessionStorage"));
  }, []);

  const idle = useIdleCursorHide();
  // The idle timer starts as "somebody is here"; only a real movement shows the cursor.
  const [pointerSeen, setPointerSeen] = useState(false);
  const pointerActive = pointerSeen && !idle;

  const fullscreen = useFullscreen();
  const { toggle, enter } = fullscreen;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.key === "Enter" || event.key === "f" || event.key === "F") void toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <TvStage
      theme={options.theme}
      rotate={options.rotate}
      insetFraction={options.insetFraction}
      cursorVisible={pointerActive}
      onClick={() => void enter()}
      onMouseMove={pointerSeen ? undefined : () => setPointerSeen(true)}
    >
      <TvFrame>
        <div className="tvx-side">
          <TvBrand />
          <div className="tvx-now">
            <TvClock showSeconds={options.showSeconds} />
            <p className="tvx-dates">
              <GregorianDateText className="tv-display tvx-date" />
              <HijriDateText className="tvx-hijri" />
            </p>
            <TvStatus />
          </div>
          <TvNextPanel />
        </div>
        <TvDay />
      </TvFrame>
      <TvJamaatOverlay showSeconds={options.showSeconds} />
      {pointerActive && fullscreen.supported && !fullscreen.active ? (
        <p className="tvx-hint">Press F, or OK on the remote, for full screen</p>
      ) : null}
    </TvStage>
  );
}
