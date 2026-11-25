/**
 * Timezone-safe primitives. The mosque has one configured IANA timezone and
 * every screen must show that zone's wall clock, whatever the timezone of the
 * server or the viewer's device. The only bridge between instants and wall
 * clocks used here is `Intl.DateTimeFormat` with an explicit `timeZone`,
 * which also works on the old Chromium builds found in TV boxes.
 */

import type { DateString, TimeString } from "@/lib/types";
import {
  MS_PER_DAY,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  civilToEpochDay,
  minutesToTime,
  parseDateParts,
  parseTimeToMinutes,
  toDateString,
  weekdayOf,
} from "./dates";

/** The wall clock of a timezone at one instant. */
export interface ZonedNow {
  /** Calendar date in the zone. */
  date: DateString;
  /** Wall-clock time in the zone, `HH:mm`. */
  time: TimeString;
  /** 0 to 23. */
  hour: number;
  /** 0 to 59. */
  minute: number;
  /** 0 to 59. */
  second: number;
  /** The wall clock in minutes, `hour * 60 + minute`: 0 to 1439. */
  minutesOfDay: number;
  /**
   * The wall clock in seconds, 0 to 86399. On a day the clocks change this is
   * not the time elapsed since midnight; compare instants for durations.
   */
  secondsOfDay: number;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
}

/** Zone used when the configured one is unusable on the running device. */
export const FALLBACK_TIME_ZONE = "UTC";

/** Shape of an IANA zone name; rules out numeric offsets such as `+01:00`. */
const ZONE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/**
 * Zones renamed in the IANA database, new name to the name older devices
 * know. A TV box whose browser predates a rename rejects the new spelling
 * although it has the zone's rules under the old one.
 */
const LEGACY_ZONE_NAMES: Readonly<Record<string, string>> = {
  "America/Nuuk": "America/Godthab",
  "Asia/Ho_Chi_Minh": "Asia/Saigon",
  "Asia/Kathmandu": "Asia/Katmandu",
  "Asia/Kolkata": "Asia/Calcutta",
  "Asia/Yangon": "Asia/Rangoon",
  "Europe/Kyiv": "Europe/Kiev",
  "Pacific/Kanton": "Pacific/Enderbury",
};

/**
 * Offered in the settings dropdown when the runtime cannot enumerate its own
 * zones (browsers without `Intl.supportedValuesOf`). Uses the legacy
 * spellings on purpose: a runtime that old does not know the renamed ones.
 */
const BUILT_IN_TIME_ZONES: readonly string[] = [
  "Africa/Algiers",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Dar_es_Salaam",
  "Africa/Johannesburg",
  "Africa/Khartoum",
  "Africa/Lagos",
  "Africa/Mogadishu",
  "Africa/Nairobi",
  "Africa/Tripoli",
  "Africa/Tunis",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Edmonton",
  "America/Guyana",
  "America/Halifax",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Paramaribo",
  "America/Phoenix",
  "America/Port_of_Spain",
  "America/Sao_Paulo",
  "America/St_Johns",
  "America/Toronto",
  "America/Vancouver",
  "America/Winnipeg",
  "Asia/Almaty",
  "Asia/Amman",
  "Asia/Baghdad",
  "Asia/Bahrain",
  "Asia/Baku",
  "Asia/Bangkok",
  "Asia/Beirut",
  "Asia/Brunei",
  "Asia/Calcutta",
  "Asia/Colombo",
  "Asia/Damascus",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Kabul",
  "Asia/Karachi",
  "Asia/Katmandu",
  "Asia/Kuala_Lumpur",
  "Asia/Kuwait",
  "Asia/Makassar",
  "Asia/Manila",
  "Asia/Muscat",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tashkent",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Atlantic/Reykjavik",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Darwin",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Belgrade",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Bucharest",
  "Europe/Copenhagen",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Kiev",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Sarajevo",
  "Europe/Stockholm",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Indian/Maldives",
  "Indian/Mauritius",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Honolulu",
];

const FORMATTER_CACHE_LIMIT = 32;
const INSTANT_CACHE_LIMIT = 2048;

