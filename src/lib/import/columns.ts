/**
 * Understanding column headings. Every mosque spells the prayers its own way
 * (Zuhr, Zohar, Dhuhr; Jama'ah, Jamat, Iqamah), so headings are reduced to
 * plain words and matched against a dictionary of spellings. The result is a
 * `ColumnMapping`: plain data the admin can correct by hand.
 */

import { PRAYERS, type PrayerKey, type TimeField } from "@/lib/types";
import { columnLetter, formatList, normaliseLabel } from "./text";
import {
  FIELD_LABELS,
  JUMUAH_TARGETS,
  MAPPING_TARGETS,
  type ColumnContent,
  type ColumnMapping,
  type IgnoredColumn,
  type IssueCode,
  type IssueSeverity,
  type MappingTarget,
} from "./types";

/** What a heading is about. */
export type LabelKind =
  | "date"
  | "day"
  | "month"
  | "prayer"
  | "sunrise"
  | "jumuah"
  | "note"
  /** Recognised, but not something the timetable stores (Hijri date, Zawal, ...). */
  | "ignored"
  /** Only says "begins" or "jamaat": half of a two-row header. */
  | "qualifier"
  | "unknown";

/** Whether a prayer column holds the start of the prayer's time or the congregation time. */
export type PrayerRole = "begins" | "jamaat";

/** What one heading was recognised as. */
export interface LabelClass {
  kind: LabelKind;
  /** Set for `prayer` headings. */
  prayer: PrayerKey | null;
  /** Set for `prayer` and `qualifier` headings; null for a bare prayer name. */
  role: PrayerRole | null;
  /** For Asr begin times: 1 for the first-shadow (standard) time, 2 for the second-shadow (Hanafi) time. */
  variant: 1 | 2 | null;
  /** For Jumu'ah headings that are numbered (`2nd Jumu'ah`). */
  jumuahIndex: 1 | 2 | 3 | null;
  /** For `ignored` headings: what the column is, in words. */
  ignoredAs: string | null;
  /** How well the heading matches; decides between two columns that want the same target. */
  score: number;
}

/** The little a column needs for its mapping to be guessed. */
export interface ColumnInput {
  /** 0-based index into the sheet's rows. */
  index: number;
  /** Header text. */
  label: string;
  /** What the values look like, when known; settles "Date" holding day numbers and "Day" holding weekday names. */
  content?: ColumnContent;
}

/** A remark about how the headings were mapped. The parser turns these into issues. */
export interface MappingNote {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  field?: MappingTarget;
}

/** The full outcome of guessing a mapping. */
export interface ColumnAnalysis {
  mapping: ColumnMapping;
  /** Recognised columns that are not needed. */
  ignored: IgnoredColumn[];
  /** Indices of columns that were not recognised or lost to a better match. */
  unmapped: number[];
  notes: MappingNote[];
}

const PRAYER_SPELLINGS: Readonly<Record<PrayerKey, readonly string[]>> = {
  fajr: ["fajr", "fajar", "fajer", "fajir", "fejr", "fadjr", "subh", "sobh", "subuh", "الفجر", "فجر", "الصبح"],
  dhuhr: [
    "dhuhr",
    "zuhr",
    "zohr",
    "zuhar",
    "zohar",
    "dhuhur",
    "duhr",
    "thuhr",
    "luhr",
    "zuhur",
    "dhohr",
    "dohr",
    "duhur",
    "dzuhur",
    "zuhor",
    "dhuhar",
    "zhuhr",
    "الظهر",
    "ظهر",
  ],
  asr: ["asr", "asar", "asir", "assr", "ashar", "العصر", "عصر"],
  maghrib: ["maghrib", "magrib", "maghreb", "magreb", "maghrab", "mughrib", "maghrieb", "المغرب", "مغرب"],
  isha: ["isha", "esha", "ishaa", "eisha", "ishah", "isya", "eshaa", "العشاء", "عشاء"],
};

