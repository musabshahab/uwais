"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { usePrayerState } from "@/lib/client/prayer-state";
import { describeCountdown, describeEvent } from "@/lib/client/prayer-view";
import type { PrayerEvent, PrayerState } from "@/lib/time";
import { Countdown, type CountdownMode } from "./countdown";
import "./display.css";

/**
 * Which upcoming event to show.
 * - `any`: whatever comes first, a prayer beginning or a congregation.
 * - `jamaat`: the next congregation.
 * - `begins`: the next prayer to begin.
 */
export type NextEventChoice = "any" | "jamaat" | "begins";

/** Props of {@link NextPrayerLabel}. */
export interface NextPrayerLabelProps {
  /** Defaults to `any`. */
  event?: NextEventChoice;
  /** Shown when the timetable has nothing ahead (no rows for today and tomorrow). Defaults to nothing. */
  fallback?: ReactNode;
  className?: string;
}

/** Props of {@link NextPrayerCountdown}. */
export interface NextPrayerCountdownProps {
  /** Defaults to `any`. */
  event?: NextEventChoice;
  /** Ticking digits (`clock`, default) or words. */
  mode?: CountdownMode;
  /** Size, face and colour, as for `Countdown`. */
  className?: string;
}

/** A no-break space: holds one line of text open while the real text is not known yet. */
const LINE_PLACEHOLDER = "\u00a0";

function chooseEvent(state: PrayerState, choice: NextEventChoice): PrayerEvent | null {
  if (choice === "jamaat") return state.nextJamaat;
  return choice === "begins" ? state.nextBegins : state.next;
}

/**
 * What comes next, in words: `Asr jamaat in 12 min`, `Maghrib begins in 1 hr
 * 5 min`, `2nd Jumu'ah in less than a minute`. The text changes once a
 * minute and is not a live region, so screen readers are not interrupted.
 *
 * Shown only after mount, with a one-line placeholder before. Must be
 * rendered inside `DisplayProvider`.
 */
export function NextPrayerLabel({ event = "any", fallback = null, className }: NextPrayerLabelProps) {
  const state = usePrayerState();
  if (state === null) {
    return (
      <span aria-hidden="true" className={cn("display-pending", className)}>
        {LINE_PLACEHOLDER}
      </span>
    );
  }
  const next = chooseEvent(state, event);
  if (next === null && fallback === null) return null;
  return (
    <span className={cn("display-appear", className)}>
      {next === null ? fallback : describeCountdown(next)}
    </span>
  );
}

/**
 * The countdown to the next event, ticking. Before mount, and when the
 * timetable has nothing ahead, it renders the countdown's placeholder
 * (invisible before mount), so its space is always reserved. Must be
 * rendered inside `DisplayProvider`.
 */
export function NextPrayerCountdown({ event = "any", mode, className }: NextPrayerCountdownProps) {
  const state = usePrayerState();
  if (state === null) {
    return <Countdown seconds={null} mode={mode} className={cn("display-pending", className)} />;
  }
  const next = chooseEvent(state, event);
  return (
    <Countdown
      seconds={next === null ? null : next.secondsUntil}
      mode={mode}
      label={next === null ? undefined : `Time until ${describeEvent(next)}`}
      className={className}
    />
  );
}
