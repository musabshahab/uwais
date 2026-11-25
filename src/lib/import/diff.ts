/**
 * Comparing an import with what is already saved, and merging the two.
 *
 * Importing is an upsert by date. A file only overwrites the parts of a day
 * it has columns for, so a "jamaat times only" sheet updates the jamaat
 * times and leaves the begin times alone. `mergeDay` is the single place
 * that rule lives; `diffTimetable` previews exactly what it will do.
 *
 * Pure and dependency-free: safe to use in the browser.
 */

import { TIME_FIELDS, type DateString, type PrayerDay } from "@/lib/types";
import { blankDay, byDate } from "./day";
import { MERGE_FIELDS, type DayChange, type FieldChange, type MergeField, type TimetableDiff } from "./types";

/** A copy of a day that shares no arrays with the original. */
function copyDay(day: PrayerDay): PrayerDay {
  return { ...day, jumuah: [...day.jumuah] };
}

/** A field's value as comparable text: the time, the note, or the Jumu'ah times joined. Null when empty. */
function fieldText(day: PrayerDay, field: MergeField): string | null {
  if (field === "jumuah") return day.jumuah.length > 0 ? day.jumuah.join(", ") : null;
  const value = day[field];
  return value === "" ? null : value;
}

/**
 * The day to save when `incoming` is imported over `existing`.
 *
 * Fields listed in `mappedFields` take the incoming value, including an
 * empty one (an empty cell in a column the file has clears the saved time).
 * Every other field keeps its saved value. Without a saved day the result is
 * the incoming day restricted to the mapped fields.
 *
 * @param existing     The saved day for the same date, if there is one.
 * @param incoming     The day read from the file.
 * @param mappedFields The parts of a day the file provides (`ImportResult.mappedFields`);
 *                     every part when omitted.
 */
export function mergeDay(existing: PrayerDay | null | undefined, incoming: PrayerDay, mappedFields: readonly MergeField[] = MERGE_FIELDS): PrayerDay {
  const merged: PrayerDay = existing ? { ...copyDay(existing), date: incoming.date } : blankDay(incoming.date);
  for (const field of TIME_FIELDS) {
    if (mappedFields.includes(field)) merged[field] = incoming[field];
  }
  if (mappedFields.includes("jumuah")) merged.jumuah = [...incoming.jumuah];
  if (mappedFields.includes("note")) merged.note = incoming.note;
  return merged;
}

/** The fields in which two versions of a day differ. */
function changedFields(before: PrayerDay, after: PrayerDay): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of MERGE_FIELDS) {
    const from = fieldText(before, field);
    const to = fieldText(after, field);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

/**
 * Previews an import: which days are new, which saved days change (and in
 * which fields), and how many incoming days are already saved as they are.
 * The `added` days and each `after` are exactly what `mergeDay` produces, so
 * what the admin confirms is what gets written.
 *
 * @param existing     The saved timetable (any order; only matching dates matter).
 * @param incoming     The days read from the file (`ImportResult.days`).
 * @param mappedFields The parts of a day the file provides; every part when omitted.
 */
export function diffTimetable(existing: readonly PrayerDay[], incoming: readonly PrayerDay[], mappedFields: readonly MergeField[] = MERGE_FIELDS): TimetableDiff {
  const saved = new Map<DateString, PrayerDay>();
  for (const day of existing) saved.set(day.date, day);

  const added: PrayerDay[] = [];
  const changed: DayChange[] = [];
  let unchanged = 0;
  for (const day of incoming) {
    const before = saved.get(day.date);
    const after = mergeDay(before, day, mappedFields);
    if (!before) {
      added.push(after);
      continue;
    }
    const fields = changedFields(before, after);
    if (fields.length === 0) unchanged++;
    else changed.push({ date: day.date, before: copyDay(before), after, fields });
  }
  return { added, changed, unchanged };
}

/**
 * The days that have to be written to apply a diff: the new ones and the
 * changed ones in their merged form, sorted by date.
 */
export function daysToSave(diff: TimetableDiff): PrayerDay[] {
  return [...diff.added, ...diff.changed.map((change) => change.after)].sort(byDate);
}