const SUNRISE_SPELLINGS: readonly string[] = [
  "sunrise",
  "shuruq",
  "shurooq",
  "shorooq",
  "shurouq",
  "shourouq",
  "shorouk",
  "shuruk",
  "shurook",
  "chourouk",
  "syuruk",
  "tulu",
  "tuloo",
  "الشروق",
  "شروق",
];

/** Ishraq is a little after sunrise; it stands in for sunrise only when no real sunrise column exists. */
const ISHRAQ_SPELLINGS: readonly string[] = ["ishraq", "ishraaq", "ishrak"];

const STRONG_BEGINS: readonly string[] = [
  "begins",
  "begin",
  "beginning",
  "start",
  "starts",
  "started",
  "adhan",
  "adhaan",
  "athan",
  "athaan",
  "azan",
  "azaan",
  "azhan",
  "ezan",
  "اذان",
  "الاذان",
];
/** Words that suggest a begin time but also appear in group headings such as "Jamaat Time". */
const WEAK_BEGINS: readonly string[] = ["time", "times", "waqt", "wakt"];

const STRONG_JAMAAT: readonly string[] = [
  "jamaat",
  "jamaah",
  "jamah",
  "jamat",
  "jamaa",
  "jamaath",
  "jamath",
  "jammat",
  "iqamah",
  "iqama",
  "iqamat",
  "iqaamah",
  "iqaamat",
  "iqaama",
  "ikamah",
  "ikama",
  "ikamat",
  "congregation",
  "congregational",
  "اقامة",
  "الاقامة",
  "الجماعة",
  "جماعة",
];
/** Words that mean the congregational prayer unless a begin-time word says otherwise ("Prayer start times"). */
const WEAK_JAMAAT: readonly string[] = ["salah", "salat", "salaah", "salaat", "prayer", "prayers", "namaz", "namaaz"];

const JUMUAH_SPELLINGS: readonly string[] = [
  "jumuah",
  "jummah",
  "jumma",
  "juma",
  "jumah",
  "jumua",
  "jumaa",
  "jumuat",
  "jumat",
  "friday",
  "khutbah",
  "khutba",
  "الجمعة",
  "جمعة",
];

const NOTE_WORDS: readonly string[] = [
  "note",
  "notes",
  "remark",
  "remarks",
  "comment",
  "comments",
  "event",
  "events",
  "occasion",
  "info",
  "information",
  "description",
  "ملاحظات",
];

/** Columns about the Islamic calendar: recognised wherever the word appears, even next to "date". */
const HIJRI_WORDS: readonly string[] = ["hijri", "hijrah", "hijra", "hijriah", "islamic", "ramadan", "ramadhan", "ramazan", "ramzan", "الهجري"];

/** Other columns seen in real timetables that the site has no use for, with what to call them. */
const IGNORED_WORDS: Readonly<Record<string, string>> = {
  weekday: "Weekday",
  dow: "Weekday",
  zawal: "Zawal",
  zawaal: "Zawal",
  istiwa: "Zawal",
  zenith: "Zawal",
  sehri: "Suhoor end",
  sehr: "Suhoor end",
  sahur: "Suhoor end",
  sahoor: "Suhoor end",
  suhoor: "Suhoor end",
  suhur: "Suhoor end",
  suhour: "Suhoor end",
  imsak: "Suhoor end",
  imsaak: "Suhoor end",
  iftar: "Iftar",
  iftaar: "Iftar",
  iftari: "Iftar",
  taraweeh: "Taraweeh",
  tarawih: "Taraweeh",
  taravih: "Taraweeh",
  fast: "Fasting times",
  fasting: "Fasting times",
  tahajjud: "Night prayer",
  qiyam: "Night prayer",
  duha: "Duha",
  dhuha: "Duha",
  chasht: "Duha",
  midnight: "Midnight",
  week: "Week number",
  wk: "Week number",
  eid: "Eid",
};

/** Multi-word headings for a weekday column. */
const WEEKDAY_PHRASES: readonly string[] = ["week day", "day name", "day of week", "day of the week"];
/** Multi-word headings for a day-of-month column. */
const DAY_OF_MONTH_PHRASES: readonly string[] = ["day of month", "day of the month", "day no", "day number"];

