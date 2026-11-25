"use server";

/**
 * Editing the timetable by hand: one day at a time, and deleting days.
 */

import type { PrayerDayInput } from "@/lib/db/schemas";
import { deleteDays, saveDay } from "./core/timetable";
import { denyUnlessAdmin, runMutation } from "./guard";
import type { DeleteDaysInput, DeleteDaysResult, SaveDayResult } from "./types";

/**
 * Creates or amends one day of the timetable. The day is stored as given, so
 * send every field of the day: a time that is left out or blank is cleared.
 *
 * Malformed values block the save and come back as `fieldErrors` keyed by
 * field name. Implausible but well-formed times (out of order, a jamaat
 * before its prayer begins) are saved and listed in `warnings`.
 *
 * @param day Only `date` is required; times are `HH:mm`, blank or null.
 */
export async function saveDayAction(day: PrayerDayInput): Promise<SaveDayResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runMutation("saveDay", () => saveDay(day));
}

/**
 * Deletes the stored days from `from` to `to`, both inclusive: at most
 * `MAX_DELETE_RANGE_DAYS` days per call, and only with `confirm: true`.
 * Called without the confirmation it deletes nothing and answers
 * `confirmation-required` with a sentence saying how many days would go.
 */
export async function deleteDaysAction(input: DeleteDaysInput): Promise<DeleteDaysResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runMutation("deleteDays", () => deleteDays(input));
}
