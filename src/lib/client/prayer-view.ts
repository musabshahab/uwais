/**
 * Pure helpers between the prayer state machine and the screens: the part of
 * the state that does not change every second, the timetable to render before
 * the clock is known, and the wording of the small live texts. Kept apart
 * from React so that every rule in here is unit-tested.
 */

import {
  formatCountdownWords,
  formatDateMedium,
  formatTimeText,
  getDayRow,
  prayerRowsForDay,
  resolveTimeZone,
  zonedNow,
  type DayPrayerRow,
  type JamaatInProgress,
  type PrayerEvent,
  type PrayerRowStatus,
  type PrayerState,
} from "@/lib/time";
import {
  PRAYERS,
  type Announcement,
  type DateString,
  type DisplayPayload,
  type SiteSettings,
} from "@/lib/types";

/** A prayer event without its per-second countdown. */
export type ScheduledEvent = Omit<PrayerEvent, "secondsUntil">;

/** A congregation in progress without its per-second countdown. */
export type ScheduledJamaat = Omit<JamaatInProgress, "secondsRemaining">;

/**
 * Everything in a `PrayerState` that stays the same from one second to the
 * next: it changes when a prayer begins or a congregation starts, at
 * midnight, and when the timetable is edited. Components that render from
 * this instead of the full state re-render a few dozen times a day rather
 * than 86,400 times.
 */
export interface PrayerSchedule
  extends Omit<
    PrayerState,
    "nowMs" | "clock" | "nowTime" | "next" | "nextJamaat" | "nextBegins" | "jamaatInProgress"
  > {
  /** The next event of any kind; see `PrayerState.next`. */
  next: ScheduledEvent | null;
  /** The next congregation. */
  nextJamaat: ScheduledEvent | null;
  /** The next prayer to begin. */
  nextBegins: ScheduledEvent | null;
  /** The congregation that started recently, when the TV setting asks for that screen. */
  jamaatInProgress: ScheduledJamaat | null;
}

/** A timetable row as the screens render it: its live status is unknown before the clock is. */
export interface TimetableRow extends DayPrayerRow {
  /** Where the row stands relative to now, or null before the clock is known. */
  status: PrayerRowStatus | null;
}

/** One day's timetable, ready to render. */
export interface TimetableView {
  /** The date the rows are for, in the mosque's timezone. */
  date: DateString;
  /** Fajr, sunrise, dhuhr (Jumu'ah on a Friday), asr, maghrib, isha. */
  rows: TimetableRow[];
  /**
   * False for the server-rendered view, which is the day the payload was
   * produced on and carries no statuses; true once the clock is running.
   */
  live: boolean;
}

/** Which screen an announcement is wanted for. */
export type AnnouncementAudience = "site" | "tv";

function withoutCountdown(event: PrayerEvent | null): ScheduledEvent | null {
  if (event === null) return null;
  const { key, name, arabic, kind, time, date, atMs, isJumuah, label } = event;
  return { key, name, arabic, kind, time, date, atMs, isJumuah, label };
}

/** Reduces a prayer state to its slow-changing part. */
export function toSchedule(state: PrayerState): PrayerSchedule {
  const inProgress = state.jamaatInProgress;
  return {
    timezone: state.timezone,
    today: state.today,
    tomorrow: state.tomorrow,
    weekday: state.weekday,
    isFriday: state.isFriday,
    todayRow: state.todayRow,
    tomorrowRow: state.tomorrowRow,
    rows: state.rows,
    next: withoutCountdown(state.next),
    nextJamaat: withoutCountdown(state.nextJamaat),
    nextBegins: withoutCountdown(state.nextBegins),
    current: state.current,
    jamaatInProgress:
      inProgress === null
        ? null
        : {
            key: inProgress.key,
            name: inProgress.name,
            arabic: inProgress.arabic,
            isJumuah: inProgress.isJumuah,
            label: inProgress.label,
            startedAtMs: inProgress.startedAtMs,
            endsAtMs: inProgress.endsAtMs,
          },
    tomorrowChanges: state.tomorrowChanges,
    hijri: state.hijri,
    jumuah: state.jumuah,
    dataStatus: state.dataStatus,
  };
}

