/**
 * Saving the site settings, without the Server Action wrapping.
 *
 * Two kinds of input are understood:
 *
 * - A plain object is a partial update: any subset of the settings (and any
 *   subset of `tv`). What is left out keeps its stored value.
 * - A `FormData` is the complete settings form. Its field names are the
 *   property paths of `SiteSettings` joined with dots (`mosqueName`,
 *   `tv.theme`, `jumuah.0.label`, `jumuah.0.time`), which are also the keys
 *   of the field errors that come back. An unticked checkbox is `false` and
 *   a form without Jumu'ah rows means "no default Jumu'ah times", as a
 *   browser would submit them. Any other field that is missing is an error
 *   rather than a silent reset, so a form that shows only some of the
 *   settings must send an object instead.
 */

import { saveSettings, siteSettingsPatchSchema, siteSettingsSchema } from "@/lib/db";
import type { JumuahSlot } from "@/lib/types";
import type { SaveSettingsResult } from "../types";
import { isFormData, readFlag, readNumber, readText, readTrimmed } from "./form";
import { validationFailure, type FieldLabels } from "./result";

const SETTINGS_LABELS: FieldLabels = {
  mosqueName: "Mosque name",
  shortName: "Short name",
  tagline: "Tagline",
  address: "Address",
  phone: "Phone number",
  email: "Email address",
  mapUrl: "Map link",
  donateUrl: "Donation link",
  timezone: "Timezone",
  timeFormat: "Time format",
  hijriAdjustment: "Hijri date adjustment",
  jumuah: "Jumu'ah times",
  tv: "TV display",
  "tv.theme": "TV theme",
  "tv.jamaatInProgressMinutes": "Jamaat in progress screen",
  "tv.announcementSeconds": "Time per announcement",
};

const MISSING = "This field was not sent with the form.";
const NUMBER_BLANK = "Enter a number.";
const NUMBER_INVALID = "Enter a number using digits only.";

/** Matches the Jumu'ah row fields: `jumuah.<row>.label` and `jumuah.<row>.time`. */
const JUMUAH_FIELD = /^jumuah\.(\d{1,3})\.(label|time)$/;

/** The settings form as read from `FormData`, before it meets the schema. */
interface SettingsForm {
  /** Shaped like `SiteSettings`; fields that could not be read are undefined. */
  candidate: Record<string, unknown>;
  /** Problems found while reading: missing fields and numbers that are not numbers. */
  fieldErrors: Record<string, string>;
  /** Row number in the form of each Jumu'ah slot in `candidate.jumuah`. */
  jumuahRows: number[];
}

/**
 * Collects the Jumu'ah rows of the form in row order. A row with neither a
 * label nor a time is the empty row a form keeps for adding the next slot,
 * and is skipped.
 */
function readJumuahRows(formData: FormData): { slots: JumuahSlot[]; rows: number[] } {
  const found = new Set<number>();
  for (const name of Array.from(formData.keys())) {
    const match = JUMUAH_FIELD.exec(name);
    if (match) found.add(Number(match[1]));
  }
  const slots: JumuahSlot[] = [];
  const rows: number[] = [];
  for (const row of Array.from(found).sort((a, b) => a - b)) {
    const label = readTrimmed(formData, `jumuah.${row}.label`);
    const time = readTrimmed(formData, `jumuah.${row}.time`);
    if (label === "" && time === "") continue;
    slots.push({ label, time });
    rows.push(row);
  }
  return { slots, rows };
}

/** Reads the complete settings form. Never throws; what cannot be read becomes a field error. */
function readSettingsForm(formData: FormData): SettingsForm {
  const fieldErrors: Record<string, string> = {};
  const text = (name: string): string | undefined => {
    const value = readText(formData, name);
    if (value === null) fieldErrors[name] = MISSING;
    return value ?? undefined;
  };
  const number = (name: string): number | undefined => {
    const field = readNumber(formData, name);
    if (field.kind === "number") return field.value;
    fieldErrors[name] = field.kind === "blank" ? NUMBER_BLANK : NUMBER_INVALID;
    return undefined;
  };

  const jumuah = readJumuahRows(formData);
  const candidate = {
    mosqueName: text("mosqueName"),
    shortName: text("shortName"),
    tagline: text("tagline"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    mapUrl: text("mapUrl"),
    donateUrl: text("donateUrl"),
    timezone: text("timezone"),
    timeFormat: text("timeFormat"),
    hijriAdjustment: number("hijriAdjustment"),
    hijriRollAtMaghrib: readFlag(formData, "hijriRollAtMaghrib"),
    jumuah: jumuah.slots,
    tv: {
      theme: text("tv.theme"),
      showSeconds: readFlag(formData, "tv.showSeconds"),
      showSunrise: readFlag(formData, "tv.showSunrise"),
      jamaatInProgressMinutes: number("tv.jamaatInProgressMinutes"),
      announcementSeconds: number("tv.announcementSeconds"),
    },
  };
  return { candidate, fieldErrors, jumuahRows: jumuah.rows };
}

/**
 * Validates and saves settings from a form or a partial object (see the top
 * of this file for the difference) and returns the complete settings as
 * stored. Every invalid field is reported under its own name; nothing is
 * saved unless everything that was sent is valid.
 *
 * @param payload Untrusted: a `FormData` or a plain object.
 * @param nowMs   Clock, epoch milliseconds.
 * @throws when the database cannot be written.
 */
export async function saveSettingsFrom(
  payload: unknown,
  nowMs: number = Date.now(),
): Promise<SaveSettingsResult> {
  if (isFormData(payload)) {
    const form = readSettingsForm(payload);
    const parsed = siteSettingsSchema.safeParse(form.candidate);
    if (!parsed.success || Object.keys(form.fieldErrors).length > 0) {
      return validationFailure(parsed.success ? null : parsed.error, {
        labels: SETTINGS_LABELS,
        fieldErrors: form.fieldErrors,
        // The schema numbers the slots it was given; the form numbers its rows, blank ones included.
        rename: (key) =>
          key.replace(/^jumuah\.(\d+)/, (whole, slot: string) => {
            const row = form.jumuahRows[Number(slot)];
            return row === undefined ? whole : `jumuah.${row}`;
          }),
      });
    }
    return { ok: true, settings: await saveSettings(parsed.data, nowMs) };
  }

  const parsed = siteSettingsPatchSchema.safeParse(payload);
  if (!parsed.success) return validationFailure(parsed.error, { labels: SETTINGS_LABELS });
  return { ok: true, settings: await saveSettings(parsed.data, nowMs) };
}
