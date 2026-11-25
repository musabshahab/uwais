/**
 * Building action results: the failure shapes every action shares and the
 * translation of schema errors into messages a volunteer can act on.
 */

import type { z } from "zod";
import type { ActionErrorCode, ActionFailure } from "../types";

/** What a field is called in a message, by field name (`fajrBegins` to `Fajr Begins`). */
export type FieldLabels = Readonly<Record<string, string>>;

const SESSION_EXPIRED =
  "You are signed out, so nothing was saved. Sign in again in another tab, then try once more.";

const SERVER_PROBLEM =
  "Something went wrong on the server and nothing was changed. Please try again in a moment.";

const REQUIRED = "This field is required.";
const NOT_VALID = "This value is not valid.";
const NOT_AN_OPTION = "Choose one of the listed options.";
const UNREADABLE = "The details that were sent could not be read. Reload the page and try again.";

/** Builds a failure. `fieldErrors` is left out when there are none. */
export function failure(
  code: ActionErrorCode,
  error: string,
  fieldErrors: Record<string, string> = {},
): ActionFailure {
  return Object.keys(fieldErrors).length > 0
    ? { ok: false, code, error, fieldErrors }
    : { ok: false, code, error };
}

/** The answer to an action called without a valid admin session. */
export function unauthenticatedFailure(): ActionFailure {
  return failure("unauthenticated", SESSION_EXPIRED);
}

/**
 * The answer to an unexpected exception: the error goes to the server log,
 * the browser gets a generic sentence. Error messages can carry file paths
 * and SQL, so nothing of the error is put in the result.
 * @param action Name of the action, for the log line.
 */
export function unexpectedFailure(action: string, error: unknown): ActionFailure {
  console.error(`[action] ${action} failed`, error);
  return failure("failed", SERVER_PROBLEM);
}

/**
 * How zod itself words a wrong type or an unknown option. A message the
 * schema supplied never starts like this.
 */
const ZOD_WORDING = /^Invalid (input|option)\b/;

/**
 * Whether an issue is zod's own remark about the shape of a value, as opposed
 * to a check the schema worded. The code alone does not say: zod reports
 * 1.5 against `.int("Enter a whole number")` as a wrong type, with the
 * schema's message.
 */
function isStructural(issue: z.core.$ZodIssue): boolean {
  if (issue.code === "invalid_union") return true;
  return (
    (issue.code === "invalid_type" || issue.code === "invalid_value") &&
    ZOD_WORDING.test(issue.message)
  );
}

/**
 * The sentence to show for one schema issue.
 *
 * The schemas word their own checks ("Enter a time as HH:mm"), and those
 * messages are used as they are. What zod words itself is replaced:
 * a wrong type or an unknown option reads as developer jargon, and a failed
 * union ("a time, or blank") hides the useful message inside its branches.
 */
export function issueMessage(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_union") {
    const nested = issue.errors.flat().find((candidate) => !isStructural(candidate));
    return nested ? nested.message : NOT_VALID;
  }
  if (!isStructural(issue)) return issue.message;
  if (issue.code === "invalid_value") return NOT_AN_OPTION;
  // zod does not keep the offending value on the issue; its own wording is the only trace of it.
  return /received (undefined|null)$/.test(issue.message) ? REQUIRED : NOT_VALID;
}

/** The field name of an issue: its path joined with dots, or "" for the input as a whole. */
function issueKey(issue: z.core.$ZodIssue): string {
  return issue.path.map((part) => String(part)).join(".");
}

/** How a failed validation is reported. */
export interface ValidationOptions {
  /** Names for the fields, used in the summary sentence. */
  labels?: FieldLabels;
  /**
   * Turns a schema path into the name the caller knows the field by, for
   * forms whose field names differ from the schema's property paths.
   */
  rename?: (key: string) => string;
  /** Field messages found before the schema ran; they win over the schema's. */
  fieldErrors?: Readonly<Record<string, string>>;
}

/**
 * Turns a schema error into an `invalid` failure: one message per field (the
 * first the schema raised for it) and a summary sentence naming the first
 * problem, so a screen that only shows `error` still says something useful.
 */
export function validationFailure(
  error: z.ZodError | null,
  options: ValidationOptions = {},
): ActionFailure {
  const fieldErrors: Record<string, string> = { ...options.fieldErrors };
  let general: string | null = null;
  for (const issue of error?.issues ?? []) {
    const key = issueKey(issue);
    if (key === "") {
      // A wrong type at the top means the whole input was not the expected object.
      general = general ?? (issue.code === "invalid_type" ? UNREADABLE : issueMessage(issue));
      continue;
    }
    const name = options.rename ? options.rename(key) : key;
    if (!(name in fieldErrors)) fieldErrors[name] = issueMessage(issue);
  }

  const names = Object.keys(fieldErrors);
  if (names.length === 0) return failure("invalid", general ?? UNREADABLE);
  const first = names[0];
  // `jumuah.1.time` has no label of its own and reads under the one for `jumuah`.
  const label = options.labels?.[first] ?? options.labels?.[first.split(".")[0]];
  const lead = label ? `${label}: ${fieldErrors[first]}` : fieldErrors[first];
  const sentence = /[.!?]$/.test(lead) ? lead : `${lead}.`;
  const rest = names.length - 1;
  const more = rest === 0 ? "" : ` ${rest} more ${rest === 1 ? "field needs" : "fields need"} attention.`;
  return failure("invalid", `${sentence}${more}`, fieldErrors);
}
