/**
 * Test support for the action cores: timetable days, uploaded files and
 * import forms. Import this from tests only.
 */

import { toCsv } from "@/lib/import";
import { addDays } from "@/lib/time";
import type { DateString, PrayerDay } from "@/lib/types";

/** A fully populated, plausible winter day; `overrides` replaces individual fields. */
export function fullDay(date: DateString, overrides: Partial<PrayerDay> = {}): PrayerDay {
  return {
    date,
    fajrBegins: "06:10",
    fajrJamaat: "06:30",
    sunrise: "07:50",
    dhuhrBegins: "12:05",
    dhuhrJamaat: "13:00",
    asrBegins: "14:10",
    asrJamaat: "14:30",
    maghribBegins: "16:20",
    maghribJamaat: "16:25",
    ishaBegins: "17:55",
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

/** `count` consecutive full days starting at `first`. */
export function fullDays(first: DateString, count: number): PrayerDay[] {
  return Array.from({ length: count }, (_, offset) => fullDay(addDays(first, offset)));
}

/** A text file as a browser would upload it. */
export function textFile(name: string, content: string): File {
  return new File([content], name, { type: "text/csv" });
}

/** A binary file, such as an Excel workbook, as a browser would upload it. */
export function binaryFile(name: string, data: Uint8Array): File {
  // Copied because a file part must sit on a plain ArrayBuffer, which the type of `data` does not promise.
  return new File([new Uint8Array(data)], name);
}

/** Days as an uploaded CSV file in the canonical export layout. */
export function csvFile(name: string, days: readonly PrayerDay[]): File {
  return textFile(name, toCsv(days));
}

/** An import form holding `file` and any other fields. */
export function importForm(file: File | null, fields: Readonly<Record<string, string>> = {}): FormData {
  const formData = new FormData();
  if (file !== null) formData.set("file", file);
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}
