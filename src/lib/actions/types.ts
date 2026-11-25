/**
 * The contract between the Server Actions and the admin screens: every
 * result type an action returns, the names of the form fields it reads and
 * the limits it applies.
 *
 * This file has no server-only dependencies, so client components import
 * their types and constants from here and the actions themselves from the
 * `"use server"` files next to it (`auth`, `import`, `timetable`, `settings`,
 * `announcements`).
 */

import { NEXT_PARAM } from "@/lib/auth/paths";
import type { DayFinding } from "@/lib/import/checks";
import type {
  ColumnMapping,
  DateOrder,
  FieldChange,
  ImportIssue,
  ImportRow,
  ImportSummary,
  MergeField,
  SheetReport,
  SpreadsheetFormat,
} from "@/lib/import/types";
import type { Announcement, DateString, PrayerDay, SiteSettings, TimeField } from "@/lib/types";

/**
 * Why an action did not do what was asked.
 *
 * - `unauthenticated`: nobody is signed in (the session expired). Offer a link
 *   to the sign-in page; what the user typed is still on their screen.
 * - `invalid`: the input was refused. `fieldErrors` says which fields, when
 *   the problem belongs to particular fields.
 * - `not-found`: the thing to change no longer exists.
 * - `confirmation-required`: the action is destructive or has warnings and
 *   was called without the flag that confirms it. Ask, then call it again.
 * - `failed`: something went wrong on the server. The details are in the
 *   server log, never in the result.
 */
export type ActionErrorCode =
  | "unauthenticated"
  | "invalid"
  | "not-found"
  | "confirmation-required"
  | "failed";

/** An action that changed nothing. */
export interface ActionFailure {
  ok: false;
  code: ActionErrorCode;
  /** One or two plain-English sentences that can be shown to a volunteer as they are. */
  error: string;
  /**
   * Message per field, keyed by the field's name: the form field name for
   * `FormData` input, the property path joined with dots for object input
   * (`tv.theme`, `jumuah.1.time`).
   */
  fieldErrors?: Record<string, string>;
}

/** What every action returns: its data with `ok: true`, or an {@link ActionFailure}. */
export type ActionResult<T extends object = Record<never, never>> = ({ ok: true } & T) | ActionFailure;

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

/** Names of the sign-in form's fields. */
export const LOGIN_FORM_FIELDS = {
  /** The admin password. */
  password: "password",
  /** Hidden field carrying the `?next=` path to return to after signing in. */
  next: NEXT_PARAM,
} as const;

/** State of the sign-in form, for `useActionState`. */
export interface LoginState {
  /** Why the last attempt failed; null before the first attempt. */
  error: string | null;
  /** Seconds until another attempt is allowed, when sign-in is locked after repeated failures. */
  retryAfterSeconds?: number;
}

/** The sign-in form before anything has been submitted. */
export const INITIAL_LOGIN_STATE: LoginState = { error: null };

// ---------------------------------------------------------------------------
// Importing a timetable file
// ---------------------------------------------------------------------------

/** Names of the import form's fields, shared by the preview and the commit. */
export const IMPORT_FORM_FIELDS = {
  /** The CSV or Excel file (`File`). */
  file: "file",
  /** Optional JSON text: {@link ImportMappingOverrides}. */
  mapping: "mapping",
  /** Optional four-digit year for files whose dates carry none. */
  year: "year",
  /** Optional {@link ImportDateOrderOption}; `auto` when left out. */
  dateOrder: "dateOrder",
  /** Optional flag (`true`): read an empty jamaat cell as "same as the row above". */
  fillDown: "fillDown",
  /** Commit only: `true` once the user has confirmed the warnings shown in the preview. */
  acknowledgeWarnings: "acknowledgeWarnings",
} as const;

/** Earliest year the import form accepts for files without a year. */
export const MIN_IMPORT_YEAR = 2000;
/** Latest year the import form accepts for files without a year. */
export const MAX_IMPORT_YEAR = 2100;

/** Most spreadsheet rows a preview returns in full; `rowsTruncated` says when more exist. */
export const IMPORT_PREVIEW_ROW_LIMIT = 1200;
/** Most issues a preview returns; problems are kept in preference to remarks. */
export const IMPORT_PREVIEW_ISSUE_LIMIT = 2000;
/** Most changed days a preview lists field by field. */
export const IMPORT_PREVIEW_CHANGE_LIMIT = 1200;

/** How numeric dates such as 01/02/2027 are to be read: worked out from the file, or forced. */
export type ImportDateOrderOption = "auto" | DateOrder;

/**
 * Column choices to send back with the next preview or commit, keyed by sheet
 * name (`*` applies to every sheet without an entry of its own). Start from
 * `ImportPreviewData.mapping`, change what the user corrected and send the
 * whole object as JSON in the `mapping` field. A sheet with an entry uses
 * only that entry: targets that are missing or null are left unmapped.
 */
export type ImportMappingOverrides = Record<string, Partial<ColumnMapping>>;

/** The uploaded file as the server saw it. */
export interface ImportFileInfo {
  /** File name without any folder. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** What the file really is, judged by its content rather than its name. */
  format: SpreadsheetFormat;
}

/** The choices a preview was made with, to pre-fill the form for the next attempt. */
export interface ImportOptionsUsed {
  /** The year supplied for dates without one, or null when the file had to provide it. */
  year: number | null;
  dateOrder: ImportDateOrderOption;
  fillDown: boolean;
}

