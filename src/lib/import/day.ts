/**
 * Small constructors for timetable days, shared by the parser, the merge
 * logic and the template builder. Pure and safe to use in the browser.
 */

import { isLeapYear, toDateString, addDays } from "@/lib/time/dates";
import type { DateString, PrayerDay } from "@/lib/types";

/** A day with no times, no Jumu'ah times of its own and no note. */
export function blankDay(date: DateString): PrayerDay {
  return {
    date,
    fajrBegins: null,
    fajrJamaat: null,
    sunrise: null,
    dhuhrBegins: null,
    dhuhrJamaat: null,
    asrBegins: null,
    asrJamaat: null,
    maghribBegins: null,
    maghribJamaat: null,
    ishaBegins: null,
    ishaJamaat: null,
    jumuah: [],
    note: null,
  };
}

/**
 * Every day of a calendar year, 1 January to 31 December, without times.
 * @throws RangeError when the year is not an integer from 1 to 9999.
 */
export function blankYear(year: number): PrayerDay[] {
  const first = toDateString(year, 1, 1);
  const count = isLeapYear(year) ? 366 : 365;
  const days: PrayerDay[] = [];
  for (let offset = 0; offset < count; offset++) days.push(blankDay(addDays(first, offset)));
  return days;
}

/** Orders days by date, earliest first. Suitable as an `Array.prototype.sort` comparator. */
export function byDate(a: PrayerDay, b: PrayerDay): number {
  if (a.date === b.date) return 0;
  return a.date < b.date ? -1 : 1;
}