const DATE_WORDS: readonly string[] = ["date", "dates", "gregorian", "تاريخ", "التاريخ"];
const DAY_WORDS: readonly string[] = ["day", "dom", "يوم", "اليوم"];
const MONTH_WORDS: readonly string[] = ["month", "mth", "شهر", "الشهر"];

/** Words that mark the second-shadow (Hanafi) Asr time. */
const ASR_SECOND_WORDS: readonly string[] = ["hanafi", "hanfi", "thani", "thaani", "secondary", "mithlain", "mithlayn"];
/** Words that mark the first-shadow (standard) Asr time. */
const ASR_FIRST_WORDS: readonly string[] = ["awwal", "awal", "shafi", "shafii", "standard"];
const MITHL_WORDS: readonly string[] = ["mithl", "mithal", "misl"];

/** Words about the pre-dawn meal; next to "Fajr" they only restate that Fajr begins then. */
const SUHOOR_WORDS: readonly string[] = ["sehri", "sehr", "sahur", "sahoor", "suhoor", "suhur", "suhour", "imsak", "imsaak"];
/** Words that turn a prayer heading into the END of its time, which the timetable does not store. */
const END_WORDS: readonly string[] = ["end", "ends", "ending", "finish", "finishes", "until"];

const ORDINAL_WORDS: Readonly<Record<string, number>> = { first: 1, second: 2, third: 3 };

const SCORE_EXPLICIT = 10;
const SCORE_BARE = 6;
const SCORE_STAND_IN = 4;
/** Makes the shorter of two otherwise equal headings win ("Fajr Begins" over "Fajr Begins (old)"). */
const SCORE_PER_WORD = 0.1;

const PRAYER_BY_WORD: ReadonlyMap<string, PrayerKey> = new Map(
  (Object.keys(PRAYER_SPELLINGS) as PrayerKey[]).flatMap((key) => PRAYER_SPELLINGS[key].map((word) => [word, key] as const)),
);

const UNKNOWN: LabelClass = {
  kind: "unknown",
  prayer: null,
  role: null,
  variant: null,
  jumuahIndex: null,
  ignoredAs: null,
  score: 0,
};

/** Builds a classification from the fields that differ from "unknown". */
function classed(kind: LabelKind, words: readonly string[], base: number, extra: Partial<LabelClass> = {}): LabelClass {
  return { ...UNKNOWN, kind, score: base - words.length * SCORE_PER_WORD, ...extra };
}

/** Whether any of the given words occurs in the heading. */
function hasAny(words: readonly string[], vocabulary: readonly string[]): boolean {
  return words.some((word) => vocabulary.includes(word));
}

/** Whether the heading contains one of the phrases as consecutive words. */
function hasPhrase(words: readonly string[], phrases: readonly string[]): boolean {
  const padded = ` ${words.join(" ")} `;
  return phrases.some((phrase) => padded.includes(` ${phrase} `));
}

/** The begins/jamaat meaning of a heading's words, or null when it has none or both cancel out. */
function readRole(words: readonly string[]): PrayerRole | null {
  if (hasAny(words, STRONG_JAMAAT)) return "jamaat";
  if (hasAny(words, STRONG_BEGINS)) return "begins";
  const weakJamaat = hasAny(words, WEAK_JAMAAT);
  const weakBegins = hasAny(words, WEAK_BEGINS);
  // "Prayer time" could be either; treat it like a bare prayer name.
  if (weakJamaat === weakBegins) return null;
  return weakJamaat ? "jamaat" : "begins";
}

/** The numbers a heading mentions, as digits or as words (`2`, `second`). */
function readNumbers(words: readonly string[]): number[] {
  const numbers: number[] = [];
  for (const word of words) {
    if (/^\d$/.test(word)) numbers.push(Number(word));
    else if (word in ORDINAL_WORDS) numbers.push(ORDINAL_WORDS[word]);
  }
  return numbers;
}

