"use server";

/**
 * Saving the site settings.
 */

import type { SiteSettingsPatch } from "@/lib/db/schemas";
import { saveSettingsFrom } from "./core/settings";
import { denyUnlessAdmin, runMutation } from "./guard";
import type { SaveSettingsState } from "./types";

/**
 * Saves the site settings, for `useActionState(saveSettingsAction, null)`.
 *
 * - Dispatched with a plain object it is a partial update: any subset of the
 *   settings, and any subset of `tv`.
 * - Used as a form action it reads the complete settings form. Field names
 *   are the property paths of `SiteSettings` joined with dots (`mosqueName`,
 *   `tv.theme`, `jumuah.0.label`, `jumuah.0.time`). An unticked checkbox is
 *   `false`; any other missing field is reported as an error instead of
 *   being reset.
 *
 * Invalid fields come back in `fieldErrors` under those same names and
 * nothing is saved. On success the result carries the complete settings.
 *
 * @param _previous The form state before this save (unused).
 * @param payload   The settings form, or a partial settings object.
 */
export async function saveSettingsAction(
  _previous: SaveSettingsState,
  payload: FormData | SiteSettingsPatch,
): Promise<SaveSettingsState> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runMutation("saveSettings", () => saveSettingsFrom(payload));
}
