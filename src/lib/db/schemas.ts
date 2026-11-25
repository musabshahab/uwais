/**
 * Validation schemas for everything that is written to the database or read
 * from a URL. The repositories parse their inputs with these, and Server
 * Actions reuse them to report field errors before calling a repository.
 *
 * This module only depends on zod and the time engine, so it is also safe to
 * import from client code (for example to validate a form before submitting).
 */

import { z } from "zod";
import {
  MAX_LISTED_DATES,
  compareTimes,
  diffDays,
  isValidDateString,
  isValidMonthString,
  isValidTimeString,
  isValidTimeZone,
} from "@/lib/time";
import {
  TIME_FIELDS,
  type Announcement,
  type DateString,
  type JumuahSlot,
  type SiteSettings,
  type TimeField,
} from "@/lib/types";

/** Most Jumu'ah congregations one day (or the default settings) can list. */
export const MAX_JUMUAH_SLOTS = 4;

/** Longest note a timetable day can carry. */
export const MAX_DAY_NOTE_LENGTH = 120;

/** Most days one upsert accepts: ten years, far beyond any real timetable file. */
export const MAX_UPSERT_DAYS = MAX_LISTED_DATES;

/** Longest announcement title. */
export const MAX_ANNOUNCEMENT_TITLE_LENGTH = 120;

/** Longest announcement body. */
export const MAX_ANNOUNCEMENT_BODY_LENGTH = 600;

/** Most rows `listImportLog` returns in one call. */
export const MAX_IMPORT_LOG_LIMIT = 200;

/** Longest date range the public timetable API serves in one request. */
export const MAX_TIMETABLE_RANGE_DAYS = 400;

/**
 * The three formats below stop validation when they fail (`abort`). Without
 * it zod would go on to run the checks of the enclosing object, and those
 * do date arithmetic that throws on a value that is not a date.
 */

/** A real calendar date written `YYYY-MM-DD`. */
export const dateStringSchema = z
  .string()
  .refine(isValidDateString, { error: "Enter a date as YYYY-MM-DD", abort: true });

/** A calendar month written `YYYY-MM`. */
export const monthStringSchema = z
  .string()
  .refine(isValidMonthString, { error: "Enter a month as YYYY-MM", abort: true });

/** A 24-hour wall-clock time written `HH:mm`. */
export const timeStringSchema = z
  .string()
  .refine(isValidTimeString, { error: "Enter a time as HH:mm (24-hour)", abort: true });

/**
 * Wraps a string format so that a blank form field counts as "no value":
 * the result accepts the format, `""` and `null`, and yields the value or `null`.
 */
function blankable<T extends z.ZodType<string, string>>(schema: T) {
  return z.union([z.literal("").transform(() => null), schema]).nullable();
}

/** An optional time: `null`, a missing key and a blank string all mean "no time". */
const optionalTimeSchema = blankable(timeStringSchema)
  .optional()
  .transform((value) => value ?? null);

/** An optional date: `null`, a missing key and a blank string all mean "no date". */
const optionalDateSchema = blankable(dateStringSchema)
  .optional()
  .transform((value) => value ?? null);

/** Sorts times ascending and drops repeats, so equal lists always compare equal. */
function normaliseTimes(times: readonly string[]): string[] {
  const unique = times.filter((time, index) => times.indexOf(time) === index);
  return unique.sort(compareTimes);
}

/** The Jumu'ah times of one specific day, earliest first. */
const dayJumuahSchema = z
  .array(timeStringSchema)
  .max(MAX_JUMUAH_SLOTS, `A day can have at most ${MAX_JUMUAH_SLOTS} Jumu'ah times`)
  .default([])
  .transform(normaliseTimes);

/** A short note for a day; blank becomes `null`. */
const dayNoteSchema = z
  .string()
  .trim()
  .max(MAX_DAY_NOTE_LENGTH, `Keep the note under ${MAX_DAY_NOTE_LENGTH} characters`)
  .nullish()
  .transform((value) => (value ? value : null));

const timeFieldShape = Object.fromEntries(
  TIME_FIELDS.map((field) => [field, optionalTimeSchema]),
) as Record<TimeField, typeof optionalTimeSchema>;

/**
 * One day of the timetable. Missing or blank times become `null`, Jumu'ah
 * times are sorted and de-duplicated, and unknown keys are dropped.
 */
export const prayerDaySchema = z.object({
  date: dateStringSchema,
  ...timeFieldShape,
  jumuah: dayJumuahSchema,
  note: dayNoteSchema,
});