/** Which of the two Asr calculations a heading names, if any. */
function readAsrVariant(words: readonly string[]): 1 | 2 | null {
  if (hasAny(words, ASR_SECOND_WORDS)) return 2;
  if (hasAny(words, ASR_FIRST_WORDS)) return 1;
  if (!hasAny(words, MITHL_WORDS)) return null;
  const [number] = readNumbers(words);
  return number === 1 || number === 2 ? number : null;
}

/** Classifies a heading that names exactly one prayer. */
function classifyPrayer(prayer: PrayerKey, words: readonly string[]): LabelClass {
  // "Fajr (Sehri ends)" is still the Fajr begin time; "Fajr ends" is not.
  const meaningful = words.filter((word) => !SUHOOR_WORDS.includes(word));
  if (meaningful.length === words.length && hasAny(words, END_WORDS)) {
    return classed("ignored", words, SCORE_BARE, { ignoredAs: "End of prayer time" });
  }
  const role = readRole(words);
  const variant = prayer === "asr" && role !== "jamaat" ? readAsrVariant(words) : null;
  const base = (role ? SCORE_EXPLICIT : SCORE_BARE) - (variant === 2 ? 1 : 0);
  return classed("prayer", words, base, { prayer, role, variant });
}

/**
 * Recognises one column heading: which prayer and whether it is the begin or
 * jamaat time, or a date, sunrise, Jumu'ah, note or known-but-unused column.
 * Spelling, case, accents, apostrophes and punctuation do not matter.
 */
export function classifyLabel(label: string): LabelClass {
  const words = normaliseLabel(label).split(" ").filter((word) => word !== "");
  if (words.length === 0) return UNKNOWN;

  if (hasAny(words, HIJRI_WORDS)) return classed("ignored", words, SCORE_EXPLICIT, { ignoredAs: "Islamic calendar" });
  if (hasAny(words, SUNRISE_SPELLINGS) || hasPhrase(words, ["sun rise"])) return classed("sunrise", words, SCORE_EXPLICIT);

  const prayers = Array.from(new Set(words.map((word) => PRAYER_BY_WORD.get(word)).filter((key): key is PrayerKey => key !== undefined)));
  if (prayers.length > 1) return UNKNOWN;
  if (prayers.length === 1) return classifyPrayer(prayers[0], words);

  if (hasAny(words, ISHRAQ_SPELLINGS)) return classed("sunrise", words, SCORE_STAND_IN);
  if (hasAny(words, JUMUAH_SPELLINGS)) {
    const [number] = readNumbers(words);
    const jumuahIndex = number === 1 || number === 2 || number === 3 ? number : null;
    return classed("jumuah", words, SCORE_EXPLICIT, { jumuahIndex });
  }
  if (hasPhrase(words, WEEKDAY_PHRASES)) return classed("ignored", words, SCORE_EXPLICIT, { ignoredAs: "Weekday" });
  const ignoredWord = words.find((word) => word in IGNORED_WORDS);
  if (ignoredWord) return classed("ignored", words, SCORE_EXPLICIT, { ignoredAs: IGNORED_WORDS[ignoredWord] });
  // Some timetables give sunset as the start of Maghrib and head the jamaat column "Maghrib".
  if (words.includes("sunset")) return classed("prayer", words, SCORE_STAND_IN, { prayer: "maghrib", role: "begins" });

  if (hasPhrase(words, DAY_OF_MONTH_PHRASES)) return classed("day", words, SCORE_EXPLICIT);
  if (hasAny(words, DATE_WORDS)) return classed("date", words, SCORE_EXPLICIT);
  if (hasAny(words, DAY_WORDS)) return classed("day", words, SCORE_EXPLICIT);
  if (hasAny(words, MONTH_WORDS)) return classed("month", words, SCORE_EXPLICIT);
  if (hasAny(words, NOTE_WORDS)) return classed("note", words, SCORE_EXPLICIT);

  const role = readRole(words);
  return role ? classed("qualifier", words, SCORE_BARE, { role }) : UNKNOWN;
}

