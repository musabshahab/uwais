/**
 * The prayer state machine: given the timetable, the settings and the current
 * instant, work out everything a screen shows (today's rows, the current
 * prayer, what to count down to, the Hijri date, Jumu'ah) in one pure call.
 *
 * Every comparison is made between instants (epoch milliseconds), never
 * between wall-clock strings, so countdowns stay exact across midnight and
 * across DST changes.
 */

import {
  JUMUAH_LABEL,
  PRAYERS,
  SUNRISE_LABEL,
  TIME_FIELDS,
  type DateString,
  type JumuahSlot,
  type PrayerDay,
  type PrayerKey,
  type SiteSettings,
  type TimeString,
} from "@/lib/types";
import {
  MS_PER_MINUTE,
  MS_PER_SECOND,
  addDays,
  compareTimes,
  isValidTimeString,
  weekdayOf,
} from "./dates";
import { type HijriDate, hijriForMoment } from "./hijri";
import { type ZonedNow, resolveTimeZone, zonedDateTimeToEpochMs, zonedNow } from "./tz";

/** Key of a display row: the five prayers plus sunrise. */
export type PrayerRowKey = PrayerKey | "sunrise";

/**
 * Where a row stands relative to now.
 * - `current`: the prayer whose time has begun and whose window is still open.
 * - `next`: the first prayer that has not begun yet today (never sunrise).
 * - `passed`: its time has come and it is not the current prayer.
 * - `upcoming`: still to come, after the `next` one.
 */
export type PrayerRowStatus = "passed" | "current" | "next" | "upcoming";

/** Which of a prayer's two times an event refers to. */
export type PrayerEventKind = "begins" | "jamaat";

/**
 * Whether the timetable can serve today.
 * - `ok`: today has a row with at least one prayer time.
 * - `missing-today`: the timetable has rows, but none for today (or a blank one).
 * - `empty`: the timetable has no rows at all.
 */
export type DataStatus = "ok" | "missing-today" | "empty";

/** One line of a day's timetable as the screens present it. */
export interface DayPrayerRow {
  key: PrayerRowKey;
  /** English name; `Jumu'ah` for the Dhuhr row on a Friday. */
  name: string;
  /** Arabic name. */
  arabic: string;
  /** Start of the prayer time; for the sunrise row, the time of sunrise. */
  begins: TimeString | null;
  /** Congregation time; on a Friday Dhuhr row the first Jumu'ah. Always null for sunrise. */
  jamaat: TimeString | null;
  /** True for the Dhuhr row on a Friday. */
  isJumuah: boolean;
  /** Every Jumu'ah of the day, earliest first; empty unless `isJumuah`. */
  jumuahTimes: JumuahSlot[];
}

/** A row of today's timetable with its live status. */
export interface PrayerRow extends DayPrayerRow {
  status: PrayerRowStatus;
}

/** A moment worth counting down to: a prayer beginning or a congregation starting. */
export interface PrayerEvent {
  key: PrayerKey;
  /** English name; `Jumu'ah` for Friday Dhuhr. */
  name: string;
  arabic: string;
  kind: PrayerEventKind;
  /** Wall-clock time of the event in the mosque's timezone. */
  time: TimeString;
  /** Civil date of the event in the mosque's timezone (today or tomorrow). */
  date: DateString;
  /** The instant of the event, epoch milliseconds. */
  atMs: number;
  /** Seconds from now until the event, rounded up; always at least 1. */
  secondsUntil: number;
  /** True for the events of Friday's Dhuhr row. */
  isJumuah: boolean;
  /** Label of the Jumu'ah slot (e.g. `2nd Jumu'ah`) for a Jumu'ah congregation, else null. */
  label: string | null;
}

/** The prayer whose time is in. */
export interface CurrentPrayer {
  key: PrayerKey;
  name: string;
  arabic: string;
  isJumuah: boolean;
  /** When its time began, epoch milliseconds. */
  startedAtMs: number;
  /** When its window closes, epoch milliseconds. */
  endsAtMs: number;
}

