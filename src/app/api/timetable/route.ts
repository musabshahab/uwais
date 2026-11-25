import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { TimetableResponse } from "@/lib/server/api-types";
import { loadTimetableRange } from "@/lib/server/data";
import {
  corsPreflightResponse,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from "@/lib/server/http";
import { parseTimetableQuery } from "@/lib/server/timetable-query";

const ROUTE = "/api/timetable";

/**
 * `GET /api/timetable`: the stored timetable rows for a period, named as
 * `?month=YYYY-MM`, `?year=YYYY` or `?from=YYYY-MM-DD&to=YYYY-MM-DD` (at most
 * 400 days). Answers 400 with a JSON error for anything else. Readable from
 * any origin.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseTimetableQuery(new URL(request.url).searchParams);
  if (!query.ok) return errorResponse(400, "invalid_query", query.message, { cors: true });
  try {
    const { from, to, days, settings } = await loadTimetableRange(
      query.range.from,
      query.range.to,
    );
    const body: TimetableResponse = {
      from,
      to,
      days,
      settings: {
        timezone: settings.timezone,
        timeFormat: settings.timeFormat,
        mosqueName: settings.mosqueName,
      },
    };
    return jsonResponse(body, { cors: true });
  } catch (error) {
    unstable_rethrow(error);
    return internalErrorResponse(ROUTE, error, { cors: true });
  }
}

/** CORS preflight for `GET /api/timetable`. */
export function OPTIONS(): Response {
  return corsPreflightResponse();
}
