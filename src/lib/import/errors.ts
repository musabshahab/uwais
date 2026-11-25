/**
 * The one error type the importer throws. Reading a file can fail for reasons
 * the user must fix (wrong format, too big, damaged); those are reported with
 * a stable code and a message that can be shown to a volunteer as is.
 * Problems inside a readable file are never thrown: they come back as issues
 * in the `ImportResult`.
 */

/** Hard limits on uploaded files. Exceeding one is an `ImportFileError`, never a crash. */
export const IMPORT_LIMITS = {
  /** Largest accepted upload. */
  maxFileBytes: 5 * 1024 * 1024,
  maxSheets: 20,
  maxRowsPerSheet: 5000,
  maxColumnsPerSheet: 60,
  /**
   * Largest accepted size of an .xlsx once unzipped. A workbook with styling
   * on a million empty rows is tiny on disk and enormous in memory.
   */
  maxUnzippedBytes: 50 * 1024 * 1024,
} as const;

/** Why a file could not be read. */
export const IMPORT_FILE_ERROR_CODES = [
  "empty-file",
  "file-too-large",
  "unsupported-format",
  "unreadable-file",
  "too-many-sheets",
  "too-many-rows",
  "too-many-columns",
] as const;
/** One of `IMPORT_FILE_ERROR_CODES`: why a file was rejected before any row was read. */
export type ImportFileErrorCode = (typeof IMPORT_FILE_ERROR_CODES)[number];

/** Thrown by `readSpreadsheet` when the uploaded file cannot be used at all. */
export class ImportFileError extends Error {
  readonly code: ImportFileErrorCode;

  /**
   * @param code    Stable identifier of the failure.
   * @param message Friendly explanation, safe to show to the user.
   */
  constructor(code: ImportFileErrorCode, message: string) {
    super(message);
    this.name = "ImportFileError";
    this.code = code;
  }
}

/**
 * Whether a caught value is an `ImportFileError`. Checks the shape rather
 * than the prototype so it also works when the error crossed a bundle boundary.
 */
export function isImportFileError(error: unknown): error is ImportFileError {
  if (error instanceof ImportFileError) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return (
    candidate.name === "ImportFileError" &&
    typeof candidate.code === "string" &&
    (IMPORT_FILE_ERROR_CODES as readonly string[]).includes(candidate.code)
  );
}