/** What `upsertPrayerDays` accepts for one day: only `date` is required. */
export type PrayerDayInput = z.input<typeof prayerDaySchema>;

/** A batch of timetable days for one upsert. */
export const prayerDaysSchema = z
  .array(prayerDaySchema)
  .max(MAX_UPSERT_DAYS, `A single import can hold at most ${MAX_UPSERT_DAYS} days`);

/** How an upsert treats a day that already exists. See `upsertPrayerDays`. */
export const upsertModeSchema = z.enum(["merge", "replace"]);

/** How an upsert treats a day that already exists. */
export type UpsertMode = z.infer<typeof upsertModeSchema>;

/** An inclusive date range whose end is not before its start. */
export const dateRangeSchema = z
  .object({ from: dateStringSchema, to: dateStringSchema })
  .refine((range) => range.from <= range.to, {
    message: "The end date must not be before the start date",
    path: ["to"],
  });

/** An inclusive range of dates. */
export interface DateRange {
  from: DateString;
  to: DateString;
}

/**
 * A date range short enough to enumerate day by day.
 * @param maxDays Largest number of days the range may hold, both ends included.
 */
export function boundedDateRangeSchema(maxDays: number) {
  return dateRangeSchema.refine((range) => diffDays(range.from, range.to) + 1 <= maxDays, {
    message: `The date range can cover at most ${maxDays} days`,
    path: ["to"],
  });
}

/** An absolute `http:` or `https:` URL. Other schemes (`javascript:`, `data:`) are refused. */
function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
}

/** A link field: empty, or an absolute http(s) URL. */
const optionalUrlSchema = z
  .string()
  .trim()
  .max(500, "Keep the link under 500 characters")
  .refine((value) => value === "" || isHttpUrl(value), "Enter a full link starting with https://");

/** An email field: empty, or a valid address. */
const optionalEmailSchema = z
  .string()
  .trim()
  .max(254, "Keep the email address under 254 characters")
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email address",
  );

/** A phone field: empty, or digits with the usual separators. */
const optionalPhoneSchema = z
  .string()
  .trim()
  .max(40, "Keep the phone number under 40 characters")
  .regex(/^[0-9+()\-. ]*$/, "Use digits, spaces and + ( ) - . only");

/** A default Jumu'ah slot from the settings. */
export const jumuahSlotSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give the Jumu'ah a label")
    .max(40, "Keep the label under 40 characters"),
  time: timeStringSchema,
}) satisfies z.ZodType<JumuahSlot>;

/** Settings of the TV display. */
export const tvSettingsSchema = z.object({
  theme: z.enum(["night", "day"]),
  showSeconds: z.boolean(),
  showSunrise: z.boolean(),
  jamaatInProgressMinutes: z
    .number()
    .int("Enter a whole number of minutes")
    .min(0, "Enter 0 to 60 minutes")
    .max(60, "Enter 0 to 60 minutes"),
  announcementSeconds: z
    .number()
    .int("Enter a whole number of seconds")
    .min(5, "Enter 5 to 120 seconds")
    .max(120, "Enter 5 to 120 seconds"),
}) satisfies z.ZodType<SiteSettings["tv"]>;

/** The complete site settings, with the limits the admin form enforces. */
export const siteSettingsSchema = z.object({
  mosqueName: z
    .string()
    .trim()
    .min(1, "Enter the name of the mosque")
    .max(80, "Keep the name under 80 characters"),
  shortName: z
    .string()
    .trim()
    .min(1, "Enter a short name")
    .max(12, "Keep the short name to 12 characters"),
  tagline: z.string().trim().max(140, "Keep the tagline under 140 characters"),
  address: z.string().trim().max(200, "Keep the address under 200 characters"),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  mapUrl: optionalUrlSchema,
  donateUrl: optionalUrlSchema,
  timezone: z.string().refine(isValidTimeZone, "Choose a timezone such as Europe/London"),
  timeFormat: z.enum(["12h", "24h"]),
  hijriAdjustment: z
    .number()
    .int("Enter a whole number of days")
    .min(-2, "Enter -2 to 2 days")
    .max(2, "Enter -2 to 2 days"),
  hijriRollAtMaghrib: z.boolean(),
  jumuah: z
    .array(jumuahSlotSchema)
    .max(MAX_JUMUAH_SLOTS, `List at most ${MAX_JUMUAH_SLOTS} Jumu'ah times`),
  tv: tvSettingsSchema,
}) satisfies z.ZodType<SiteSettings>;

/**
 * A partial update of the settings: any subset of the fields, and any subset
 * of the TV fields. Everything supplied is validated; nothing else changes.
 */
