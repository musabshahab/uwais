import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { toCsv, toXlsx } from "@/lib/import";
import { loadTimetableRange } from "@/lib/server/data";
import {
  corsPreflightResponse,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
} from "@/lib/server/http";
import {
  EXPORT_CONTENT_TYPES,
  attachmentDisposition,
  exportFileName,
  parseExportQuery,
  type ExportNotFoundBody,
} from "./export-request";

const ROUTE = "/api/timetable/export";

/**
 * `GET /api/timetable/export`: the stored timetable as a file download.
 *
 * `?format=csv|xlsx` (csv when left out) with the period named as
 * `?year=YYYY`, `?month=YYYY-MM` or `?from=YYYY-MM-DD&to=YYYY-MM-DD` (at most
 * 400 days). The file uses the importer's canonical columns, so it can be
 * edited and imported again as it is.
 *
 * Public, like the timetable itself. Answers 400 with a JSON error for a bad
 * query and 404 with a JSON error when the period holds no days.
 */
export async function GET(request: Request): Promise<Response> {
  // Wait for a real request: a prerendered download would freeze the timetable.
  await connection();
  const query = parseExportQuery(new URL(request.url).searchParams);
  if (!query.ok) return errorResponse(400, "invalid_query", query.message, { cors: true });
  try {
    const { days, settings } = await loadTimetableRange(query.range.from, query.range.to);
    if (days.length === 0) {
      const body: ExportNotFoundBody = {
        error: {
          code: "no_data",
          message: `No prayer times are saved between ${query.range.from} and ${query.range.to}.`,
        },
      };
      return jsonResponse(body, { status: 404, cors: true });
    }
    const file =
      query.format === "csv"
        ? // The byte-order mark is what makes Excel read accented and Arabic notes correctly.
          new TextEncoder().encode(toCsv(days, { bom: true }))
        : await toXlsx(days, { title: settings.mosqueName });
    // Copied because a Response body must sit on a plain ArrayBuffer, which the exporter's type does not promise.
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPES[query.format],
        "Content-Disposition": attachmentDisposition(exportFileName(query.range, query.format)),
        "Content-Length": String(file.byteLength),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        // Without this a script on another origin can read the file but not its name.
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    return internalErrorResponse(ROUTE, error, { cors: true });
  }
}

/** CORS preflight for `GET /api/timetable/export`. */
export function OPTIONS(): Response {
  return corsPreflightResponse();
}
