import { cn } from "@/components/ui/cn";
import { TIME_PLACEHOLDER, formatCountdownClock, formatCountdownWords } from "@/lib/time";
import "./display.css";

/**
 * How a countdown is written.
 * - `clock`: ticking digits, `H:MM:SS` from an hour up and `MM:SS` below.
 * - `words`: `1 hr 5 min`, `12 min`, `less than a minute`; changes once a minute.
 */
export type CountdownMode = "clock" | "words";

/** Props of {@link Countdown}. */
export interface CountdownProps {
  /** Seconds remaining; null or undefined renders the placeholder. */
  seconds: number | null | undefined;
  /** Defaults to `clock`. */
  mode?: CountdownMode;
  /**
   * What is being counted down to, for screen readers, e.g. "Time until Asr
   * jamaat". Read out before the remaining time.
   */
  label?: string;
  /** Size, face and colour, as for `TimeText`. */
  className?: string;
}

/**
 * A countdown. Works in Server and Client Components; the seconds come from
 * the caller (`usePrayerState()`), or use `NextPrayerCountdown`.
 *
 * Accessibility: the digits change every second, which a screen reader must
 * not announce. The element is a `timer` with live announcements off, the
 * ticking digits are hidden from assistive technology, and what is read when
 * the user moves to it is the label and the time in words, which changes
 * once a minute.
 */
export function Countdown({ seconds, mode = "clock", label, className }: CountdownProps) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return (
      <span aria-hidden="true" className={cn("display-countdown", className)}>
        {TIME_PLACEHOLDER}
      </span>
    );
  }
  const words = formatCountdownWords(seconds);
  return (
    <span role="timer" aria-live="off" className={cn("display-countdown", className)}>
      <span aria-hidden="true">{mode === "clock" ? formatCountdownClock(seconds) : words}</span>
      <span className="display-sr-only">{label ? `${label}: ${words}` : words}</span>
    </span>
  );
}
