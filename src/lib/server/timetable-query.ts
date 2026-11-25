/**
 * Reads the query string of `GET /api/timetable` into a date range. Pure, so
 * every rejection can be unit-tested without a server.
 */

import { z } from "zod";
import {
  MAX_TIMETABLE_RANGE_DAYS,
  boundedDateRangeSchema,
  dateStringSchema,
  monthStringSchema,
  type DateRange,
} from "@/lib/db/schemas";
import { firstDayOfMonth, lastDayOfMonth } from "@/lib/time";

/** A usable range, or the reason the query was refused. */
export type TimetableQueryResult =
  | { ok: true; range: DateRange }
  | { ok: false; message: string };

/** The parameters the endpoint understands; anything else is ignored. */
const PARAMETERS = ["month", "year", "from", "to"] as const;
type Parameter = (typeof PARAMETERS)[number];

const USAGE =
  "Ask for one of: month=YYYY-MM, year=YYYY, or from=YYYY-MM-DD together with to=YYYY-MM-DD.";

/** A calendar month, widened to its first and last day. */
const monthQuerySchema = monthStringSchema.transform(
  (month): DateRange => ({ from: firstDayOfMonth(month), to: lastDayOfMonth(month) }),
);

/** A four-digit year, widened to 1 January and 31 December. */
const yearQuerySchema = z
  .string()
  .regex(/^\d{4}$/, "Enter a year as YYYY")
  .transform((year): DateRange => ({ from: `${year}-01-01`, to: `${year}-12-31` }))
  // Year 0000 has the right shape but is not on the calendar.
  .refine((range) => dateStringSchema.safeParse(range.from).success, "Enter a year as YYYY");

/** An explicit range, capped so one request cannot ask for the whole table. */
const rangeQuerySchema = boundedDateRangeSchema(MAX_TIMETABLE_RANGE_DAYS);

/** Turns a schema result into the endpoint's answer, naming the parameter at fault. */
function toResult(
  parsed: { success: true; data: DateRange } | { success: false; error: z.ZodError },
  fallbackName: Parameter,
): TimetableQueryResult {
  if (parsed.success) return { ok: true, range: parsed.data };
  const issue = parsed.error.issues[0];
  const name = typeof issue.path[0] === "string" ? issue.path[0] : fallbackName;
  return { ok: false, message: `${name}: ${issue.message}.` };
}

/**
 * Validates the query of `GET /api/timetable`.
 *
 * Exactly one way of naming the dates is accepted: `month=YYYY-MM`,
 * `year=YYYY`, or `from` with `to` (both inclusive, at most
 * `MAX_TIMETABLE_RANGE_DAYS` days). Mixing them, repeating a parameter or
 * giving none is refused with a message that says what to send instead.
 */
export function parseTimetableQuery(params: URLSearchParams): TimetableQueryResult {
  const given = PARAMETERS.filter((name) => params.has(name));
  const repeated = given.find((name) => params.getAll(name).length > 1);
  if (repeated) {
    return { ok: false, message: `The "${repeated}" parameter was given more than once.` };
  }
  const value = (name: Parameter) => params.get(name) ?? "";
  const only = (...names: Parameter[]) =>
    given.length === names.length && names.every((name) => given.includes(name));

  if (only("month")) return toResult(monthQuerySchema.safeParse(value("month")), "month");
  if (only("year")) return toResult(yearQuerySchema.safeParse(value("year")), "year");
  if (only("from", "to")) {
    return toResult(rangeQuerySchema.safeParse({ from: value("from"), to: value("to") }), "from");
  }
  return { ok: false, message: USAGE };
}
