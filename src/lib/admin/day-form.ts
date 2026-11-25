/**
 * The state of the "edit a day" form and its translation to and from a
 * stored timetable day. Inputs of `type="time"` hold `HH:mm` or the empty
 * string, so the form keeps strings throughout.
 */

import { MAX_JUMUAH_SLOTS, type PrayerDayInput } from "@/lib/db/schemas";
import { PRAYERS, SUNRISE_LABEL, TIME_FIELDS, type DateString, type PrayerDay, type TimeField } from "@/lib/types";

/** One time of a day as the editor presents it. */
export interface DayTimeColumn {
  field: TimeField;
  /** What the time is within its prayer: `Begins`, `Jamaat`, or `Time` for sunrise. */
  label: string;
  /** The whole name, for labelling an input or a column on its own: `Fajr begins`. */
  fullLabel: string;
}

/** The times of one prayer (or sunrise), grouped as the editor shows them. */
export interface DayTimeGroup {
  key: string;
  name: string;
  arabic: string;
  columns: DayTimeColumn[];
}

/**
 * The eleven times of a day in the order of the day, grouped by prayer:
 * Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha. The month grid and the day form
 * are both laid out from this.
 */
export const DAY_TIME_GROUPS: readonly DayTimeGroup[] = PRAYERS.flatMap((prayer) => {
  const group: DayTimeGroup = {
    key: prayer.key,
    name: prayer.name,
    arabic: prayer.arabic,
    columns: [
      { field: prayer.beginsField, label: "Begins", fullLabel: `${prayer.name} begins` },
      { field: prayer.jamaatField, label: "Jamaat", fullLabel: `${prayer.name} jamaat` },
    ],
  };
  if (prayer.key !== "fajr") return [group];
  const sunrise: DayTimeGroup = {
    key: "sunrise",
    name: SUNRISE_LABEL.name,
    arabic: SUNRISE_LABEL.arabic,
    columns: [{ field: "sunrise", label: "Time", fullLabel: SUNRISE_LABEL.name }],
  };
  return [group, sunrise];
});

/** What the day form holds while it is being edited. */
export interface DayFormState {
  /** Every time field, `HH:mm` or empty. */
  times: Record<TimeField, string>;
  /** One entry per Jumu'ah slot, `HH:mm` or empty; always `MAX_JUMUAH_SLOTS` long. */
  jumuah: string[];
  note: string;
}

function emptyTimes(): Record<TimeField, string> {
  return Object.fromEntries(TIME_FIELDS.map((field) => [field, ""])) as Record<TimeField, string>;
}

/** The form for a stored day, or an empty form when nothing is stored for the date. */
export function dayToForm(day: PrayerDay | null): DayFormState {
  const times = emptyTimes();
  if (day !== null) {
    for (const field of TIME_FIELDS) times[field] = day[field] ?? "";
  }
  const jumuah = Array.from({ length: MAX_JUMUAH_SLOTS }, (_, index) => day?.jumuah[index] ?? "");
  return { times, jumuah, note: day?.note ?? "" };
}

/**
 * Keeps the hours and minutes of a time input's value. Browsers add seconds
 * (`05:30:00`) when a step below a minute is in play; the timetable has none.
 */
function trimSeconds(value: string): string {
  const match = /^(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  return match ? match[1] : value.trim();
}

/**
 * The whole day as `saveDayAction` expects it: every time field (blank ones
 * as null, which clears them), the filled-in Jumu'ah times, and the note.
 * @param friday Jumu'ah times are only sent for a Friday; the form does not
 *               offer them on other days.
 */
export function formToDayInput(date: DateString, form: DayFormState, friday: boolean): PrayerDayInput {
  const input: PrayerDayInput = { date, jumuah: [], note: form.note.trim() === "" ? null : form.note };
  for (const field of TIME_FIELDS) {
    const value = trimSeconds(form.times[field]);
    input[field] = value === "" ? null : value;
  }
  if (friday) input.jumuah = form.jumuah.map(trimSeconds).filter((time) => time !== "");
  return input;
}

/**
 * The form with every prayer time taken from another day, the usual start
 * for typing a day by hand since times move by a minute or two. The Jumu'ah
 * times and the note are left as they are: they belong to the day itself.
 */
export function copyTimesFrom(form: DayFormState, source: PrayerDay): DayFormState {
  const times = emptyTimes();
  for (const field of TIME_FIELDS) times[field] = source[field] ?? "";
  return { ...form, times };
}

/** Whether two form states hold the same values. */
export function dayFormsEqual(a: DayFormState, b: DayFormState): boolean {
  return (
    a.note === b.note &&
    TIME_FIELDS.every((field) => a.times[field] === b.times[field]) &&
    a.jumuah.length === b.jumuah.length &&
    a.jumuah.every((time, index) => time === b.jumuah[index])
  );
}

/** Whether the form holds nothing at all: no time, no Jumu'ah time, no note. */
export function isDayFormBlank(form: DayFormState): boolean {
  return (
    form.note.trim() === "" &&
    TIME_FIELDS.every((field) => form.times[field] === "") &&
    form.jumuah.every((time) => time === "")
  );
}

/**
 * The message for the Jumu'ah group from an action's field errors, whose
 * keys are `jumuah` for the list as a whole and `jumuah.<n>` for one slot.
 */
export function jumuahError(fieldErrors: Readonly<Record<string, string>> | undefined): string | null {
  if (fieldErrors === undefined) return null;
  const key = Object.keys(fieldErrors).find((name) => name === "jumuah" || name.startsWith("jumuah."));
  return key === undefined ? null : fieldErrors[key];
}
