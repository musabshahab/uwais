/**
 * Generates a realistic year of prayer times for demos, tests and the
 * development seed: astronomical begin times for a place, and jamaat times
 * derived from them the way UK mosques usually set theirs.
 *
 * A plain module without side effects: importing it runs nothing.
 */
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import { blankYear } from "../src/lib/import/day";
import { MINUTES_PER_DAY, MS_PER_MINUTE, minutesToTime, parseDateParts, parseTimeToMinutes, toEpochDay } from "../src/lib/time/dates";
import { zoneOffsetMs, zonedDateTimeToEpochMs, zonedNow } from "../src/lib/time/tz";
import type { PrayerDay, TimeField, TimeString } from "../src/lib/types";

/** Where and in which timezone the sample times are calculated. */
export interface SampleLocation {
  latitude: number;
  longitude: number;
  /** IANA timezone the times are written in. */
  timezone: string;
}

/** Central London, the default location of the samples. */
export const LONDON: SampleLocation = { latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" };

/** Jamaat times are announced in quarter hours. */
const JAMAAT_STEP_MINUTES = 15;
/** Fajr jamaat is held at least this long after Fajr begins. */
const FAJR_LEAD_MINUTES = 20;
/** Asr and Isha jamaat are held at least this long after the prayer begins. */
const DEFAULT_LEAD_MINUTES = 10;
/** Maghrib jamaat follows the adhan almost immediately. */
const MAGHRIB_LEAD_MINUTES = 5;
/** Dhuhr jamaat stays fixed through each half of the year. */
const DHUHR_JAMAAT_WINTER: TimeString = "13:00";
const DHUHR_JAMAAT_SUMMER: TimeString = "13:30";

/** A day's astronomical times together with what is needed to group days. */
interface ComputedDay {
  day: PrayerDay;
  /** Minutes the zone is ahead of UTC on that day. */
  offsetMinutes: number;
  /** Identifies the week (Sunday to Saturday) the day belongs to. */
  week: number;
}

/** The wall-clock time of an instant in the zone, or null when adhan could not compute it (polar regions). */
function wallTime(instant: Date, timezone: string): TimeString | null {
  const ms = instant.getTime();
  return Number.isNaN(ms) ? null : zonedNow(timezone, ms).time;
}

/** Rounds minutes up to the next jamaat step. */
function roundUp(minutes: number): number {
  return Math.ceil(minutes / JAMAAT_STEP_MINUTES) * JAMAAT_STEP_MINUTES;
}

/** The latest of a field's times over some days, in minutes, or null when none of them has it. */
function latest(days: readonly ComputedDay[], field: TimeField): number | null {
  let max: number | null = null;
  for (const { day } of days) {
    const time = day[field];
    if (time !== null) max = Math.max(max ?? 0, parseTimeToMinutes(time));
  }
  return max;
}

/** A jamaat time for a group of days: the first quarter hour at least `lead` minutes after the latest begin time. */
function groupJamaat(days: readonly ComputedDay[], beginsField: TimeField, lead: number): TimeString | null {
  const begins = latest(days, beginsField);
  return begins === null ? null : minutesToTime(Math.min(roundUp(begins + lead), MINUTES_PER_DAY - 1));
}

/** Calculates the begin times and sunrise of every day of the year. */
function computeDays(year: number, location: SampleLocation): ComputedDay[] {
  const coordinates = new Coordinates(location.latitude, location.longitude);
  const parameters = CalculationMethod.MoonsightingCommittee();
  return blankYear(year).map((blank) => {
    const { month, day } = parseDateParts(blank.date);
    // adhan identifies the day by the LOCAL calendar fields of the Date it
    // receives, so the Date is built from local fields: whatever timezone
    // this process runs in, it names the intended date. Noon keeps clear of
    // clock changes at midnight.
    const times = new PrayerTimes(coordinates, new Date(year, month - 1, day, 12), parameters);
    const prayerDay: PrayerDay = {
      ...blank,
      fajrBegins: wallTime(times.fajr, location.timezone),
      sunrise: wallTime(times.sunrise, location.timezone),
      dhuhrBegins: wallTime(times.dhuhr, location.timezone),
      asrBegins: wallTime(times.asr, location.timezone),
      maghribBegins: wallTime(times.maghrib, location.timezone),
      ishaBegins: wallTime(times.isha, location.timezone),
    };
    // Noon is after the night's clock change, so the day counts as summer time from the day the clocks go forward.
    const noon = zonedDateTimeToEpochMs(blank.date, "12:00", location.timezone);
    return {
      day: prayerDay,
      offsetMinutes: zoneOffsetMs(location.timezone, noon) / MS_PER_MINUTE,
      // 1970-01-01 was a Thursday; shifting by four days makes weeks start on Sunday.
      week: Math.floor((toEpochDay(blank.date) + 4) / 7),
    };
  });
}

/** Splits days into groups by a key, keeping their order. */
function groupBy(days: readonly ComputedDay[], keyOf: (day: ComputedDay) => string): ComputedDay[][] {
  const groups = new Map<string, ComputedDay[]>();
  for (const day of days) {
    const key = keyOf(day);
    const group = groups.get(key);
    if (group) group.push(day);
    else groups.set(key, [day]);
  }
  return Array.from(groups.values());
}

/**
 * A year of sample prayer times for a location.
 *
 * Begin times and sunrise are calculated with the Moonsighting Committee
 * method and written in the location's timezone. Jamaat times follow common
 * UK practice:
 * - Fajr: the first quarter hour at least 20 minutes after Fajr begins, the same all week;
 * - Dhuhr: 13:00 in winter time and 13:30 in summer time (later only if Dhuhr begins too late for that);
 * - Asr and Isha: the first quarter hour at least 10 minutes after the prayer begins, the same all week;
 * - Maghrib: 5 minutes after it begins.
 * Weeks run Sunday to Saturday and are split where the clocks change, and the
 * days of a clock change carry a note. Jumu'ah times are left empty (the
 * defaults from the settings apply).
 *
 * @param year     The calendar year to generate.
 * @param location Defaults to London.
 */
export function generateSampleDays(year: number, location: SampleLocation = LONDON): PrayerDay[] {
  const days = computeDays(year, location);
  const standardOffset = Math.min(...days.map((day) => day.offsetMinutes));

  for (const week of groupBy(days, (day) => `${day.week}:${day.offsetMinutes}`)) {
    const fajr = groupJamaat(week, "fajrBegins", FAJR_LEAD_MINUTES);
    const asr = groupJamaat(week, "asrBegins", DEFAULT_LEAD_MINUTES);
    const isha = groupJamaat(week, "ishaBegins", DEFAULT_LEAD_MINUTES);
    for (const { day } of week) {
      day.fajrJamaat = day.fajrBegins === null ? null : fajr;
      day.asrJamaat = day.asrBegins === null ? null : asr;
      day.ishaJamaat = day.ishaBegins === null ? null : isha;
      day.maghribJamaat = day.maghribBegins === null ? null : minutesToTime(parseTimeToMinutes(day.maghribBegins) + MAGHRIB_LEAD_MINUTES);
    }
  }

  for (const season of groupBy(days, (day) => String(day.offsetMinutes > standardOffset))) {
    const usual = parseTimeToMinutes(season[0].offsetMinutes > standardOffset ? DHUHR_JAMAAT_SUMMER : DHUHR_JAMAAT_WINTER);
    const latestBegins = latest(season, "dhuhrBegins");
    const jamaat = latestBegins === null ? null : minutesToTime(Math.max(usual, roundUp(latestBegins + DEFAULT_LEAD_MINUTES)));
    for (const { day } of season) day.dhuhrJamaat = day.dhuhrBegins === null ? null : jamaat;
  }

  for (let index = 1; index < days.length; index++) {
    const change = days[index].offsetMinutes - days[index - 1].offsetMinutes;
    if (change !== 0) days[index].day.note = change > 0 ? "Clocks go forward" : "Clocks go back";
  }
  return days.map(({ day }) => day);
}