export const siteSettingsPatchSchema = siteSettingsSchema
  .omit({ tv: true })
  .partial()
  .extend({ tv: tvSettingsSchema.partial().optional() });

/** A partial update of the settings. */
export type SiteSettingsPatch = z.infer<typeof siteSettingsPatchSchema>;

const announcementTitleSchema = z
  .string()
  .trim()
  .min(1, "Enter a title")
  .max(
    MAX_ANNOUNCEMENT_TITLE_LENGTH,
    `Keep the title under ${MAX_ANNOUNCEMENT_TITLE_LENGTH} characters`,
  );

const announcementBodySchema = z
  .string()
  .trim()
  .max(
    MAX_ANNOUNCEMENT_BODY_LENGTH,
    `Keep the text under ${MAX_ANNOUNCEMENT_BODY_LENGTH} characters`,
  );

/** The editable part of an announcement, as stored. */
export type AnnouncementFields = Pick<
  Announcement,
  "title" | "body" | "startsOn" | "endsOn" | "showOnSite" | "showOnTv" | "pinned"
>;

/** Whether an announcement's last day is not before its first. Open ends always pass. */
function datesInOrder(value: { startsOn?: string | null; endsOn?: string | null }): boolean {
  return !value.startsOn || !value.endsOn || value.startsOn <= value.endsOn;
}

const DATES_OUT_OF_ORDER = {
  message: "The last day must not be before the first day",
  path: ["endsOn"],
};

/**
 * A new announcement. Only the title is required: the body defaults to empty,
 * the dates to "no limit", and it is shown on the site and the TV, unpinned.
 */
export const announcementInputSchema = z
  .object({
    title: announcementTitleSchema,
    body: announcementBodySchema.default(""),
    startsOn: optionalDateSchema,
    endsOn: optionalDateSchema,
    showOnSite: z.boolean().default(true),
    showOnTv: z.boolean().default(true),
    pinned: z.boolean().default(false),
  })
  .refine(datesInOrder, DATES_OUT_OF_ORDER);

/** What `createAnnouncement` accepts. */
export type AnnouncementInput = z.input<typeof announcementInputSchema>;

/**
 * A partial update of an announcement. Fields that are left out keep their
 * stored value (no defaults apply). The order of the dates is checked again
 * against the stored row by `updateAnnouncement`.
 */
export const announcementPatchSchema = z
  .object({
    title: announcementTitleSchema.optional(),
    body: announcementBodySchema.optional(),
    startsOn: blankable(dateStringSchema).optional(),
    endsOn: blankable(dateStringSchema).optional(),
    showOnSite: z.boolean().optional(),
    showOnTv: z.boolean().optional(),
    pinned: z.boolean().optional(),
  })
  .refine(datesInOrder, DATES_OUT_OF_ORDER);

/** What `updateAnnouncement` accepts. */
export type AnnouncementPatch = z.infer<typeof announcementPatchSchema>;

/** The id of a stored row. */
export const rowIdSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

/** Which screen an announcement query is for; `any` means the site or the TV. */
export const announcementAudienceSchema = z.enum(["site", "tv", "any"]);

/** Which screen an announcement query is for. */
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;

/** The filter of `listActiveAnnouncements`. */
export const activeAnnouncementsQuerySchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
    audience: announcementAudienceSchema.default("any"),
  })
  .refine((query) => query.from <= query.to, {
    message: "The end date must not be before the start date",
    path: ["to"],
  });

/** What `listActiveAnnouncements` accepts. */
export type ActiveAnnouncementsQuery = z.input<typeof activeAnnouncementsQuerySchema>;

/** Keeps the last path segment, so a browser-supplied path never reaches the log. */
function baseName(fileName: string): string {
  const segments = fileName.split(/[\\/]/);
  return segments[segments.length - 1];
}

const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** One finished import, as recorded in the import log. */
export const importLogInputSchema = z.object({
  fileName: z
    .string()
    .transform((name) => baseName(name).trim().slice(0, 255))
    .refine((name) => name !== "", "A file name is required"),
  added: countSchema,
  updated: countSchema,
  unchanged: countSchema,
  firstDate: optionalDateSchema,
  lastDate: optionalDateSchema,
  warnings: countSchema.default(0),
});

/** What `addImportLog` accepts. */
export type ImportLogInput = z.input<typeof importLogInputSchema>;

/** How many import log rows to list. */
export const importLogLimitSchema = z.number().int().min(1).max(MAX_IMPORT_LOG_LIMIT);
