/**
 * Shared domain types. This file is the contract between the timetable
 * importer, the database layer, the JSON API and every screen (site, TV,
 * admin). It must stay free of runtime dependencies so it can be imported
 * from both server and client code.
 */

/** A wall-clock time in the mosque's timezone, 24-hour `HH:mm` (e.g. `05:42`, `18:07`). */
export type TimeString = string;

/** A calendar date `YYYY-MM-DD` in the mosque's timezone. */
export type DateString = string;

/** The five daily prayers, in order. */
export const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];

/**
 * Every time column a timetable row can carry, in the order they occur
 * during the day.
 */
export const TIME_FIELDS = [
  "fajrBegins",
  "fajrJamaat",
  "sunrise",
  "dhuhrBegins",
  "dhuhrJamaat",
  "asrBegins",
  "asrJamaat",
  "maghribBegins",
  "maghribJamaat",
  "ishaBegins",
  "ishaJamaat",
] as const;
export type TimeField = (typeof TIME_FIELDS)[number];

/**
 * One day of the timetable. Every time is optional because mosques publish
 * different subsets (some only jamaat times, some only beginning times).
 */
export interface PrayerDay {
  date: DateString;
  fajrBegins: TimeString | null;
  fajrJamaat: TimeString | null;
  sunrise: TimeString | null;
  dhuhrBegins: TimeString | null;
  dhuhrJamaat: TimeString | null;
  asrBegins: TimeString | null;
  asrJamaat: TimeString | null;
  maghribBegins: TimeString | null;
  maghribJamaat: TimeString | null;
  ishaBegins: TimeString | null;
  ishaJamaat: TimeString | null;
  /**
   * Jumu'ah times for this specific day (normally only set on Fridays).
   * Empty means "use the default Jumu'ah times from the settings".
   */
  jumuah: TimeString[];
  /** Optional short note for the day, e.g. "Eid al-Fitr" or "Clocks go back". */
  note: string | null;
}

export interface PrayerMeta {
  key: PrayerKey;
  /** English name shown in the UI. */
  name: string;
  /** Arabic name shown alongside. */
  arabic: string;
  beginsField: TimeField;
  jamaatField: TimeField;
}

export const PRAYERS: readonly PrayerMeta[] = [
  { key: "fajr", name: "Fajr", arabic: "الفجر", beginsField: "fajrBegins", jamaatField: "fajrJamaat" },
  { key: "dhuhr", name: "Dhuhr", arabic: "الظهر", beginsField: "dhuhrBegins", jamaatField: "dhuhrJamaat" },
  { key: "asr", name: "Asr", arabic: "العصر", beginsField: "asrBegins", jamaatField: "asrJamaat" },
  { key: "maghrib", name: "Maghrib", arabic: "المغرب", beginsField: "maghribBegins", jamaatField: "maghribJamaat" },
  { key: "isha", name: "Isha", arabic: "العشاء", beginsField: "ishaBegins", jamaatField: "ishaJamaat" },
] as const;

export const SUNRISE_LABEL = { name: "Sunrise", arabic: "الشروق" } as const;
export const JUMUAH_LABEL = { name: "Jumu'ah", arabic: "الجمعة" } as const;

/** A default Jumu'ah slot configured in the settings. */
export interface JumuahSlot {
  /** e.g. "1st Jumu'ah", "Khutbah". */
  label: string;
  time: TimeString;
}

export type TimeFormat = "12h" | "24h";
export type TvTheme = "night" | "day";

/**
 * Site-wide settings, edited in the admin area. Everything in here is public
 * information that is safe to send to browsers. Secrets (admin password,
 * session secret) live in environment variables, never in settings.
 */
export interface SiteSettings {
  mosqueName: string;
  /** Short name for the installed app icon (max ~12 characters). */
  shortName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  /** Link to a map / directions page. */
  mapUrl: string;
  /** Optional donation link shown on the site. */
  donateUrl: string;
  /** IANA timezone of the mosque, e.g. `Europe/London`. All times are in this zone. */
  timezone: string;
  timeFormat: TimeFormat;
  /** Days to add to the calculated Hijri date (-2..2) to match local moon sighting. */
  hijriAdjustment: number;
  /** When true the Hijri date advances at Maghrib rather than at midnight. */
  hijriRollAtMaghrib: boolean;
  /** Default Jumu'ah times, used when a Friday row has none of its own. */
  jumuah: JumuahSlot[];
  tv: {
    theme: TvTheme;
    /** Show seconds on the TV clock. */
    showSeconds: boolean;
    /** Show the sunrise row on the TV. */
    showSunrise: boolean;
    /**
     * Minutes to show the "jamaat in progress, please silence your phone"
     * screen after each jamaat time. 0 turns it off.
     */
    jamaatInProgressMinutes: number;
    /** Seconds each announcement stays on the TV before rotating. */
    announcementSeconds: number;
  };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  mosqueName: "Masjid Uwais",
  shortName: "Uwais",
  tagline: "Prayer times and community updates",
  address: "",
  phone: "",
  email: "",
  mapUrl: "",
  donateUrl: "",
  timezone: "Europe/London",
  timeFormat: "12h",
  hijriAdjustment: 0,
  hijriRollAtMaghrib: true,
  jumuah: [{ label: "Jumu'ah", time: "13:15" }],
  tv: {
    theme: "night",
    showSeconds: true,
    showSunrise: true,
    jamaatInProgressMinutes: 10,
    announcementSeconds: 12,
  },
};

export interface Announcement {
  id: number;
  title: string;
  body: string;
  /** First day (inclusive) the announcement is shown; null = immediately. */
  startsOn: DateString | null;
  /** Last day (inclusive) the announcement is shown; null = until removed. */
  endsOn: DateString | null;
  showOnSite: boolean;
  showOnTv: boolean;
  /** Pinned announcements sort first. */
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** First and last date present in the timetable, or nulls when it is empty. */
export interface TimetableCoverage {
  firstDate: DateString | null;
  lastDate: DateString | null;
  totalDays: number;
}

/**
 * Everything the public site and the TV display need to render and keep
 * running, returned by `GET /api/display` and embedded in the server-rendered
 * pages. The window of days is long enough for the installed app and the TV
 * to keep working for weeks without a connection.
 */
export interface DisplayPayload {
  /** Build id of the server that produced this payload. */
  version: string;
  /** Server clock at generation time, epoch milliseconds (for clock-drift correction). */
  serverNow: number;
  settings: SiteSettings;
  /** Timetable rows sorted by date ascending: from yesterday to several weeks ahead. */
  days: PrayerDay[];
  /** Announcements that are active now or become active within the window. */
  announcements: Announcement[];
  coverage: TimetableCoverage;
}

/** Number of days after today included in a DisplayPayload. */
export const DISPLAY_WINDOW_DAYS_AHEAD = 35;
/** Number of days before today included in a DisplayPayload. */
export const DISPLAY_WINDOW_DAYS_BEHIND = 1;