/** A congregation that started within the configured number of minutes. */
export interface JamaatInProgress {
  key: PrayerKey;
  name: string;
  arabic: string;
  isJumuah: boolean;
  /** Label of the Jumu'ah slot for a Jumu'ah congregation, else null. */
  label: string | null;
  /** When the congregation started, epoch milliseconds. */
  startedAtMs: number;
  /** When the "in progress" screen should end, epoch milliseconds. */
  endsAtMs: number;
  /** Seconds until `endsAtMs`, rounded up; always at least 1. */
  secondsRemaining: number;
}

/** A congregation time that is different tomorrow. */
export interface JamaatChange {
  key: PrayerKey;
  name: string;
  arabic: string;
  /** Today's jamaat time. */
  from: TimeString;
  /** Tomorrow's jamaat time. */
  to: TimeString;
}

/** The Jumu'ah to advertise. */
export interface UpcomingJumuah {
  /** The Friday in question: today while a Jumu'ah is still to come, else next Friday. */
  date: DateString;
  /** Its Jumu'ah times, earliest first; empty when none are known. */
  slots: JumuahSlot[];
}

/** Input of `computePrayerState`. */
export interface PrayerStateInput {
  /** Timetable rows in any order; ideally yesterday, today and the days after. */
  days: readonly PrayerDay[];
  settings: SiteSettings;
  /** The current instant, epoch milliseconds. */
  nowMs: number;
}

/** Everything a screen needs to render the prayer times at one instant. */
export interface PrayerState {
  /** The instant this state describes, epoch milliseconds. */
  nowMs: number;
  /**
   * The zone the state was computed in. Equals `settings.timezone` unless the
   * device does not know that zone (see `resolveTimeZone`).
   */
  timezone: string;
  /** The mosque's wall clock. */
  clock: ZonedNow;
  /** Today's date in the mosque's timezone. */
  today: DateString;
  /** The day after `today`. */
  tomorrow: DateString;
  /** The mosque's wall-clock time, `HH:mm`. */
  nowTime: TimeString;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  isFriday: boolean;
  /** Today's timetable row, or null when the timetable has none. */
  todayRow: PrayerDay | null;
  /** Tomorrow's timetable row, or null when the timetable has none. */
  tomorrowRow: PrayerDay | null;
  /** Today's display rows: fajr, sunrise, dhuhr (Jumu'ah on a Friday), asr, maghrib, isha. */
  rows: PrayerRow[];
  /** The next event of any kind, today or tomorrow; null when the timetable has nothing ahead. */
  next: PrayerEvent | null;
  /** The next congregation. */
  nextJamaat: PrayerEvent | null;
  /** The next prayer to begin. */
  nextBegins: PrayerEvent | null;
  /** The prayer whose time is in, or null (before Fajr, and between sunrise and Dhuhr). */
  current: CurrentPrayer | null;
  /** The congregation that started recently, when the TV setting asks for that screen. */
  jamaatInProgress: JamaatInProgress | null;
  /** Congregation times that differ tomorrow; empty when none do or a day is missing. */
  tomorrowChanges: JamaatChange[];
  /** The Hijri date in effect right now. */
  hijri: HijriDate;
  /** The Jumu'ah to advertise. */
  jumuah: UpcomingJumuah;
  dataStatus: DataStatus;
}

/** A `PrayerEvent` before it is measured against the current instant. */
type TimedEvent = Omit<PrayerEvent, "secondsUntil">;

const START_OF_DAY: TimeString = "00:00";
const THURSDAY = 4;
const FRIDAY = 5;

/** Drops anything that is not a well-formed time so bad data cannot break a screen. */
function cleanTime(value: TimeString | null | undefined): TimeString | null {
  return isValidTimeString(value) ? value : null;
}

