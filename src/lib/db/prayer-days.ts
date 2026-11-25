/**
 * The timetable repository: one row per calendar day in the mosque's
 * timezone. Reads return rows sorted by date; writes are validated first and
 * applied atomically.
 */

import type { InStatement, Row } from "@libsql/client";
import { listDates } from "@/lib/time";
import {
  TIME_FIELDS,
  type DateString,
  type PrayerDay,
  type TimeField,
  type TimetableCoverage,
} from "@/lib/types";
import { executeWrite, getDb, withWriteTransaction } from "./client";
import { readInteger, readRequiredText, readText, readTime, readTimeList, toTimestamp } from "./rows";
import {
  MAX_UPSERT_DAYS,
  boundedDateRangeSchema,
  dateRangeSchema,
  dateStringSchema,
  prayerDaysSchema,
  upsertModeSchema,
  type PrayerDayInput,
  type UpsertMode,
} from "./schemas";

/** Column of each time field, in the order of `TIME_FIELDS`. */
const TIME_COLUMNS: Readonly<Record<TimeField, string>> = {
  fajrBegins: "fajr_begins",
  fajrJamaat: "fajr_jamaat",
  sunrise: "sunrise",
  dhuhrBegins: "dhuhr_begins",
  dhuhrJamaat: "dhuhr_jamaat",
  asrBegins: "asr_begins",
  asrJamaat: "asr_jamaat",
  maghribBegins: "maghrib_begins",
  maghribJamaat: "maghrib_jamaat",
  ishaBegins: "isha_begins",
  ishaJamaat: "isha_jamaat",
};

const TIME_COLUMN_LIST = TIME_FIELDS.map((field) => TIME_COLUMNS[field]);

/** Columns written by an upsert, in parameter order. */
const WRITE_COLUMNS = ["date", ...TIME_COLUMN_LIST, "jumuah", "note", "updated_at"];

const SELECT_DAYS = `SELECT date, ${TIME_COLUMN_LIST.join(", ")}, jumuah, note FROM prayer_days`;

/**
 * True for a row that carries at least one time. A row of blanks says nothing
 * about its day, so coverage and gap detection treat it like a missing row,
 * exactly as the prayer state machine does.
 */
const HAS_TIMES = `COALESCE(${TIME_COLUMN_LIST.join(", ")}) IS NOT NULL`;

/**
 * Rows per INSERT statement. Fifteen bound values per row keeps a statement
 * far below SQLite's parameter limit while a year still fits in a handful of
 * round trips to a remote database.
 */
const ROWS_PER_STATEMENT = 50;

/** How `findMissingDates` decides a stored day is usable. */
function hasAnyTime(day: PrayerDay): boolean {
  return TIME_FIELDS.some((field) => day[field] !== null);
}

/** Maps a `prayer_days` row to the shared type, dropping malformed values. */
function toPrayerDay(row: Row): PrayerDay {
  return {
    date: readRequiredText(row.date),
    fajrBegins: readTime(row.fajr_begins),
    fajrJamaat: readTime(row.fajr_jamaat),
    sunrise: readTime(row.sunrise),
    dhuhrBegins: readTime(row.dhuhr_begins),
    dhuhrJamaat: readTime(row.dhuhr_jamaat),
    asrBegins: readTime(row.asr_begins),
    asrJamaat: readTime(row.asr_jamaat),
    maghribBegins: readTime(row.maghrib_begins),
    maghribJamaat: readTime(row.maghrib_jamaat),
    ishaBegins: readTime(row.isha_begins),
    ishaJamaat: readTime(row.isha_jamaat),
    jumuah: readTimeList(row.jumuah),
    note: readText(row.note),
  };
}

/** The timetable row for one date, or null when there is none. */
export async function getPrayerDay(date: DateString): Promise<PrayerDay | null> {
  const key = dateStringSchema.parse(date);
  const db = await getDb();
  const result = await db.execute({ sql: `${SELECT_DAYS} WHERE date = ?`, args: [key] });
  return result.rows.length === 0 ? null : toPrayerDay(result.rows[0]);
}

/**
 * The stored rows from `from` to `to`, both inclusive, sorted by date. Days
 * without a row are simply absent; a reversed range yields an empty list.
 */
export async function getPrayerDays(from: DateString, to: DateString): Promise<PrayerDay[]> {
  const first = dateStringSchema.parse(from);
  const last = dateStringSchema.parse(to);
  if (first > last) return [];
  const db = await getDb();
  const result = await db.execute({
    sql: `${SELECT_DAYS} WHERE date BETWEEN ? AND ? ORDER BY date`,
    args: [first, last],
  });
  return result.rows.map(toPrayerDay);
}

