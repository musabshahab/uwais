/**
 * The settings repository. Each top-level setting is one row of the
 * `settings` table holding a JSON value. Rows are optional: whatever is not
 * stored, or is stored but no longer valid, falls back to the default for
 * that one field, so a bad value can never take the site down.
 */

import type { InStatement } from "@libsql/client";
import type { z } from "zod";
import { isValidTimeZone } from "@/lib/time";
import { DEFAULT_SETTINGS, type SiteSettings } from "@/lib/types";
import { getDb, withWriteTransaction } from "./client";
import { readText, toTimestamp, type Executor } from "./rows";
import { siteSettingsPatchSchema, siteSettingsSchema, tvSettingsSchema } from "./schemas";
import type { SiteSettingsPatch } from "./schemas";

type TvSettings = SiteSettings["tv"];

/** Top-level settings other than `tv`, which is merged field by field. */
type FlatSettingKey = Exclude<keyof SiteSettings, "tv">;

const FLAT_KEYS = (Object.keys(siteSettingsSchema.shape) as (keyof SiteSettings)[]).filter(
  (key): key is FlatSettingKey => key !== "tv",
);

const TV_KEYS = Object.keys(tvSettingsSchema.shape) as (keyof TvSettings)[];

/**
 * The settings of an installation that has not saved any yet: the built-in
 * defaults, with the timezone taken from `MOSQUE_TIMEZONE` when that names a
 * zone this server knows. Returns a fresh copy on every call.
 */
export function defaultSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SiteSettings {
  const zone = env.MOSQUE_TIMEZONE?.trim();
  return {
    ...DEFAULT_SETTINGS,
    timezone: isValidTimeZone(zone) ? zone : DEFAULT_SETTINGS.timezone,
    jumuah: DEFAULT_SETTINGS.jumuah.map((slot) => ({ ...slot })),
    tv: { ...DEFAULT_SETTINGS.tv },
  };
}

/** The stored value when it passes the field's schema, otherwise the fallback. */
function validOr<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

/** The TV settings: each stored field that is valid, the default for the rest. */
function resolveTv(stored: unknown, defaults: TvSettings): TvSettings {
  const source: Record<string, unknown> =
    typeof stored === "object" && stored !== null ? { ...stored } : {};
  const fields = tvSettingsSchema.shape;
  return {
    theme: validOr(fields.theme, source.theme, defaults.theme),
    showSeconds: validOr(fields.showSeconds, source.showSeconds, defaults.showSeconds),
    showSunrise: validOr(fields.showSunrise, source.showSunrise, defaults.showSunrise),
    jamaatInProgressMinutes: validOr(
      fields.jamaatInProgressMinutes,
      source.jamaatInProgressMinutes,
      defaults.jamaatInProgressMinutes,
    ),
    announcementSeconds: validOr(
      fields.announcementSeconds,
      source.announcementSeconds,
      defaults.announcementSeconds,
    ),
  };
}

/**
 * Lays stored values over the defaults. Every field is validated on its own:
 * a valid stored value is used, anything else (missing, wrong type, out of
 * range, an unknown timezone) falls back to that field's default. Unknown
 * keys are ignored. Never throws.
 *
 * @param stored   Parsed JSON values by setting name, as read from the table.
 * @param defaults What to use where nothing valid is stored.
 */