/** `1st`, `2nd`, `3rd`, `4th`, ... */
function ordinal(position: number): string {
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`;
  const last = position % 10;
  if (last === 1) return `${position}st`;
  if (last === 2) return `${position}nd`;
  return last === 3 ? `${position}rd` : `${position}th`;
}

/** Label for a Jumu'ah that has none: plain when it is the only one, numbered otherwise. */
function defaultSlotLabel(index: number, total: number): string {
  return total === 1 ? JUMUAH_LABEL.name : `${ordinal(index + 1)} ${JUMUAH_LABEL.name}`;
}

/**
 * Whether the timetable has a row with at least one usable prayer time. A
 * missing row and a row of blanks are the same thing to the state machine:
 * neither says anything about the day.
 */
function hasPrayerTimes(day: PrayerDay | null): day is PrayerDay {
  return day !== null && TIME_FIELDS.some((field) => cleanTime(day[field]) !== null);
}

/**
 * The timetable row for a date, or null when there is none. The list may be
 * in any order.
 */
export function getDayRow(days: readonly PrayerDay[], date: DateString): PrayerDay | null {
  for (let index = 0; index < days.length; index++) {
    if (days[index].date === date) return days[index];
  }
  return null;
}

/**
 * The Jumu'ah times that apply to a Friday, earliest first. In order of
 * preference:
 * 1. the row's own `jumuah` times; they take the labels of the default slots
 *    when there are equally many, and are otherwise labelled `Jumu'ah` or
 *    `1st Jumu'ah`, `2nd Jumu'ah`, ...;
 * 2. the default slots from the settings, with their labels;
 * 3. the row's Dhuhr jamaat time, for mosques that keep Jumu'ah in that column;
 * 4. nothing.
 * @param day The Friday's timetable row, or null when the timetable has none.
 */
export function resolveJumuahSlots(
  day: PrayerDay | null,
  settings: Pick<SiteSettings, "jumuah">,
): JumuahSlot[] {
  const defaults = settings.jumuah
    .filter((slot) => isValidTimeString(slot.time))
    .sort((a, b) => compareTimes(a.time, b.time))
    .map((slot, index, all) => ({
      label: slot.label.trim() || defaultSlotLabel(index, all.length),
      time: slot.time,
    }));

  const own = day
    ? day.jumuah
        .filter((time, index, all) => isValidTimeString(time) && all.indexOf(time) === index)
        .sort(compareTimes)
    : [];
  if (own.length > 0) {
    const reuseLabels = own.length === defaults.length;
    return own.map((time, index) => ({
      label: reuseLabels ? defaults[index].label : defaultSlotLabel(index, own.length),
      time,
    }));
  }
  if (defaults.length > 0) return defaults;

  const dhuhrJamaat = day ? cleanTime(day.dhuhrJamaat) : null;
  return dhuhrJamaat === null ? [] : [{ label: JUMUAH_LABEL.name, time: dhuhrJamaat }];
}

/**
 * The display rows for any date, without live status: fajr, sunrise, dhuhr,
 * asr, maghrib, isha. On a Friday the Dhuhr row is presented as Jumu'ah: it
 * keeps `begins` (the start of Dhuhr), lists every Jumu'ah in `jumuahTimes`
 * (see `resolveJumuahSlots`) and takes the first of them as its `jamaat`.
 * Malformed times are treated as missing.
 * @param day  The timetable row for `date`, or null when the timetable has none
 *             (the rows are then returned with empty times).
 * @param date The date the rows are for; decides whether it is a Friday.
 * @throws RangeError when `date` is not a valid date.
 */
export function prayerRowsForDay(
  day: PrayerDay | null,
  settings: Pick<SiteSettings, "jumuah">,
  date: DateString,
): DayPrayerRow[] {
  const friday = weekdayOf(date) === FRIDAY;
  const rows: DayPrayerRow[] = [];
  for (const prayer of PRAYERS) {
    const begins = day ? cleanTime(day[prayer.beginsField]) : null;
    if (prayer.key === "dhuhr" && friday) {
      const jumuahTimes = resolveJumuahSlots(day, settings);
      rows.push({
        key: prayer.key,
        name: JUMUAH_LABEL.name,
        arabic: JUMUAH_LABEL.arabic,
        begins,
        jamaat: jumuahTimes.length > 0 ? jumuahTimes[0].time : null,
        isJumuah: true,
        jumuahTimes,
      });
    } else {
      rows.push({
        key: prayer.key,
        name: prayer.name,
        arabic: prayer.arabic,
        begins,
        jamaat: day ? cleanTime(day[prayer.jamaatField]) : null,
        isJumuah: false,
        jumuahTimes: [],
      });
    }
    if (prayer.key === "fajr") {
      rows.push({
        key: "sunrise",
        name: SUNRISE_LABEL.name,
        arabic: SUNRISE_LABEL.arabic,
        begins: day ? cleanTime(day.sunrise) : null,
        jamaat: null,
        isJumuah: false,
        jumuahTimes: [],
      });
    }
  }
  return rows;
}

/**
 * Every prayer event of one day in chronological order: each known begins
 * and jamaat time of the five prayers, and on a Friday every Jumu'ah in
 * place of the Dhuhr jamaat. Sunrise is not a prayer and produces no event.
 */
function eventsForDay(
  rows: readonly DayPrayerRow[],
  date: DateString,
  timeZone: string,
): TimedEvent[] {
  const events: TimedEvent[] = [];
  for (const row of rows) {
    if (row.key === "sunrise") continue;
    const key = row.key;
    const { name, arabic, isJumuah } = row;
    const add = (kind: PrayerEventKind, time: TimeString, label: string | null) => {
      const atMs = zonedDateTimeToEpochMs(date, time, timeZone);
      events.push({ key, name, arabic, kind, time, date, atMs, isJumuah, label });
    };
    if (row.begins !== null) add("begins", row.begins, null);
    if (isJumuah) {
      for (const slot of row.jumuahTimes) add("jamaat", slot.time, slot.label);
    } else if (row.jamaat !== null) {
      add("jamaat", row.jamaat, null);
    }
  }
  // Sorted by instant rather than by column order, so a timetable with an
  // unusual sequence (an Isha jamaat entered as 00:10, say) still counts
  // down to whatever really comes first.
  return events.sort((a, b) => a.atMs - b.atMs);
}

/**
 * The events of a date, or none when the timetable says nothing about it.
 * The default Jumu'ah slots alone do not count: a countdown to them would
 * skip the prayers nobody entered.
 */
function eventsForRow(
  day: PrayerDay | null,
  settings: SiteSettings,
  date: DateString,
  timeZone: string,
): TimedEvent[] {
  return hasPrayerTimes(day)
    ? eventsForDay(prayerRowsForDay(day, settings, date), date, timeZone)
    : [];
}

/** The first event strictly after now, optionally of one kind only. */
function firstEventAfter(
  events: readonly TimedEvent[],
  nowMs: number,
  kind?: PrayerEventKind,
): PrayerEvent | null {
  for (const event of events) {
    if (event.atMs > nowMs && (kind === undefined || event.kind === kind)) {
      return { ...event, secondsUntil: Math.ceil((event.atMs - nowMs) / MS_PER_SECOND) };
    }
  }
  return null;
}

/**
 * The instant each row starts: its begins time, or its jamaat time for
 * timetables that publish only those. Null where the row has neither.
 */
function rowStarts(
  rows: readonly DayPrayerRow[],
  date: DateString,
  timeZone: string,
): (number | null)[] {
  return rows.map((row) => {
    const time = row.begins ?? row.jamaat;
    return time === null ? null : zonedDateTimeToEpochMs(date, time, timeZone);
  });
}

/**
 * The prayer whose window contains now. A window opens when the row starts
 * and closes when the next row with a known time starts: sunrise for Fajr,
 * the following prayer for the others, and midnight for the last one.
 *
 * Simplification: the search only looks at today's row, so after midnight
 * yesterday's Isha is no longer reported and there is no current prayer
 * until Fajr begins.
 */
function findCurrentPrayer(
  rows: readonly DayPrayerRow[],
  starts: readonly (number | null)[],
  endOfDayMs: number,
  nowMs: number,
): CurrentPrayer | null {
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const startedAtMs = starts[index];
    if (row.key === "sunrise" || startedAtMs === null || startedAtMs > nowMs) continue;
    let endsAtMs = endOfDayMs;
    for (let later = index + 1; later < rows.length; later++) {
      const laterStart = starts[later];
      if (laterStart !== null) {
        endsAtMs = laterStart;
        break;
      }
    }
    if (nowMs < endsAtMs) {
      const { name, arabic, isJumuah } = row;
      return { key: row.key, name, arabic, isJumuah, startedAtMs, endsAtMs };
    }
  }
  return null;
}