/** A mapping with every target unmapped. */
export function emptyMapping(): ColumnMapping {
  const mapping = {} as ColumnMapping;
  for (const target of MAPPING_TARGETS) mapping[target] = null;
  return mapping;
}

/** How a column is named in a message: its heading and letter. */
export function describeColumn(column: { index: number; label: string }): string {
  const letter = columnLetter(column.index);
  return column.label === "" ? `column ${letter}` : `"${column.label}" (column ${letter})`;
}

/** A column together with what its heading was recognised as. */
interface Classified {
  column: ColumnInput;
  label: LabelClass;
}

/** Best match first; among equals the leftmost column. */
function byScore(a: Classified, b: Classified): number {
  return b.label.score - a.label.score || a.column.index - b.column.index;
}

/** Target names as they read inside a sentence. */
const TARGET_NAMES: Readonly<Record<MappingTarget, string>> = {
  date: "the date",
  day: "the day of the month",
  month: "the month",
  ...FIELD_LABELS,
  jumuah1: "a Jumu'ah time",
  jumuah2: "a Jumu'ah time",
  jumuah3: "a Jumu'ah time",
  note: "the note",
};

/** Collects the outcome of the mapping guess while the individual rules run. */
class MappingDraft {
  readonly mapping = emptyMapping();
  readonly ignored: IgnoredColumn[] = [];
  readonly notes: MappingNote[] = [];
  private readonly settled = new Set<number>();

  /** Maps a column to a target. */
  assign(target: MappingTarget, item: Classified): void {
    this.mapping[target] = item.column.index;
    this.settled.add(item.column.index);
  }

  /** Records a column as recognised but not needed. */
  ignore(item: Classified, reason: string): void {
    this.ignored.push({ index: item.column.index, label: item.column.label, reason });
    this.settled.add(item.column.index);
  }

  /** Records that a column lost its target to a better match. */
  duplicate(target: MappingTarget, winner: Classified, loser: Classified): void {
    this.notes.push({
      severity: "warning",
      code: "duplicate-column",
      field: target,
      message: `${describeColumn(winner.column)} and ${describeColumn(loser.column)} both look like ${TARGET_NAMES[target]}. The first one is used; the other is left out.`,
    });
  }

  /** Columns that ended up neither mapped nor ignored. */
  unmapped(columns: readonly ColumnInput[]): number[] {
    return columns.filter((column) => !this.settled.has(column.index)).map((column) => column.index);
  }
}

/**
 * What a date-like heading really holds once the values are taken into
 * account: "Date" over 1..31 is a day of the month, "Day" over Mon..Sun is a weekday.
 */
function calendarTarget(kind: "date" | "day" | "month", content: ColumnContent | undefined): "date" | "day" | "month" | "weekday" {
  if (kind === "month") return "month";
  if (content === "weekday") return "weekday";
  if (content === "date") return "date";
  if (content === "day-number") return "day";
  if (content === "month") return "month";
  return kind;
}

/** Maps the date, day-of-month and month columns. */
function mapCalendarColumns(items: readonly Classified[], draft: MappingDraft): void {
  for (const item of items) {
    const { kind } = item.label;
    if (kind !== "date" && kind !== "day" && kind !== "month") continue;
    const target = calendarTarget(kind, item.column.content);
    if (target === "weekday") draft.ignore(item, "Weekday");
    else if (draft.mapping[target] === null) draft.assign(target, item);
    else draft.ignore(item, "Not needed: another column gives the date");
  }
}

