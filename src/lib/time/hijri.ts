/**
 * Hijri (Islamic) calendar dates.
 *
 * The primary source is the Umm al-Qura calendar built into `Intl`. Runtimes
 * without it (very old TV browsers) fall back to the arithmetic "tabular"
 * Islamic calendar, which never needs data tables and stays within a day or
 * two of Umm al-Qura. Mosques that follow local moon sighting correct either
 * source with the `hijriAdjustment` setting.
 */

import type { DateString, TimeString } from "@/lib/types";
import { MS_PER_DAY, addDays, isValidTimeString, parseTimeToMinutes, toEpochDay } from "./dates";

/** A date in the Hijri calendar. Instances are frozen and may be shared. */
export interface HijriDate {
  /** Day of the month, 1 to 30. */
  readonly day: number;
  /** 1 = Muharram .. 12 = Dhu al-Hijjah. */
  readonly month: number;
  /** Hijri year (AH). */
  readonly year: number;
  /** English transliteration of the month, e.g. `Ramadan`. */
  readonly monthName: string;
  /** Arabic name of the month, e.g. `رمضان`. */
  readonly monthNameArabic: string;
}

/** What `hijriForMoment` needs to know about the present moment. */
export interface HijriMomentInput {
  /** Today's civil date in the mosque's timezone. */
  date: DateString;
  /** Minutes since the mosque's midnight. */
  minutesOfDay: number;
  /** Today's Maghrib start time, or null when the timetable does not have it. */
  maghribTime: TimeString | null;
  /** Whether the Hijri day starts at Maghrib (true) or at midnight (false). */
  rollAtMaghrib: boolean;
  /** Days to add to the calculated date to match local moon sighting. */
  adjustmentDays: number;
}

/** English transliterations of the twelve Hijri months, Muharram first. */
export const HIJRI_MONTH_NAMES: readonly string[] = [
  "Muharram",
  "Safar",
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  "Jumada al-Awwal",
  "Jumada al-Thani",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qi'dah",
  "Dhu al-Hijjah",
];

/** Arabic names of the twelve Hijri months, Muharram first. */
export const HIJRI_MONTH_NAMES_ARABIC: readonly string[] = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

const RAMADAN = 9;

/**
 * Day number (days since 1970-01-01) of 1 Muharram 1 AH in the civil
 * reckoning: Friday 16 July 622 in the Julian calendar.
 */
const HIJRI_EPOCH_DAY = -492148;

const UMM_AL_QURA_LOCALE = "en-u-ca-islamic-umalqura-nu-latn";
const UMM_AL_QURA_CALENDAR = "islamic-umalqura";

const CACHE_LIMIT = 128;

/** Conversions already made, keyed by civil date; the TV asks for the same day every second. */
const cache = new Map<DateString, HijriDate>();

/** Undefined until the runtime has been probed, then the formatter or null when unsupported. */
let ummAlQuraFormatter: Intl.DateTimeFormat | null | undefined;

function makeHijriDate(year: number, month: number, day: number): HijriDate {
  return Object.freeze({
    day,
    month,
    year,
    monthName: HIJRI_MONTH_NAMES[month - 1],
    monthNameArabic: HIJRI_MONTH_NAMES_ARABIC[month - 1],
  });
}

/** Coerces the setting to a whole number of days; anything unusable counts as zero. */
function normaliseAdjustment(adjustmentDays: number): number {
  return Number.isFinite(adjustmentDays) ? Math.round(adjustmentDays) : 0;
}

/**
 * Day number of a tabular Hijri date. Years have 354 days, or 355 in years
 * 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 and 29 of each 30-year cycle; months
 * alternate between 30 and 29 days.
 */
function tabularToEpochDay(year: number, month: number, day: number): number {
  return (
    HIJRI_EPOCH_DAY -
    1 +
    (year - 1) * 354 +
    Math.floor((3 + 11 * year) / 30) +
    29 * (month - 1) +
    Math.floor(month / 2) +
    day
  );
}

/** Tabular Hijri date for a day number. */
function tabularFromEpochDay(epochDay: number): HijriDate {
  const year = Math.floor((30 * (epochDay - HIJRI_EPOCH_DAY) + 10646) / 10631);
  const daysIntoYear = epochDay - tabularToEpochDay(year, 1, 1);
  const month = Math.floor((11 * daysIntoYear + 330) / 325);
  const day = epochDay - tabularToEpochDay(year, month, 1) + 1;
  return makeHijriDate(year, month, day);
}