/** Every stored row, sorted by date. */
export async function getAllPrayerDays(): Promise<PrayerDay[]> {
  const db = await getDb();
  const result = await db.execute(`${SELECT_DAYS} ORDER BY date`);
  return result.rows.map(toPrayerDay);
}

/**
 * Combines an incoming day with the stored one.
 * - `replace`: the incoming day wins outright; blanks erase stored values.
 * - `merge`: only the values the incoming day actually carries are applied;
 *   its blanks, an empty Jumu'ah list and a missing note keep what is stored.
 *   This is what lets staff upload a sheet with just the new jamaat times
 *   without wiping the beginning times imported earlier.
 */
export function mergePrayerDay(
  existing: PrayerDay | null,
  incoming: PrayerDay,
  mode: UpsertMode,
): PrayerDay {
  if (existing === null || mode === "replace") return incoming;
  const merged: PrayerDay = {
    ...existing,
    jumuah: incoming.jumuah.length > 0 ? incoming.jumuah : existing.jumuah,
    note: incoming.note ?? existing.note,
  };
  for (const field of TIME_FIELDS) merged[field] = incoming[field] ?? existing[field];
  return merged;
}

/** Whether two days hold exactly the same values. */
export function prayerDaysEqual(a: PrayerDay, b: PrayerDay): boolean {
  return (
    a.date === b.date &&
    a.note === b.note &&
    a.jumuah.length === b.jumuah.length &&
    a.jumuah.every((time, index) => time === b.jumuah[index]) &&
    TIME_FIELDS.every((field) => a[field] === b[field])
  );
}

/** What an upsert did, or would do. */
export interface UpsertSummary {
  /** Days that had no row before. */
  added: number;
  /** Days whose row changed. */
  updated: number;
  /** Days that were already stored with the same values; these are not rewritten. */
  unchanged: number;
  /** Earliest date in the batch, or null for an empty batch. */
  firstDate: DateString | null;
  /** Latest date in the batch, or null for an empty batch. */
  lastDate: DateString | null;
}

/** The outcome of comparing a batch with the stored rows. */
export interface UpsertPlan extends UpsertSummary {
  /** The rows to write: new and changed days only, sorted by date. */
  writes: PrayerDay[];
}

/**
 * Works out what a batch changes, without touching the database. When the
 * batch names a date more than once the entries are applied in order, so the
 * last one wins (or, in `merge` mode, they accumulate).
 *
 * @param existing Stored rows covering at least the dates in `incoming`.
 * @param incoming Validated days to apply.
 * @param mode     See `mergePrayerDay`.
 */
export function planUpsert(
  existing: readonly PrayerDay[],
  incoming: readonly PrayerDay[],
  mode: UpsertMode,
): UpsertPlan {
  const stored = new Map<DateString, PrayerDay>();
  for (const day of existing) stored.set(day.date, day);

  const staged = new Map<DateString, PrayerDay>();
  for (const day of incoming) {
    const current = staged.get(day.date) ?? stored.get(day.date) ?? null;
    staged.set(day.date, mergePrayerDay(current, day, mode));
  }

  const plan: UpsertPlan = {
    added: 0,
    updated: 0,
    unchanged: 0,
    firstDate: null,
    lastDate: null,
    writes: [],
  };
  const results = Array.from(staged.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const result of results) {
    const before = stored.get(result.date);
    const unchanged = before !== undefined && prayerDaysEqual(before, result);
    if (before === undefined) plan.added++;
    else if (unchanged) plan.unchanged++;
    else plan.updated++;
    if (!unchanged) plan.writes.push(result);
  }
  if (results.length > 0) {
    plan.firstDate = results[0].date;
    plan.lastDate = results[results.length - 1].date;
  }
  return plan;
}

/** The INSERT ... ON CONFLICT statements that store `days`, in chunks. */
function buildUpsertStatements(days: readonly PrayerDay[], updatedAt: string): InStatement[] {
  const rowPlaceholders = `(${WRITE_COLUMNS.map(() => "?").join(", ")})`;
  const assignments = WRITE_COLUMNS.filter((column) => column !== "date")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  const statements: InStatement[] = [];
  for (let start = 0; start < days.length; start += ROWS_PER_STATEMENT) {
    const chunk = days.slice(start, start + ROWS_PER_STATEMENT);
    const args: (string | null)[] = [];
    for (const day of chunk) {
      args.push(day.date);
      for (const field of TIME_FIELDS) args.push(day[field]);
      args.push(JSON.stringify(day.jumuah), day.note, updatedAt);
    }
    statements.push({
      sql:
        `INSERT INTO prayer_days (${WRITE_COLUMNS.join(", ")}) VALUES ` +
        `${chunk.map(() => rowPlaceholders).join(", ")} ` +
        `ON CONFLICT(date) DO UPDATE SET ${assignments}`,
      args,
    });
  }
  return statements;
}