/** Maps the begin and jamaat columns of one prayer. */
function mapPrayerColumns(prayer: PrayerKey, beginsField: TimeField, jamaatField: TimeField, items: readonly Classified[], draft: MappingDraft): void {
  const own = items.filter((item) => item.label.kind === "prayer" && item.label.prayer === prayer);
  let pool = own;

  if (prayer === "asr") {
    const first = own.find((item) => item.label.role !== "jamaat" && item.label.variant !== 2);
    const second = own.find((item) => item.label.role !== "jamaat" && item.label.variant === 2);
    if (first && second) {
      pool = own.filter((item) => item !== second);
      draft.ignore(second, "Asr by the second (Hanafi) calculation");
      draft.notes.push({
        severity: "info",
        code: "asr-two-columns",
        field: "asrBegins",
        message: `The file has two Asr begin times. ${describeColumn(first.column)} is used; to use ${describeColumn(second.column)} instead, change the column mapping.`,
      });
    }
  }

  const explicitBegins = pool.filter((item) => item.label.role === "begins").sort(byScore);
  const named = explicitBegins.filter((item) => item.label.score >= SCORE_BARE);
  const standIns = explicitBegins.filter((item) => item.label.score < SCORE_BARE);
  const explicitJamaat = pool.filter((item) => item.label.role === "jamaat").sort(byScore);
  const bare = pool.filter((item) => item.label.role === null);

  let begins: Classified | undefined = named[0];
  let jamaat: Classified | undefined = explicitJamaat[0];
  // A prayer name on its own is the begin time. Next to a sunset column and
  // without a jamaat column it is the jamaat time instead (sunset, then "Maghrib").
  if (!begins && (jamaat || standIns.length === 0)) begins = bare.shift();
  if (!begins) begins = standIns[0];
  let roleAssumed = false;
  if (!jamaat && begins && bare.length > 0) {
    jamaat = bare.shift();
    roleAssumed = true;
  }

  if (begins) draft.assign(beginsField, begins);
  if (jamaat) draft.assign(jamaatField, jamaat);
  if (roleAssumed && begins && jamaat) {
    draft.notes.push({
      severity: "warning",
      code: "column-role-assumed",
      field: jamaatField,
      message: `${describeColumn(begins.column)} was read as ${FIELD_LABELS[beginsField]} and ${describeColumn(jamaat.column)} as ${FIELD_LABELS[jamaatField]}, because the headings do not say which is the begin time and which the jamaat time. Check the column mapping.`,
    });
  }

  for (const loser of standIns) {
    if (loser !== begins) draft.ignore(loser, "Sunset");
  }
  for (const loser of named.slice(1)) {
    if (begins) draft.duplicate(beginsField, begins, loser);
  }
  for (const loser of explicitJamaat.slice(1)) {
    if (jamaat) draft.duplicate(jamaatField, jamaat, loser);
  }
  for (const loser of bare) {
    if (begins) draft.duplicate(beginsField, begins, loser);
  }
}

/** Maps the sunrise column; Ishraq only stands in when there is no real sunrise column. */
function mapSunrise(items: readonly Classified[], draft: MappingDraft): void {
  const [best, ...others] = items.filter((item) => item.label.kind === "sunrise").sort(byScore);
  if (!best) return;
  draft.assign("sunrise", best);
  for (const other of others) {
    if (other.label.score < SCORE_BARE) draft.ignore(other, "Ishraq");
    else draft.duplicate("sunrise", best, other);
  }
}

/** Maps up to three Jumu'ah columns: numbered headings take their slot, the rest fill the gaps in order. */
function mapJumuah(items: readonly Classified[], draft: MappingDraft): void {
  const columns = items.filter((item) => item.label.kind === "jumuah");
  const placed = new Set<Classified>();
  for (const item of columns) {
    const index = item.label.jumuahIndex;
    if (index === null || draft.mapping[JUMUAH_TARGETS[index - 1]] !== null) continue;
    draft.assign(JUMUAH_TARGETS[index - 1], item);
    placed.add(item);
  }
  for (const item of columns) {
    const free = JUMUAH_TARGETS.find((target) => draft.mapping[target] === null);
    if (free && !placed.has(item)) draft.assign(free, item);
  }
}

/**
 * Guesses the mapping for a table's columns and explains what was left out.
 * Each column is used at most once; where two columns want the same target
 * the better heading wins, then the leftmost column.
 */
