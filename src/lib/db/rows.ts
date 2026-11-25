/**
 * Small readers that turn raw column values into the types the app uses.
 * They are deliberately forgiving: a database edited by hand must not be
 * able to crash a page or put a malformed time on a screen.
 */

import type { Transaction, Value } from "@libsql/client";
import { isValidDateString, isValidTimeString } from "@/lib/time";
import type { DateString, TimeString } from "@/lib/types";

/**
 * Anything that can run one statement: the client or an open transaction.
 * Lets a query helper be used both inside and outside a transaction.
 */
export type Executor = Pick<Transaction, "execute">;

/** A text column, or null for NULL and for anything that is not text. */
export function readText(value: Value | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/** A NOT NULL text column; non-text values read as the empty string. */
export function readRequiredText(value: Value | undefined): string {
  return typeof value === "string" ? value : "";
}

/** An integer column; NULL and non-numeric values read as 0. */
export function readInteger(value: Value | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value === "bigint") return Number(value);
  return 0;
}

/** A 0/1 flag column. */
export function readFlag(value: Value | undefined): boolean {
  return readInteger(value) !== 0;
}

/** An `HH:mm` column; NULL and malformed values read as null. */
export function readTime(value: Value | undefined): TimeString | null {
  return isValidTimeString(value) ? value : null;
}

/** A `YYYY-MM-DD` column; NULL and malformed values read as null. */
export function readDate(value: Value | undefined): DateString | null {
  return isValidDateString(value) ? value : null;
}

/** The `HH:mm` entries of a JSON array column; anything else reads as an empty list. */
export function readTimeList(value: Value | undefined): TimeString[] {
  if (typeof value !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isValidTimeString) : [];
}

/** The ISO-8601 UTC timestamp stored in `created_at` / `updated_at` columns. */
export function toTimestamp(nowMs: number): string {
  return new Date(nowMs).toISOString();
}
