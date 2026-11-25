/**
 * Fixtures for the unit tests of the TV display: a small winter timetable
 * and the schedule the time engine derives from it at a given instant.
 * Imported by the tests in this folder only; nothing that ships uses it.
 */

import { toSchedule, type PrayerSchedule } from "@/lib/client/prayer-view";
import { computePrayerState, type PrayerState } from "@/lib/time";
import { DEFAULT_SETTINGS, type Announcement, type PrayerDay, type SiteSettings } from "@/lib/types";

/** A timetable row with every time filled in, for the given date. */
export function makeDay(date: string, overrides: Partial<PrayerDay> = {}): PrayerDay {
  return {
    date,
    fajrBegins: "05:40",
    fajrJamaat: "06:15",
    sunrise: "07:30",
    dhuhrBegins: "11:55",
    dhuhrJamaat: "12:30",
    asrBegins: "14:05",
    asrJamaat: "14:30",
    maghribBegins: "16:02",
    maghribJamaat: "16:07",
    ishaBegins: "17:45",
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

/** Tuesday 24 to Saturday 28 November 2026; Asr jamaat moves on the Thursday. */
export function makeWeek(): PrayerDay[] {
  return [
    makeDay("2026-11-24"),
    makeDay("2026-11-25"),
    makeDay("2026-11-26", { asrJamaat: "14:15" }),
    makeDay("2026-11-27", { asrJamaat: "14:15" }),
    makeDay("2026-11-28", { asrJamaat: "14:15" }),
  ];
}

/** The default settings as a fresh object, with optional changes to the TV part. */
export function makeSettings(
  overrides: Partial<SiteSettings> = {},
  tv: Partial<SiteSettings["tv"]> = {},
): SiteSettings {
  return {
    ...DEFAULT_SETTINGS,
    jumuah: [...DEFAULT_SETTINGS.jumuah],
    ...overrides,
    tv: { ...DEFAULT_SETTINGS.tv, ...tv },
  };
}

/**
 * An instant on a November 2026 day in London, which is on UTC in winter.
 * @param day Day of the month.
 * @param time Wall-clock time, `HH:mm` or `HH:mm:ss`.
 */
export function londonMs(day: number, time: string): number {
  const [hour, minute, second = 0] = time.split(":").map(Number);
  return Date.UTC(2026, 10, day, hour, minute, second);
}

/** The prayer state of the sample week at an instant. */
export function stateAt(
  nowMs: number,
  days: readonly PrayerDay[] = makeWeek(),
  settings: SiteSettings = makeSettings(),
): PrayerState {
  return computePrayerState({ days, settings, nowMs });
}

/** The schedule of the sample week at an instant. */
export function scheduleAt(
  nowMs: number,
  days: readonly PrayerDay[] = makeWeek(),
  settings: SiteSettings = makeSettings(),
): PrayerSchedule {
  return toSchedule(stateAt(nowMs, days, settings));
}

/** An announcement shown on the TV, with optional changes. */
export function makeAnnouncement(id: number, overrides: Partial<Announcement> = {}): Announcement {
  return {
    id,
    title: `Announcement ${id}`,
    body: "",
    startsOn: null,
    endsOn: null,
    showOnSite: true,
    showOnTv: true,
    pinned: false,
    createdAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:00.000Z",
    ...overrides,
  };
}