/** Options of `upsertPrayerDays` and `previewUpsertPrayerDays`. */
export interface UpsertOptions {
  /**
   * `merge` (default) keeps stored values wherever the incoming day is blank;
   * `replace` overwrites the whole day. See `mergePrayerDay`.
   */
  mode?: UpsertMode;
  /** Clock for the `updated_at` column, epoch milliseconds. Defaults to now. */
  nowMs?: number;
}

/** Drops the internal list of rows from a plan. */
function summarise(plan: UpsertPlan): UpsertSummary {
  return {
    added: plan.added,
    updated: plan.updated,
    unchanged: plan.unchanged,
    firstDate: plan.firstDate,
    lastDate: plan.lastDate,
  };
}

/**
 * Adds or amends timetable days. The whole batch is one transaction: either
 * every day is stored or, if anything fails, none is. Rows that would not
 * change are left untouched.
 *
 * @param days At most `MAX_UPSERT_DAYS` days; only `date` is required on each.
 * @returns Counts for the import log.
 * @throws ZodError when a day is invalid or the batch is too large.
 */
export async function upsertPrayerDays(
  days: readonly PrayerDayInput[],
  options: UpsertOptions = {},
): Promise<UpsertSummary> {
  const incoming: PrayerDay[] = prayerDaysSchema.parse(days);
  const mode = upsertModeSchema.parse(options.mode ?? "merge");
  if (incoming.length === 0) return summarise(planUpsert([], [], mode));

  const dates = incoming.map((day) => day.date).sort();
  const updatedAt = toTimestamp(options.nowMs ?? Date.now());
  // The comparison is read inside the write transaction, so the stored rows
  // cannot change between the read and the write.
  return withWriteTransaction(async (transaction) => {
    const stored = await transaction.execute({
      sql: `${SELECT_DAYS} WHERE date BETWEEN ? AND ?`,
      args: [dates[0], dates[dates.length - 1]],
    });
    const plan = planUpsert(stored.rows.map(toPrayerDay), incoming, mode);
    const statements = buildUpsertStatements(plan.writes, updatedAt);
    if (statements.length > 0) await transaction.batch(statements);
    return summarise(plan);
  });
}

/**
 * What `upsertPrayerDays` would do with the same arguments, without writing
 * anything. Lets the import screen show "12 new, 3 changed" before staff confirm.
 * @throws ZodError when a day is invalid or the batch is too large.
 */
export async function previewUpsertPrayerDays(
  days: readonly PrayerDayInput[],
  options: Pick<UpsertOptions, "mode"> = {},
): Promise<UpsertSummary> {
  const incoming: PrayerDay[] = prayerDaysSchema.parse(days);
  const mode = upsertModeSchema.parse(options.mode ?? "merge");
  if (incoming.length === 0) return summarise(planUpsert([], [], mode));
  const dates = incoming.map((day) => day.date).sort();
  const stored = await getPrayerDays(dates[0], dates[dates.length - 1]);
  return summarise(planUpsert(stored, incoming, mode));
}

/**
 * Deletes the rows from `from` to `to`, both inclusive.
 * @returns The number of rows deleted.
 * @throws ZodError when a date is invalid or the range is reversed.
 */
export async function deletePrayerDays(from: DateString, to: DateString): Promise<number> {
  const range = dateRangeSchema.parse({ from, to });
  const result = await executeWrite({
    sql: "DELETE FROM prayer_days WHERE date BETWEEN ? AND ?",
    args: [range.from, range.to],
  });
  return result.rowsAffected;
}

/**
 * First and last day that have times, and how many such days there are.
 * Rows without a single time are not counted.
 */
export async function getCoverage(): Promise<TimetableCoverage> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT MIN(date) AS first_date, MAX(date) AS last_date, COUNT(*) AS total_days
     FROM prayer_days WHERE ${HAS_TIMES}`,
  );
  const row = result.rows[0];
  return {
    firstDate: readText(row.first_date),
    lastDate: readText(row.last_date),
    totalDays: readInteger(row.total_days),
  };
}

/**
 * The dates from `from` to `to`, both inclusive, that have no usable row:
 * either no row at all or a row without a single time. Sorted ascending.
 * @throws ZodError when a date is invalid, the range is reversed or it spans
 *         more than `MAX_UPSERT_DAYS` days.
 */
export async function findMissingDates(from: DateString, to: DateString): Promise<DateString[]> {
  const range = boundedDateRangeSchema(MAX_UPSERT_DAYS).parse({ from, to });
  const stored = await getPrayerDays(range.from, range.to);
  const covered = new Set(stored.filter(hasAnyTime).map((day) => day.date));
  return listDates(range.from, range.to).filter((date) => !covered.has(date));
}