/** Adds the live status to each of today's rows. */
function withStatus(
  rows: readonly DayPrayerRow[],
  starts: readonly (number | null)[],
  currentKey: PrayerKey | null,
  nowMs: number,
): PrayerRow[] {
  let nextIndex = -1;
  let lastStartedIndex = -1;
  for (let index = 0; index < rows.length; index++) {
    const start = starts[index];
    if (start === null) continue;
    if (start <= nowMs) lastStartedIndex = index;
    else if (nextIndex === -1 && rows[index].key !== "sunrise") nextIndex = index;
  }
  return rows.map((row, index): PrayerRow => {
    const start = starts[index];
    let status: PrayerRowStatus;
    if (row.key === currentKey) status = "current";
    else if (index === nextIndex) status = "next";
    else if (start !== null) status = start <= nowMs ? "passed" : "upcoming";
    // A row without times takes its status from its place in the day.
    else status = index < lastStartedIndex ? "passed" : "upcoming";
    return { ...row, status };
  });
}

/** The most recently started congregation that is still within its "in progress" window. */
function findJamaatInProgress(
  events: readonly TimedEvent[],
  windowMs: number,
  nowMs: number,
): JamaatInProgress | null {
  let latest: TimedEvent | null = null;
  for (const event of events) {
    const started = event.kind === "jamaat" && event.atMs <= nowMs && nowMs < event.atMs + windowMs;
    if (started && (latest === null || event.atMs >= latest.atMs)) latest = event;
  }
  if (latest === null) return null;
  const endsAtMs = latest.atMs + windowMs;
  return {
    key: latest.key,
    name: latest.name,
    arabic: latest.arabic,
    isJumuah: latest.isJumuah,
    label: latest.label,
    startedAtMs: latest.atMs,
    endsAtMs,
    secondsRemaining: Math.ceil((endsAtMs - nowMs) / MS_PER_SECOND),
  };
}

