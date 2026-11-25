/**
 * Editing the timetable by hand, without the Server Action wrapping: saving
 * one day and deleting a range of days.
 */

import {
  boundedDateRangeSchema,
  deletePrayerDays,
  getPrayerDays,
  prayerDaySchema,
  upsertPrayerDays,
} from "@/lib/db";
import { checkDay } from "@/lib/import/checks";
import { plural, shortDate } from "@/lib/import/text";
import { FIELD_LABELS } from "@/lib/import/types";
import { isFriday } from "@/lib/time";
import { TIME_FIELDS, type PrayerDay } from "@/lib/types";
import {
  MAX_DELETE_RANGE_DAYS,
  type DayWarning,
  type DeleteDaysResult,
  type ImportDayEffect,
  type SaveDayResult,
} from "../types";
import { withTimetableLock } from "./lock";
import { failure, validationFailure, type FieldLabels } from "./result";

const DAY_LABELS: FieldLabels = {
  date: "Date",
  ...FIELD_LABELS,
  jumuah: "Jumu'ah times",
  note: "Note",
};

const RANGE_LABELS: FieldLabels = { from: "First day", to: "Last day" };

/** Whether a day carries nothing at all: no time, no Jumu'ah time and no note. */
function isBlankDay(day: PrayerDay): boolean {
  return TIME_FIELDS.every((field) => day[field] === null) && day.jumuah.length === 0 && day.note === null;
}

/** The properties of an untrusted value, or none when it is not an object. */
function propertiesOf(input: unknown): Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null ? { ...input } : {};
}

/**
 * Creates or amends one day. The day is stored exactly as given: a time that
 * is left out or blank is cleared, so send the whole day, not only what changed.
 *
 * A malformed date or time, or a note that is too long, blocks the save and
 * comes back as field errors. Times that are well-formed but implausible (out
 * of order through the day, a jamaat before its prayer begins) are saved and
 * reported as warnings, exactly as the importer does. Jumu'ah times on a day
 * that is not a Friday are left out, with a warning, also as the importer does.
 *
 * @param input Untrusted; see `prayerDaySchema` for the accepted shape.
 * @param nowMs Clock, epoch milliseconds.
 * @throws when the database cannot be written.
 */
export async function saveDay(input: unknown, nowMs: number = Date.now()): Promise<SaveDayResult> {
  const parsed = prayerDaySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error, { labels: DAY_LABELS });

  const warnings: DayWarning[] = [];
  let day: PrayerDay = parsed.data;
  if (day.jumuah.length > 0 && !isFriday(day.date)) {
    warnings.push({
      code: "jumuah-not-friday",
      field: "jumuah",
      message: `${shortDate(day.date)} is not a Friday, so its Jumu'ah times were not saved.`,
    });
    day = { ...day, jumuah: [] };
  }
  if (isBlankDay(day)) {
    return failure(
      "invalid",
      "Enter at least one time or a note. To remove this day from the timetable, delete it instead.",
    );
  }
  warnings.push(...checkDay(day));

  // `replace`: the form shows the whole day, so a field the user emptied must be cleared.
  const summary = await withTimetableLock(() =>
    upsertPrayerDays([day], { mode: "replace", nowMs }),
  );
  const outcome: ImportDayEffect =
    summary.added > 0 ? "added" : summary.updated > 0 ? "updated" : "unchanged";
  return { ok: true, day, outcome, warnings };
}

/**
 * Deletes the stored days from `from` to `to`, both inclusive.
 *
 * Two safeguards: the range may span at most `MAX_DELETE_RANGE_DAYS` days,
 * and `confirm` must be exactly `true`. Without the confirmation nothing is
 * deleted and the answer says how many days would be, which is what a
 * confirmation dialog needs to show.
 *
 * @param input Untrusted `{ from, to, confirm }`.
 * @throws when the database cannot be read or written.
 */
export async function deleteDays(input: unknown): Promise<DeleteDaysResult> {
  const source = propertiesOf(input);
  const parsed = boundedDateRangeSchema(MAX_DELETE_RANGE_DAYS).safeParse({
    from: source.from,
    to: source.to,
  });
  if (!parsed.success) return validationFailure(parsed.error, { labels: RANGE_LABELS });
  const { from, to } = parsed.data;
  const span = from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`;

  return withTimetableLock(async () => {
    const stored = await getPrayerDays(from, to);
    if (stored.length === 0) {
      return failure("not-found", `There is nothing to delete: no days are saved for ${span}.`);
    }
    if (source.confirm !== true) {
      return failure(
        "confirmation-required",
        `This will permanently delete ${plural(stored.length, "day")} of prayer times (${span}). Confirm to go ahead.`,
      );
    }
    const deleted = await deletePrayerDays(from, to);
    return { ok: true, deleted, from, to };
  });
}