/** One formatter per zone: constructing them is far too slow for a once-a-second tick. */
const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Conversions already made, keyed by zone, date and time. The same few dozen
 * prayer times are converted on every tick, and zone rules never change
 * while the program runs, so the result can be reused safely.
 */
const instantCache = new Map<string, number>();

/** Wall-clock fields of an instant, before they are packaged for callers. */
interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * The cached formatter for a zone.
 * @throws RangeError when the runtime does not know the zone.
 */
function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (formatters.size >= FORMATTER_CACHE_LIMIT) formatters.clear();
  formatters.set(timeZone, formatter);
  return formatter;
}

/** Reads the wall clock a zone shows at an instant. */
function wallClockAt(timeZone: string, instantMs: number): WallClock {
  const clock: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  const parts = getFormatter(timeZone).formatToParts(new Date(instantMs));
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    switch (part.type) {
      case "year":
      case "month":
      case "day":
      case "hour":
      case "minute":
      case "second":
        clock[part.type] = Number(part.value);
        break;
      default:
        break;
    }
  }
  // Some Chromium builds print midnight as hour 24 of the day that is starting.
  if (clock.hour === 24) clock.hour = 0;
  return clock;
}

/** The wall clock expressed as if it were UTC, in epoch milliseconds. */
function wallClockToUtcMs(clock: WallClock): number {
  return (
    civilToEpochDay(clock.year, clock.month, clock.day) * MS_PER_DAY +
    (clock.hour * 3600 + clock.minute * 60 + clock.second) * MS_PER_SECOND
  );
}