/**
 * Congregation times that differ between two consecutive days. Dhuhr is left
 * out when either day is a Friday, because Jumu'ah replaces it and the
 * difference would not be a change to the regular time.
 */
function findJamaatChanges(
  todayRow: PrayerDay | null,
  tomorrowRow: PrayerDay | null,
  weekday: number,
): JamaatChange[] {
  if (!todayRow || !tomorrowRow) return [];
  const fridayInvolved = weekday === THURSDAY || weekday === FRIDAY;
  const changes: JamaatChange[] = [];
  for (const prayer of PRAYERS) {
    if (prayer.key === "dhuhr" && fridayInvolved) continue;
    const from = cleanTime(todayRow[prayer.jamaatField]);
    const to = cleanTime(tomorrowRow[prayer.jamaatField]);
    if (from !== null && to !== null && from !== to) {
      changes.push({ key: prayer.key, name: prayer.name, arabic: prayer.arabic, from, to });
    }
  }
  return changes;
}

/** Today's Jumu'ah while one is still to come on a Friday, otherwise next Friday's. */
function findUpcomingJumuah(
  days: readonly PrayerDay[],
  settings: SiteSettings,
  clock: ZonedNow,
  todayRow: PrayerDay | null,
  timeZone: string,
  nowMs: number,
): UpcomingJumuah {
  if (clock.weekday === FRIDAY) {
    const slots = resolveJumuahSlots(todayRow, settings);
    const last = slots.length > 0 ? slots[slots.length - 1] : null;
    if (last !== null && zonedDateTimeToEpochMs(clock.date, last.time, timeZone) > nowMs) {
      return { date: clock.date, slots };
    }
  }
  const daysAhead = (FRIDAY - clock.weekday + 7) % 7 || 7;
  const date = addDays(clock.date, daysAhead);
  return { date, slots: resolveJumuahSlots(getDayRow(days, date), settings) };
}