/**
 * A string that is equal for two schedules exactly when their content is.
 * A schedule holds only JSON values, so its serialisation is that string.
 */
export function scheduleSignature(schedule: PrayerSchedule): string {
  return JSON.stringify(schedule);
}

/** Rebuilds the schedule a signature was made from. */
export function scheduleFromSignature(signature: string): PrayerSchedule {
  return JSON.parse(signature) as PrayerSchedule;
}

/**
 * The mosque's calendar date at the moment the payload was produced. Server
 * rendering and hydration both derive "today" from this, never from a clock
 * of their own, so the two always agree.
 */
export function payloadDate(payload: DisplayPayload): DateString {
  return zonedNow(resolveTimeZone(payload.settings.timezone), payload.serverNow).date;
}

/**
 * The timetable to render before the clock is known (on the server and
 * during hydration): the rows of the day the payload was produced on, without
 * statuses.
 */
export function staticTimetable(payload: DisplayPayload): TimetableView {
  const date = payloadDate(payload);
  const rows = prayerRowsForDay(getDayRow(payload.days, date), payload.settings, date);
  return { date, rows: rows.map((row) => ({ ...row, status: null })), live: false };
}

/** Today's timetable with live statuses, once the clock is running. */
export function liveTimetable(schedule: Pick<PrayerSchedule, "today" | "rows">): TimetableView {
  return { date: schedule.today, rows: schedule.rows, live: true };
}

/**
 * Names a prayer event the way a worshipper would: `Asr jamaat`,
 * `Maghrib begins`, and on a Friday `Jumu'ah` or `2nd Jumu'ah` for the
 * congregations but `Dhuhr begins` for the start of the prayer time, since
 * Jumu'ah itself does not begin then.
 */
export function describeEvent(event: ScheduledEvent): string {
  if (event.kind === "jamaat") {
    return event.isJumuah ? (event.label ?? event.name) : `${event.name} jamaat`;
  }
  const prayer = PRAYERS.filter((candidate) => candidate.key === event.key)[0];
  return `${prayer ? prayer.name : event.name} begins`;
}

/** The next-prayer line, e.g. `Asr jamaat in 12 min` or `Fajr begins in less than a minute`. */
export function describeCountdown(event: PrayerEvent): string {
  return `${describeEvent(event)} in ${formatCountdownWords(event.secondsUntil)}`;
}

/**
 * When the data on screen was produced, in the mosque's own time: `2:05 PM`
 * when that was today, `Tue 24 Nov, 2:05 PM` otherwise.
 * @param lastUpdatedMs Epoch milliseconds, by the server's clock.
 * @param today The mosque's current date, or null when it is not known yet
 *        (the date is then always included).
 */
export function describeLastUpdated(
  lastUpdatedMs: number,
  today: DateString | null,
  settings: Pick<SiteSettings, "timezone" | "timeFormat">,
): string {
  const updated = zonedNow(resolveTimeZone(settings.timezone), lastUpdatedMs);
  const time = formatTimeText(updated.time, settings.timeFormat);
  return updated.date === today ? time : `${formatDateMedium(updated.date)}, ${time}`;
}

/**
 * The announcements to show on one screen on one day: those flagged for that
 * screen whose date range includes the day, in the order the server sent them
 * (pinned first, then newest).
 * @param today The mosque's current date.
 */
export function activeAnnouncements(
  announcements: readonly Announcement[],
  today: DateString,
  audience: AnnouncementAudience,
): Announcement[] {
  return announcements.filter((announcement) => {
    const shown = audience === "tv" ? announcement.showOnTv : announcement.showOnSite;
    const started = announcement.startsOn === null || announcement.startsOn <= today;
    const ended = announcement.endsOn !== null && announcement.endsOn < today;
    return shown && started && !ended;
  });
}
