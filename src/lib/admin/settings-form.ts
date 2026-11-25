/**
 * The state of the settings form. The form is sent to
 * `saveSettingsAction` as `FormData`, so the input names below are the
 * property paths that action reads (`tv.theme`, `jumuah.0.label`), and the
 * same names key the field errors that come back.
 */

import { MAX_JUMUAH_SLOTS } from "@/lib/db/schemas";
import { formatHijri, hijriFromDate } from "@/lib/time";
import type { DateString, SiteSettings, TimeFormat, TvTheme } from "@/lib/types";

/** The Hijri adjustments the settings accept, in days. */
export const HIJRI_ADJUSTMENTS = [-2, -1, 0, 1, 2] as const;

/** One of {@link HIJRI_ADJUSTMENTS}, as the value of its radio button. */
export type HijriAdjustmentValue = "-2" | "-1" | "0" | "1" | "2";

/** One row of the default Jumu'ah times. A row with both parts empty is not saved. */
export interface JumuahRowState {
  label: string;
  time: string;
}

/** Everything the settings form holds. Numbers stay text while they are being typed. */
export interface SettingsFormState {
  mosqueName: string;
  shortName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  mapUrl: string;
  donateUrl: string;
  timezone: string;
  timeFormat: TimeFormat;
  hijriAdjustment: HijriAdjustmentValue;
  hijriRollAtMaghrib: boolean;
  /** Always `MAX_JUMUAH_SLOTS` rows; unused ones are empty. */
  jumuah: JumuahRowState[];
  tvTheme: TvTheme;
  tvShowSeconds: boolean;
  tvShowSunrise: boolean;
  tvJamaatInProgressMinutes: string;
  tvAnnouncementSeconds: string;
}

/** The form field name of each scalar part of {@link SettingsFormState}. */
export const SETTINGS_FIELD_NAMES = {
  mosqueName: "mosqueName",
  shortName: "shortName",
  tagline: "tagline",
  address: "address",
  phone: "phone",
  email: "email",
  mapUrl: "mapUrl",
  donateUrl: "donateUrl",
  timezone: "timezone",
  timeFormat: "timeFormat",
  hijriAdjustment: "hijriAdjustment",
  hijriRollAtMaghrib: "hijriRollAtMaghrib",
  tvTheme: "tv.theme",
  tvShowSeconds: "tv.showSeconds",
  tvShowSunrise: "tv.showSunrise",
  tvJamaatInProgressMinutes: "tv.jamaatInProgressMinutes",
  tvAnnouncementSeconds: "tv.announcementSeconds",
} as const satisfies Partial<Record<keyof SettingsFormState, string>>;

/** The form field name of one part of a Jumu'ah row. */
export function jumuahFieldName(row: number, part: keyof JumuahRowState): string {
  return `jumuah.${row}.${part}`;
}

function toAdjustmentValue(adjustment: number): HijriAdjustmentValue {
  const clamped = Math.min(2, Math.max(-2, Math.round(adjustment)));
  return String(clamped) as HijriAdjustmentValue;
}

/** The form filled in from the stored settings. */
export function settingsToForm(settings: SiteSettings): SettingsFormState {
  return {
    mosqueName: settings.mosqueName,
    shortName: settings.shortName,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    mapUrl: settings.mapUrl,
    donateUrl: settings.donateUrl,
    timezone: settings.timezone,
    timeFormat: settings.timeFormat,
    hijriAdjustment: toAdjustmentValue(settings.hijriAdjustment),
    hijriRollAtMaghrib: settings.hijriRollAtMaghrib,
    jumuah: Array.from({ length: MAX_JUMUAH_SLOTS }, (_, index) => ({
      label: settings.jumuah[index]?.label ?? "",
      time: settings.jumuah[index]?.time ?? "",
    })),
    tvTheme: settings.tv.theme,
    tvShowSeconds: settings.tv.showSeconds,
    tvShowSunrise: settings.tv.showSunrise,
    tvJamaatInProgressMinutes: String(settings.tv.jamaatInProgressMinutes),
    tvAnnouncementSeconds: String(settings.tv.announcementSeconds),
  };
}

/** Whether two form states hold the same values: the test for "unsaved changes". */
export function settingsFormsEqual(a: SettingsFormState, b: SettingsFormState): boolean {
  const { jumuah: jumuahA, ...restA } = a;
  const { jumuah: jumuahB, ...restB } = b;
  const keys = Object.keys(restA) as Array<keyof typeof restA>;
  return (
    keys.every((key) => restA[key] === restB[key]) &&
    jumuahA.length === jumuahB.length &&
    jumuahA.every((row, index) => row.label === jumuahB[index].label && row.time === jumuahB[index].time)
  );
}

/** How an adjustment reads next to its radio button. */
export function adjustmentLabel(adjustment: number): string {
  if (adjustment === 0) return "No adjustment";
  const days = Math.abs(adjustment) === 1 ? "1 day" : `${Math.abs(adjustment)} days`;
  return adjustment < 0 ? `${days} earlier` : `${days} later`;
}

/** Today's Hijri date under one adjustment. */
export interface HijriPreview {
  value: HijriAdjustmentValue;
  label: string;
  /** E.g. `15 Jumada al-Thani 1448 AH`. */
  hijri: string;
}

/**
 * Today's Hijri date under each allowed adjustment, so the right one can be
 * picked by recognising the date rather than by counting days. Work this out
 * in one place (the server): the calendar data differs between runtimes.
 * @param today Today on the mosque's wall clock.
 */
export function hijriPreviews(today: DateString): HijriPreview[] {
  return HIJRI_ADJUSTMENTS.map((adjustment) => ({
    value: toAdjustmentValue(adjustment),
    label: adjustmentLabel(adjustment),
    hijri: formatHijri(hijriFromDate(today, adjustment)),
  }));
}

/** Field names of the form grouped by the section that shows them, for the error summary. */
export const SETTINGS_SECTIONS: ReadonlyArray<{ id: string; title: string; matches: (field: string) => boolean }> = [
  {
    id: "details",
    title: "Mosque details",
    matches: (field) =>
      ["mosqueName", "shortName", "tagline", "address", "phone", "email", "mapUrl", "donateUrl"].includes(field),
  },
  {
    id: "time",
    title: "Time and calendar",
    matches: (field) => ["timezone", "timeFormat", "hijriAdjustment", "hijriRollAtMaghrib"].includes(field),
  },
  { id: "jumuah", title: "Jumu'ah", matches: (field) => field === "jumuah" || field.startsWith("jumuah.") },
  { id: "tv", title: "TV display", matches: (field) => field === "tv" || field.startsWith("tv.") },
];

/** The titles of the sections that hold at least one of the given field errors, in form order. */
export function sectionsWithErrors(fieldErrors: Readonly<Record<string, string>> | undefined): string[] {
  if (fieldErrors === undefined) return [];
  const fields = Object.keys(fieldErrors);
  return SETTINGS_SECTIONS.filter((section) => fields.some(section.matches)).map((section) => section.title);
}