/** The Umm al-Qura formatter, or null when the runtime does not have that calendar. */
function getUmmAlQuraFormatter(): Intl.DateTimeFormat | null {
  if (ummAlQuraFormatter === undefined) {
    try {
      const formatter = new Intl.DateTimeFormat(UMM_AL_QURA_LOCALE, {
        timeZone: "UTC",
        day: "numeric",
        month: "numeric",
        year: "numeric",
      });
      // A runtime without the calendar silently formats Gregorian dates instead.
      ummAlQuraFormatter =
        formatter.resolvedOptions().calendar === UMM_AL_QURA_CALENDAR ? formatter : null;
    } catch {
      ummAlQuraFormatter = null;
    }
  }
  return ummAlQuraFormatter;
}

/** Umm al-Qura date for a day number, or null when the runtime cannot provide a believable one. */
function ummAlQuraFromEpochDay(epochDay: number): HijriDate | null {
  const formatter = getUmmAlQuraFormatter();
  if (!formatter) return null;
  let year = NaN;
  let month = NaN;
  let day = NaN;
  const parts = formatter.formatToParts(new Date(epochDay * MS_PER_DAY));
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.type === "year") year = Number(part.value);
    else if (part.type === "month") month = Number(part.value);
    else if (part.type === "day") day = Number(part.value);
  }
  // Guards against engines that claim the calendar but print something else
  // (Gregorian numbers, month names): the two calendars never drift apart by
  // more than a couple of days, so the years can differ by one at most.
  const plausible =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 30 &&
    Math.abs(year - tabularFromEpochDay(epochDay).year) <= 1;
  return plausible ? makeHijriDate(year, month, day) : null;
}

/**
 * Hijri date of a civil date in the arithmetic tabular Islamic calendar
 * (civil epoch, 30-year leap cycle). This is the fallback for runtimes
 * without Umm al-Qura; it is exported so screens and tests can use it
 * directly. Compared with Umm al-Qura its months start on the same day or
 * one day apart, and occasionally two days apart.
 * @param adjustmentDays Days to add to the result to match local moon sighting.
 * @throws RangeError when `date` is not a valid date.
 */
export function hijriFromDateTabular(date: DateString, adjustmentDays: number = 0): HijriDate {
  return tabularFromEpochDay(toEpochDay(date) + normaliseAdjustment(adjustmentDays));
}

/**
 * Hijri date of a civil date in the Umm al-Qura calendar, or null when the
 * runtime's `Intl` does not provide that calendar.
 * @param adjustmentDays Days to add to the result to match local moon sighting.
 * @throws RangeError when `date` is not a valid date.
 */
export function hijriFromDateUmmAlQura(
  date: DateString,
  adjustmentDays: number = 0,
): HijriDate | null {
  return ummAlQuraFromEpochDay(toEpochDay(date) + normaliseAdjustment(adjustmentDays));
}

/**
 * Hijri date of a civil date (the Hijri day that is current during the
 * daytime of that date). Uses Umm al-Qura where the runtime has it and the
 * tabular calendar otherwise.
 * @param adjustmentDays Days to add to the result to match local moon
 *        sighting (the `hijriAdjustment` setting); +1 gives the date the
 *        calendar would show tomorrow.
 * @throws RangeError when `date` is not a valid date.
 */
export function hijriFromDate(date: DateString, adjustmentDays: number = 0): HijriDate {
  const adjustment = normaliseAdjustment(adjustmentDays);
  const key = adjustment === 0 ? date : addDays(date, adjustment);
  const cached = cache.get(key);
  if (cached) return cached;
  const epochDay = toEpochDay(key);
  const hijri = ummAlQuraFromEpochDay(epochDay) ?? tabularFromEpochDay(epochDay);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, hijri);
  return hijri;
}

/**
 * The Hijri date that applies at a given moment. In the Islamic reckoning the
 * day begins at sunset, so with `rollAtMaghrib` the date moves on as soon as
 * today's Maghrib begins; without it, or when the Maghrib time is unknown,
 * the date changes at midnight with the civil date.
 * @throws RangeError when `date` is not a valid date.
 */
export function hijriForMoment(input: HijriMomentInput): HijriDate {
  const afterMaghrib =
    input.rollAtMaghrib &&
    isValidTimeString(input.maghribTime) &&
    input.minutesOfDay >= parseTimeToMinutes(input.maghribTime);
  return hijriFromDate(afterMaghrib ? addDays(input.date, 1) : input.date, input.adjustmentDays);
}

/** Formats a Hijri date for display, e.g. `14 Jumada al-Awwal 1448 AH`. */
export function formatHijri(hijri: HijriDate): string {
  return `${hijri.day} ${hijri.monthName} ${hijri.year} AH`;
}

/** Whether the Hijri date falls in Ramadan, the month of fasting. */
export function isRamadan(hijri: HijriDate): boolean {
  return hijri.month === RAMADAN;
}
