/**
 * The import log: one row per finished timetable import, so staff can see
 * what was uploaded, when, and what it changed.
 */

import type { Row } from "@libsql/client";
import type { DateString } from "@/lib/types";
import { executeWrite, getDb } from "./client";
import { readDate, readInteger, readRequiredText, toTimestamp } from "./rows";
import { importLogInputSchema, importLogLimitSchema, type ImportLogInput } from "./schemas";

/** One finished import. */
export interface ImportLogEntry {
  id: number;
  /** When the import finished, ISO-8601 UTC. */
  createdAt: string;
  /** Name of the uploaded file, without any path. */
  fileName: string;
  /** Days that were new. */
  added: number;
  /** Days that changed. */
  updated: number;
  /** Days that were already stored with the same values. */
  unchanged: number;
  /** Earliest date in the file, or null when it held no days. */
  firstDate: DateString | null;
  /** Latest date in the file, or null when it held no days. */
  lastDate: DateString | null;
  /** Number of warnings the importer raised (skipped rows, odd values). */
  warnings: number;
}

/** How many entries `listImportLog` returns when no limit is given. */
export const DEFAULT_IMPORT_LOG_LIMIT = 20;

/** Maps an `import_log` row to an entry. */
function toImportLogEntry(row: Row): ImportLogEntry {
  return {
    id: readInteger(row.id),
    createdAt: readRequiredText(row.created_at),
    fileName: readRequiredText(row.file_name),
    added: readInteger(row.added),
    updated: readInteger(row.updated),
    unchanged: readInteger(row.unchanged),
    firstDate: readDate(row.first_date),
    lastDate: readDate(row.last_date),
    warnings: readInteger(row.warnings),
  };
}

/**
 * Records a finished import and returns the stored entry.
 * @param nowMs Clock for `createdAt`, epoch milliseconds.
 * @throws ZodError when the entry is invalid (counts must be whole and not negative).
 */
export async function addImportLog(
  entry: ImportLogInput,
  nowMs: number = Date.now(),
): Promise<ImportLogEntry> {
  const fields = importLogInputSchema.parse(entry);
  const createdAt = toTimestamp(nowMs);
  const result = await executeWrite({
    sql:
      "INSERT INTO import_log (created_at, file_name, added, updated, unchanged, first_date, " +
      "last_date, warnings) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    args: [
      createdAt,
      fields.fileName,
      fields.added,
      fields.updated,
      fields.unchanged,
      fields.firstDate,
      fields.lastDate,
      fields.warnings,
    ],
  });
  return { id: readInteger(result.rows[0].id), createdAt, ...fields };
}

/**
 * The most recent imports, newest first.
 * @param limit How many to return, 1 to `MAX_IMPORT_LOG_LIMIT`.
 * @throws ZodError when the limit is out of range.
 */
export async function listImportLog(
  limit: number = DEFAULT_IMPORT_LOG_LIMIT,
): Promise<ImportLogEntry[]> {
  const count = importLogLimitSchema.parse(limit);
  const db = await getDb();
  const result = await db.execute({
    sql:
      "SELECT id, created_at, file_name, added, updated, unchanged, first_date, last_date, " +
      "warnings FROM import_log ORDER BY id DESC LIMIT ?",
    args: [count],
  });
  return result.rows.map(toImportLogEntry);
}