/**
 * Computes the full prayer state for one instant. Pure: the same input always
 * gives the same output, and nothing reads the system clock or timezone.
 *
 * Never throws because of missing or malformed timetable data: absent rows
 * and unusable times simply produce nulls, empty lists and a `dataStatus`.
 *
 * Rules worth knowing:
 * - `next` looks at today's and tomorrow's rows only. A later row is not used
 *   when tomorrow's is missing, since that countdown would skip a whole day.
 * - There is no current prayer between midnight and Fajr (yesterday's Isha is
 *   not carried over), nor between sunrise and Dhuhr.
 * - A congregation that started shortly before midnight is still reported by
 *   `jamaatInProgress` after midnight, provided yesterday's row is in `days`.
 * - A time-of-day is always read as a time on its own row's date.
 * - A row without a single prayer time counts as missing: it produces no
 *   events and no current prayer, even on a Friday with default Jumu'ah slots.
 *
 * @throws RangeError when `nowMs` is not a finite number.
 */
export function computePrayerState({ days, settings, nowMs }: PrayerStateInput): PrayerState {
  const timezone = resolveTimeZone(settings.timezone);
  const clock = zonedNow(timezone, nowMs);
  const today = clock.date;
  const tomorrow = addDays(today, 1);
  const todayRow = getDayRow(days, today);
  const tomorrowRow = getDayRow(days, tomorrow);

  const todayUsable = hasPrayerTimes(todayRow);

  const dayRows = prayerRowsForDay(todayRow, settings, today);
  const todayEvents = todayUsable ? eventsForDay(dayRows, today, timezone) : [];
  const tomorrowEvents = eventsForRow(tomorrowRow, settings, tomorrow, timezone);
  const upcomingEvents = todayEvents.concat(tomorrowEvents);

  const startOfDayMs = zonedDateTimeToEpochMs(today, START_OF_DAY, timezone);
  const endOfDayMs = zonedDateTimeToEpochMs(tomorrow, START_OF_DAY, timezone);
  // Without prayer times for today the Jumu'ah row still shows the default
  // slots, but that alone is not enough to claim a prayer is in progress.
  const starts = todayUsable ? rowStarts(dayRows, today, timezone) : dayRows.map(() => null);
  const current = findCurrentPrayer(dayRows, starts, endOfDayMs, nowMs);

  const inProgressMinutes = settings.tv.jamaatInProgressMinutes;
  let jamaatInProgress: JamaatInProgress | null = null;
  if (Number.isFinite(inProgressMinutes) && inProgressMinutes > 0) {
    const windowMs = inProgressMinutes * MS_PER_MINUTE;
    // Yesterday's row only matters while a late congregation could still be running.
    const yesterday = nowMs - startOfDayMs < windowMs ? addDays(today, -1) : null;
    const recentEvents =
      yesterday === null
        ? todayEvents
        : eventsForRow(getDayRow(days, yesterday), settings, yesterday, timezone).concat(
            todayEvents,
          );
    jamaatInProgress = findJamaatInProgress(recentEvents, windowMs, nowMs);
  }

  let dataStatus: DataStatus = "ok";
  if (days.length === 0) dataStatus = "empty";
  else if (!todayUsable) dataStatus = "missing-today";

  return {
    nowMs,
    timezone,
    clock,
    today,
    tomorrow,
    nowTime: clock.time,
    weekday: clock.weekday,
    isFriday: clock.weekday === FRIDAY,
    todayRow,
    tomorrowRow,
    rows: withStatus(dayRows, starts, current ? current.key : null, nowMs),
    next: firstEventAfter(upcomingEvents, nowMs),
    nextJamaat: firstEventAfter(upcomingEvents, nowMs, "jamaat"),
    nextBegins: firstEventAfter(upcomingEvents, nowMs, "begins"),
    current,
    jamaatInProgress,
    tomorrowChanges: findJamaatChanges(todayRow, tomorrowRow, clock.weekday),
    hijri: hijriForMoment({
      date: today,
      minutesOfDay: clock.minutesOfDay,
      // Jamaat-only timetables have no Maghrib start; its congregation is held at sunset.
      maghribTime: todayRow
        ? (cleanTime(todayRow.maghribBegins) ?? cleanTime(todayRow.maghribJamaat))
        : null,
      rollAtMaghrib: settings.hijriRollAtMaghrib,
      adjustmentDays: settings.hijriAdjustment,
    }),
    jumuah: findUpcomingJumuah(days, settings, clock, todayRow, timezone, nowMs),
    dataStatus,
  };
}
