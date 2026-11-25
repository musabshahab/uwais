/**
 * Text helpers shared by the importer: cleaning what volunteers type into
 * spreadsheets, and wording the messages we send back to them.
 */

import { MS_PER_DAY, epochDayToCivil, parseDateParts } from "@/lib/time/dates";
import type { DateString } from "@/lib/types";
import type { RawCell } from "./types";

const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Longest cell text quoted in a message before it is cut with an ellipsis. */
const MAX_QUOTED_LENGTH = 40;

/** Offsets from an ASCII digit to the same digit in other scripts people type times in. */
const DIGIT_BLOCK_STARTS = [0x0660, 0x06f0, 0xff10] as const;

/** Spaces that look like a space but are not U+0020 (no-break, thin, ideographic, zero-width, BOM). */
const ODD_SPACES = /[   -​  　﻿]/g;

/** Apostrophe-like characters used in transliterated Arabic (`Jama'ah`, `ʿAsr`). */
const APOSTROPHES = /['’‘`´ʿʾʻʼ]/g;

/** Latin and Arabic combining marks left over after Unicode decomposition, plus the tatweel. */
const COMBINING_MARKS = /[̀-ًͯ-ٰٟـ]/g;

/**
 * Replaces Arabic-Indic (٠-٩), Eastern Arabic (۰-۹) and full-width digits
 * with ASCII digits, leaving everything else untouched.
 */
export function normaliseDigits(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    let digit = -1;
    for (const start of DIGIT_BLOCK_STARTS) {
      if (code >= start && code <= start + 9) digit = code - start;
    }
    result += digit >= 0 ? String(digit) : text[i];
  }
  return result;
}

/** Turns every odd space into a normal one, collapses runs of whitespace and trims. */
export function collapseSpaces(text: string): string {
  return text.replace(ODD_SPACES, " ").replace(/\s+/g, " ").trim();
}

/**
 * Reduces a header label to lower-case words separated by single spaces so
 * that `Fajr_Jama'ah`, `FAJR JAMAAH` and `fajrJamaah` all compare equal.
 * Accents, apostrophes and punctuation are dropped; Arabic letters are kept.
 */
export function normaliseLabel(label: string): string {
  return normaliseDigits(label)
    // camelCase keys such as `fajrBegins` are two words.
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(APOSTROPHES, "")
    .toLowerCase()
    // `1st`, `2nd` count as plain numbers; `mithl1` is `mithl 1`.
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}

/** Whether a cell holds nothing (null, or text that is only whitespace). */
export function isBlankCell(cell: RawCell | undefined): boolean {
  if (cell === null || cell === undefined) return true;
  return typeof cell === "string" && collapseSpaces(cell) === "";
}

/** Zero-pads a number to two digits. */
export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * A cell as text, the way the user would recognise it: dates as
 * `YYYY-MM-DD`, Excel time cells as `HH:mm`, everything else as typed.
 */
export function cellText(cell: RawCell | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return collapseSpaces(cell);
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  const ms = cell.getTime();
  if (Number.isNaN(ms)) return "";
  const { year, month, day } = epochDayToCivil(Math.floor(ms / MS_PER_DAY));
  const time = `${pad2(cell.getUTCHours())}:${pad2(cell.getUTCMinutes())}`;
  // Excel stores a bare time as a moment on its day zero (1899 or 1904).
  if (year <= 1904) return time;
  const date = `${year}-${pad2(month)}-${pad2(day)}`;
  return time === "00:00" ? date : `${date} ${time}`;
}

/** Wraps text in double quotes for a message, cutting very long values. */
export function quote(text: string): string {
  const clean = collapseSpaces(text);
  const shown = clean.length > MAX_QUOTED_LENGTH ? `${clean.slice(0, MAX_QUOTED_LENGTH - 1)}…` : clean;
  return `"${shown}"`;
}

/** Joins words as English prose: `a`, `a and b`, `a, b and c`. */
export function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** `1 row` / `3 rows`: a count with its noun in the right number. */
export function plural(count: number, singular: string, pluralForm: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** The Excel letter of a 0-based column index: 0 is `A`, 25 is `Z`, 26 is `AA`. */
export function columnLetter(index: number): string {
  let letters = "";
  for (let rest = index; rest >= 0; rest = Math.floor(rest / 26) - 1) {
    letters = String.fromCharCode(65 + (rest % 26)) + letters;
  }
  return letters;
}

/**
 * Compresses row numbers into ranges for a message: `[3, 4, 5, 9]` becomes
 * `3-5 and 9`. At most `maxParts` ranges are spelled out.
 */
export function formatRowRanges(rowNumbers: readonly number[], maxParts = 4): string {
  const sorted = [...rowNumbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
    parts.push(i - 1 === start ? String(sorted[start]) : `${sorted[start]}-${sorted[i - 1]}`);
    start = i;
  }
  if (parts.length <= maxParts) return formatList(parts);
  return `${parts.slice(0, maxParts).join(", ")} and ${parts.length - maxParts} more`;
}

/** A date as it reads in a message: `5 Mar 2027`. */
export function shortDate(date: DateString): string {
  const { year, month, day } = parseDateParts(date);
  return `${day} ${MONTH_ABBREVIATIONS[month - 1]} ${year}`;
}