export function analyseColumns(columns: readonly ColumnInput[]): ColumnAnalysis {
  const items: Classified[] = columns.map((column) => ({ column, label: classifyLabel(column.label) }));
  const draft = new MappingDraft();

  mapCalendarColumns(items, draft);
  for (const prayer of PRAYERS) mapPrayerColumns(prayer.key, prayer.beginsField, prayer.jamaatField, items, draft);
  mapSunrise(items, draft);
  mapJumuah(items, draft);

  const note = items.find((item) => item.label.kind === "note");
  if (note) draft.assign("note", note);
  for (const item of items) {
    if (item.label.kind === "ignored") draft.ignore(item, item.label.ignoredAs ?? "Not needed");
  }

  return { mapping: draft.mapping, ignored: draft.ignored, unmapped: draft.unmapped(columns), notes: draft.notes };
}

/**
 * Guesses which column feeds which part of the timetable from the headings
 * (and, when given, from what the values look like). Targets without a
 * matching column are null.
 */
export function guessMapping(columns: readonly ColumnInput[]): ColumnMapping {
  return analyseColumns(columns).mapping;
}

/**
 * Sorts the columns a mapping does not use into recognised-but-unneeded and
 * unknown ones. Used when the mapping comes from the admin rather than from
 * `analyseColumns`.
 */
export function listUnusedColumns(columns: readonly ColumnInput[], mapping: ColumnMapping): { ignored: IgnoredColumn[]; unmapped: number[] } {
  const used = new Set(Object.values(mapping).filter((index): index is number => index !== null));
  const ignored: IgnoredColumn[] = [];
  const unmapped: number[] = [];
  for (const column of columns) {
    if (used.has(column.index)) continue;
    const label = classifyLabel(column.label);
    const weekday = (label.kind === "day" || label.kind === "date") && column.content === "weekday";
    if (label.kind === "ignored") ignored.push({ index: column.index, label: column.label, reason: label.ignoredAs ?? "Not needed" });
    else if (weekday) ignored.push({ index: column.index, label: column.label, reason: "Weekday" });
    else unmapped.push(column.index);
  }
  return { ignored, unmapped };
}

/**
 * Points out what a mapping lacks: no jamaat columns at all, a prayer with
 * only one of its two columns, or a prayer that is missing altogether.
 * Each is reported once per mapping, never per row.
 */
export function reviewMapping(mapping: ColumnMapping): MappingNote[] {
  const withBegins = PRAYERS.filter((prayer) => mapping[prayer.beginsField] !== null);
  const withJamaat = PRAYERS.filter((prayer) => mapping[prayer.jamaatField] !== null);
  if (withBegins.length === 0 && withJamaat.length === 0) return [];

  const notes: MappingNote[] = [];
  if (withJamaat.length === 0) {
    notes.push({
      severity: "warning",
      code: "no-jamaat-columns",
      message: "No jamaat (congregation) columns were found, so only the begin times will be imported. Jamaat times already saved are kept.",
    });
  } else if (withBegins.length === 0) {
    notes.push({
      severity: "warning",
      code: "no-begins-columns",
      message: "No begin-time columns were found, so only the jamaat times will be imported. Begin times already saved are kept.",
    });
  } else {
    for (const prayer of PRAYERS) {
      const hasBegins = mapping[prayer.beginsField] !== null;
      const hasJamaat = mapping[prayer.jamaatField] !== null;
      if (hasBegins === hasJamaat) continue;
      notes.push({
        severity: "warning",
        code: "prayer-column-missing",
        field: hasBegins ? prayer.jamaatField : prayer.beginsField,
        message: hasBegins
          ? `${prayer.name} has a begin-time column but no jamaat column.`
          : `${prayer.name} has a jamaat column but no begin-time column.`,
      });
    }
  }

  const absent = PRAYERS.filter((prayer) => mapping[prayer.beginsField] === null && mapping[prayer.jamaatField] === null);
  if (absent.length > 0) {
    notes.push({
      severity: "warning",
      code: "prayer-not-found",
      message: `No column was found for ${formatList(absent.map((prayer) => prayer.name))}. If the file has one, choose it in the column mapping.`,
    });
  }
  return notes;
}
