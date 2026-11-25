/**
 * The live display building blocks, shared by the public site and the TV
 * page. Import from "@/components/display".
 *
 * `TimeText`, `Countdown`, `ClockFace`, `ConnectionNotice` and `PrayerName`
 * render from their props and work anywhere. The others read the live display
 * and must be rendered inside `DisplayProvider` (from "@/lib/client").
 */
export {
  ConnectionBadge,
  ConnectionNotice,
  type ConnectionBadgeProps,
  type ConnectionNoticeProps,
} from "./connection-badge";
export { Countdown, type CountdownMode, type CountdownProps } from "./countdown";
export {
  GregorianDateText,
  HijriDateText,
  type GregorianDateTextProps,
  type HijriDateTextProps,
} from "./date-text";
export { ClockFace, LiveClock, type ClockFaceProps, type LiveClockProps } from "./live-clock";
export {
  NextPrayerCountdown,
  NextPrayerLabel,
  type NextEventChoice,
  type NextPrayerCountdownProps,
  type NextPrayerLabelProps,
} from "./next-prayer";
export { PrayerName, type PrayerNameProps } from "./prayer-name";
export { TimeText, type TimeTextProps } from "./time-text";
