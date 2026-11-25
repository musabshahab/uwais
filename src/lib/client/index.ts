/**
 * The client-side live display: everything the public site and the TV page
 * need to stay correct for weeks without a reload. Import from "@/lib/client".
 *
 * Pages compose three things:
 * - `DisplayProvider` around whatever shows prayer times, fed with the
 *   payload the server rendered;
 * - the hooks below it (`useDisplay`, `usePrayerSchedule`, `usePrayerState`,
 *   `useTimetable`, ...) or the ready-made components in "@/components/display";
 * - on the TV, the hooks from `./tv`.
 *
 * The remaining exports are the tested logic underneath, for the rare page
 * that needs a piece of it on its own.
 */
export {
  RELOAD_STORAGE_KEY,
  isQuietMoment,
  type AutoReloadOptions,
  type QuietOptions,
} from "./auto-reload";
export {
  OFFSET_APPLY_THRESHOLD_MS,
  RESYNC_INTERVAL_MS,
  VERSION_ENDPOINT,
  createClock,
  type Clock,
  type ClockOptions,
} from "./clock";
export {
  DISPLAY_ENDPOINT,
  POLL_INTERVAL_MS,
  STORAGE_KEY,
  createDisplayStore,
  isDisplayPayload,
  type ConnectionStatus,
  type DisplaySnapshot,
  type DisplayStore,
} from "./display-data";
export { CACHE_HEADER, CACHE_HEADER_STALE } from "./http";
export {
  DisplayProvider,
  useActiveAnnouncements,
  useDisplay,
  useMosqueDate,
  usePrayerSchedule,
  usePrayerState,
  useTimetable,
  type DisplayContextValue,
  type DisplayProviderProps,
  type MosqueDate,
} from "./prayer-state";
export {
  activeAnnouncements,
  describeCountdown,
  describeEvent,
  describeLastUpdated,
  payloadDate,
  staticTimetable,
  type AnnouncementAudience,
  type PrayerSchedule,
  type ScheduledEvent,
  type ScheduledJamaat,
  type TimetableRow,
  type TimetableView,
} from "./prayer-view";
export {
  useAutoReloadOnVersionChange,
  useFullscreen,
  useIdleCursorHide,
  useWakeLock,
  type AutoReloadHookOptions,
  type FullscreenState,
} from "./tv";
export { useClock, useLiveClock, type LiveClock } from "./use-clock";
export { useDisplayData, type DisplayData, type DisplayDataOptions } from "./use-display-data";