export function resolveSettings(
  stored: Readonly<Record<string, unknown>>,
  defaults: SiteSettings,
): SiteSettings {
  const fields = siteSettingsSchema.shape;
  return {
    mosqueName: validOr(fields.mosqueName, stored.mosqueName, defaults.mosqueName),
    shortName: validOr(fields.shortName, stored.shortName, defaults.shortName),
    tagline: validOr(fields.tagline, stored.tagline, defaults.tagline),
    address: validOr(fields.address, stored.address, defaults.address),
    phone: validOr(fields.phone, stored.phone, defaults.phone),
    email: validOr(fields.email, stored.email, defaults.email),
    mapUrl: validOr(fields.mapUrl, stored.mapUrl, defaults.mapUrl),
    donateUrl: validOr(fields.donateUrl, stored.donateUrl, defaults.donateUrl),
    timezone: validOr(fields.timezone, stored.timezone, defaults.timezone),
    timeFormat: validOr(fields.timeFormat, stored.timeFormat, defaults.timeFormat),
    hijriAdjustment: validOr(
      fields.hijriAdjustment,
      stored.hijriAdjustment,
      defaults.hijriAdjustment,
    ),
    hijriRollAtMaghrib: validOr(
      fields.hijriRollAtMaghrib,
      stored.hijriRollAtMaghrib,
      defaults.hijriRollAtMaghrib,
    ),
    jumuah: validOr(fields.jumuah, stored.jumuah, defaults.jumuah),
    tv: resolveTv(stored.tv, defaults.tv),
  };
}

/** The stored rows as parsed JSON by key. Rows that are not valid JSON are skipped. */
async function readStoredValues(executor: Executor): Promise<Record<string, unknown>> {
  const result = await executor.execute("SELECT key, value FROM settings");
  const stored: Record<string, unknown> = {};
  for (const row of result.rows) {
    const key = readText(row.key);
    const value = readText(row.value);
    if (key === null || value === null) continue;
    try {
      stored[key] = JSON.parse(value);
    } catch {
      // Unreadable row: the field falls back to its default.
    }
  }
  return stored;
}

/** The settings together with whether the installation has saved any. */
export interface SettingsSnapshot {
  settings: SiteSettings;
  /**
   * False on a database where no setting was ever saved, in which case
   * `settings` is entirely defaults.
   */
  stored: boolean;
}

/** The current settings and whether any of them come from the database. */
export async function readSettings(): Promise<SettingsSnapshot> {
  const db = await getDb();
  const stored = await readStoredValues(db);
  return {
    settings: resolveSettings(stored, defaultSettings()),
    stored: Object.keys(stored).length > 0,
  };
}

/**
 * The current site settings: stored values laid over the defaults, each field
 * validated separately (see `resolveSettings`).
 */
export async function getSettings(): Promise<SiteSettings> {
  return (await readSettings()).settings;
}

/**
 * Saves the given fields and returns the complete settings afterwards. Fields
 * that are left out keep their value, and `tv` can itself be partial.
 *
 * @param patch Any subset of the settings; see `siteSettingsPatchSchema` for the limits.
 * @param nowMs Clock for the `updated_at` column, epoch milliseconds.
 * @throws ZodError when a supplied field is invalid. Nothing is saved in that case.
 */
export async function saveSettings(
  patch: SiteSettingsPatch,
  nowMs: number = Date.now(),
): Promise<SiteSettings> {
  const changes = siteSettingsPatchSchema.parse(patch);
  const updatedAt = toTimestamp(nowMs);
  // One transaction: the TV fields are merged into the stored object, and two
  // admins saving at once must not overwrite each other's half.
  return withWriteTransaction(async (transaction) => {
    const stored = await readStoredValues(transaction);
    const values: Record<string, unknown> = {};
    for (const key of FLAT_KEYS) {
      if (changes[key] !== undefined) values[key] = changes[key];
    }
    if (changes.tv !== undefined) {
      const tv: Record<string, unknown> = { ...resolveTv(stored.tv, defaultSettings().tv) };
      for (const key of TV_KEYS) {
        if (changes.tv[key] !== undefined) tv[key] = changes.tv[key];
      }
      values.tv = tv;
    }

    const statements: InStatement[] = Object.keys(values).map((key) => ({
      sql:
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      args: [key, JSON.stringify(values[key]), updatedAt],
    }));
    if (statements.length > 0) await transaction.batch(statements);
    return resolveSettings({ ...stored, ...values }, defaultSettings());
  });
}