/** What saving an imported day does to the stored timetable. */
export type ImportDayEffect = "added" | "updated" | "unchanged";

/** A spreadsheet row with what importing it would do. */
export interface ImportPreviewRow extends ImportRow {
  /** Null for rows that are not imported (errors, rows without times, replaced duplicates). */
  effect: ImportDayEffect | null;
}

/** A stored day the import would change. */
export interface ImportDayChange {
  date: DateString;
  /** Each field that changes, with its stored value (`from`) and its new one (`to`). */
  fields: FieldChange[];
}

/** What an import would do to the stored timetable. */
export interface ImportDiffSummary {
  /** Days that are not stored yet. */
  added: number;
  /** Stored days that change. */
  updated: number;
  /** Days that are already stored exactly as the file has them. */
  unchanged: number;
  /** The changing days in date order, at most `IMPORT_PREVIEW_CHANGE_LIMIT` of them. */
  changes: ImportDayChange[];
  /** True when `updated` is larger than the number of entries in `changes`. */
  changesTruncated: boolean;
}

/** Number of issues at each severity, counted before any truncation. */
export interface ImportIssueCounts {
  error: number;
  warning: number;
  info: number;
}

/** Everything the import screen shows before anything is saved. */
export interface ImportPreviewData {
  file: ImportFileInfo;
  options: ImportOptionsUsed;
  /** How each sheet was understood: its columns with sample values and the mapping used. */
  sheets: SheetReport[];
  /** The mapping used per sheet: the starting point for {@link ImportMappingOverrides}. */
  mapping: Record<string, ColumnMapping>;
  /** The parts of a day the file provides. Everything else keeps its stored value. */
  mappedFields: MergeField[];
  /** The first `IMPORT_PREVIEW_ROW_LIMIT` rows in file order. */
  rows: ImportPreviewRow[];
  /** Number of rows in the file, which can exceed `rows.length`. */
  totalRows: number;
  rowsTruncated: boolean;
  /** Issues in file order: whole-file remarks first, then by sheet and row. */
  issues: ImportIssue[];
  issueCounts: ImportIssueCounts;
  issuesTruncated: boolean;
  summary: ImportSummary;
  diff: ImportDiffSummary;
  /** False when the file holds no day that can be saved. */
  canCommit: boolean;
  /**
   * True when the file can be imported but has warnings, or rows or sheets
   * that will be left out: the commit then needs `acknowledgeWarnings=true`.
   */
  requiresAcknowledgement: boolean;
}

/** Result of `previewImportAction`. */
export type ImportPreview = ActionResult<ImportPreviewData>;

/** What a finished import did. */
export interface ImportCommitData {
  /** Days that were new. */
  added: number;
  /** Stored days that changed. */
  updated: number;
  /** Days that were already stored with the same values. */
  unchanged: number;
  firstDate: DateString;
  lastDate: DateString;
  /** Number of warnings the file had (they were acknowledged). */
  warnings: number;
  /** Name under which the import appears in the import history. */
  fileName: string;
}

/** Result of `commitImportAction`. */
export type ImportCommitResult = ActionResult<ImportCommitData>;

// ---------------------------------------------------------------------------
// Editing the timetable by hand
// ---------------------------------------------------------------------------

/** Something about a saved day that deserves a second look. Never blocks the save. */
export interface DayWarning {
  code: DayFinding["code"] | "jumuah-not-friday";
  /** The field the warning is about. */
  field: TimeField | "jumuah";
  message: string;
}

/** What `saveDayAction` did. */
export interface SaveDayData {
  /** The day as it is now stored. */
  day: PrayerDay;
  /** `added` for a new date, `updated` for a change, `unchanged` when nothing differed. */
  outcome: ImportDayEffect;
  /** Plausibility warnings (times out of order, a jamaat before its prayer begins). */
  warnings: DayWarning[];
}

/** Result of `saveDayAction`. */
export type SaveDayResult = ActionResult<SaveDayData>;

/** Longest stretch of days one `deleteDaysAction` call removes: a leap year. */
export const MAX_DELETE_RANGE_DAYS = 366;

/** Input of `deleteDaysAction`. */
export interface DeleteDaysInput {
  /** First day to delete, `YYYY-MM-DD`. */
  from: DateString;
  /** Last day to delete, inclusive. Use the same date as `from` for a single day. */
  to: DateString;
  /** Must be `true`. Without it the action only reports how many days it would delete. */
  confirm?: boolean;
}

/** What `deleteDaysAction` did. */
export interface DeleteDaysData {
  /** Number of days removed. */
  deleted: number;
  from: DateString;
  to: DateString;
}

/** Result of `deleteDaysAction`. */
export type DeleteDaysResult = ActionResult<DeleteDaysData>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Result of `saveSettingsAction`: the complete settings as they are now stored. */
export type SaveSettingsResult = ActionResult<{ settings: SiteSettings }>;

/** State of the settings form, for `useActionState`; null before the first save. */
export type SaveSettingsState = SaveSettingsResult | null;

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** Result of creating or updating an announcement: the stored announcement. */
export type AnnouncementResult = ActionResult<{ announcement: Announcement }>;

/** Result of deleting an announcement. */
export type DeleteAnnouncementResult = ActionResult<{ id: number }>;
