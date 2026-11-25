"use server";

/**
 * Importing a timetable file: preview first, then commit. Both read the
 * fields named in `IMPORT_FORM_FIELDS` (`@/lib/actions/types`).
 */

import { commitImportForm, previewImportForm } from "./core/import";
import { denyUnlessAdmin, runMutation, runQuery } from "./guard";
import type { ImportCommitResult, ImportPreview } from "./types";

/**
 * Reads an uploaded CSV or Excel file and reports, without saving anything,
 * how it was understood: the sheets and columns found and the mapping used,
 * the outcome of every row, every problem and warning, and what importing
 * would add to and change in the stored timetable.
 *
 * @param formData `file`, and optionally `mapping`, `year`, `dateOrder`, `fillDown`.
 */
export async function previewImportAction(formData: FormData): Promise<ImportPreview> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runQuery("previewImport", () => previewImportForm(formData));
}

/**
 * Imports an uploaded file. The file is read and checked again on the server
 * (rows are never accepted from the browser), merged with the stored days so
 * that columns the file does not have keep their values, and saved in one
 * transaction. The import is recorded in the import history.
 *
 * Refused with `invalid` when the file holds no usable day, and with
 * `confirmation-required` when it has problems or warnings and
 * `acknowledgeWarnings` is not `true`.
 *
 * @param formData The same fields as the preview, plus `acknowledgeWarnings`.
 */
export async function commitImportAction(formData: FormData): Promise<ImportCommitResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runMutation("commitImport", () => commitImportForm(formData));
}