/**
 * Whether the runtime accepts `timeZone` as an IANA zone name such as
 * `Europe/London`. Matching is case-insensitive, as it is in `Intl`. Numeric
 * offsets (`+01:00`) are rejected even where the runtime would take them,
 * because older browsers do not and the timetable needs real DST rules.
 */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !ZONE_NAME_PATTERN.test(timeZone)) return false;
  if (formatters.has(timeZone)) return true;
  try {
    // Not cached: this is called with arbitrary user input.
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone to actually use for a configured zone name on this device: the
 * name itself when the runtime knows it, its pre-rename spelling when the
 * runtime's timezone database is older than the rename, and otherwise
 * `FALLBACK_TIME_ZONE`. Never throws, so a display keeps running even with a
 * zone it cannot interpret.
 * @param isSupported Zone test; replaceable so the fallbacks can be unit-tested.
 */
export function resolveTimeZone(
  timeZone: string,
  isSupported: (candidate: string) => boolean = isValidTimeZone,
): string {
  if (isSupported(timeZone)) return timeZone;
  const legacy = Object.prototype.hasOwnProperty.call(LEGACY_ZONE_NAMES, timeZone)
    ? LEGACY_ZONE_NAMES[timeZone]
    : null;
  return legacy !== null && isSupported(legacy) ? legacy : FALLBACK_TIME_ZONE;
}

/**
 * The zone's UTC offset at an instant, in milliseconds (positive east of
 * Greenwich: `Asia/Karachi` gives 18000000).
 * @throws RangeError for an unknown zone or a non-finite instant.
 */
export function zoneOffsetMs(timeZone: string, instantMs: number): number {
  const wholeSecondMs = Math.floor(instantMs / MS_PER_SECOND) * MS_PER_SECOND;
  return wallClockToUtcMs(wallClockAt(timeZone, instantMs)) - wholeSecondMs;
}

/**
 * The wall clock of `timeZone` at the instant `nowMs`.
 * @param timeZone IANA zone name.
 * @param nowMs    Epoch milliseconds.
 * @throws RangeError for an unknown zone or a non-finite instant.
 */
export function zonedNow(timeZone: string, nowMs: number): ZonedNow {
  const clock = wallClockAt(timeZone, nowMs);
  const date = toDateString(clock.year, clock.month, clock.day);
  const minutesOfDay = clock.hour * 60 + clock.minute;
  return {
    date,
    time: minutesToTime(minutesOfDay),
    hour: clock.hour,
    minute: clock.minute,
    second: clock.second,
    minutesOfDay,
    secondsOfDay: minutesOfDay * 60 + clock.second,
    weekday: weekdayOf(date),
  };
}

/**
 * First instant, to the second, at which the zone's offset is `offsetAfter`,
 * given that it still differs at `beforeMs` and already matches at `afterMs`.
 */
function findTransition(
  timeZone: string,
  beforeMs: number,
  afterMs: number,
  offsetAfter: number,
): number {
  let low = beforeMs;
  let high = afterMs;
  while (high - low > MS_PER_SECOND) {
    const middle = low + Math.floor((high - low) / (2 * MS_PER_SECOND)) * MS_PER_SECOND;
    if (zoneOffsetMs(timeZone, middle) === offsetAfter) high = middle;
    else low = middle;
  }
  return high;
}

/** Uncached core of `zonedDateTimeToEpochMs`. */
function resolveInstant(date: DateString, time: TimeString, timeZone: string): number {
  const { year, month, day } = parseDateParts(date);
  const wallMs =
    civilToEpochDay(year, month, day) * MS_PER_DAY + parseTimeToMinutes(time) * MS_PER_MINUTE;

  // Real offsets lie between -12h and +14h, so the instant we are looking for
  // is less than a day from `wallMs` and these two samples bracket any
  // transition that could affect it.
  const offsetBefore = zoneOffsetMs(timeZone, wallMs - MS_PER_DAY);
  const offsetAfter = zoneOffsetMs(timeZone, wallMs + MS_PER_DAY);
  const withOffsetBefore = wallMs - offsetBefore;
  if (offsetBefore === offsetAfter) return withOffsetBefore;

  // A candidate is real only if the zone shows the requested wall time at it.
  const withOffsetAfter = wallMs - offsetAfter;
  const beforeIsReal = zoneOffsetMs(timeZone, withOffsetBefore) === offsetBefore;
  const afterIsReal = zoneOffsetMs(timeZone, withOffsetAfter) === offsetAfter;
  if (beforeIsReal && afterIsReal) return Math.min(withOffsetBefore, withOffsetAfter);
  if (beforeIsReal) return withOffsetBefore;
  if (afterIsReal) return withOffsetAfter;

  // The wall time was skipped. Reading it with the new offset lands before
  // the change and with the old offset lands after it, so the change itself
  // lies between the two.
  return findTransition(timeZone, withOffsetAfter, withOffsetBefore, offsetAfter);
}

/**
 * Converts a wall-clock date and time in `timeZone` to the instant (epoch
 * milliseconds) at which the zone's clocks show it. Exact across DST changes.
 *
 * Two wall times need a rule when the clocks change:
 * - A time that does NOT EXIST because the clocks jumped over it (01:30 on
 *   the spring-forward night in London) resolves to the instant of the jump,
 *   that is the first moment after the gap (02:00 BST in that example).
 * - A time that occurs TWICE because the clocks went back (01:30 on the
 *   autumn night in London) resolves to its FIRST occurrence.
 *
 * @param date     Calendar date in the zone.
 * @param time     Wall-clock time in the zone, `HH:mm`.
 * @param timeZone IANA zone name.
 * @throws RangeError for an invalid date, time or zone.
 */
export function zonedDateTimeToEpochMs(
  date: DateString,
  time: TimeString,
  timeZone: string,
): number {
  const key = `${timeZone}|${date}|${time}`;
  const cached = instantCache.get(key);
  if (cached !== undefined) return cached;
  const instant = resolveInstant(date, time, timeZone);
  if (instantCache.size >= INSTANT_CACHE_LIMIT) instantCache.clear();
  instantCache.set(key, instant);
  return instant;
}

/**
 * Zone names for the settings dropdown, `UTC` first and then alphabetical.
 * Uses the runtime's own list where it can enumerate one and a built-in list
 * of common zones otherwise. The list depends on the runtime, so build it in
 * one place (the server) rather than on both sides of a hydration boundary.
 */
export function listTimeZones(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : BUILT_IN_TIME_ZONES.filter((zone) => isValidTimeZone(zone));
  return [FALLBACK_TIME_ZONE].concat(supported.filter((zone) => zone !== FALLBACK_TIME_ZONE));
}
