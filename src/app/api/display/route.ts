import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { loadDisplayPayload } from "@/lib/server/data";
import { corsPreflightResponse, internalErrorResponse, jsonResponse } from "@/lib/server/http";

const ROUTE = "/api/display";

/**
 * `GET /api/display`: the `DisplayPayload` the public pages, the installed
 * app and the TV screen refresh themselves from. Takes no parameters, is
 * built fresh for every request and may be read from any origin (signage
 * players and community apps embed it).
 */
export async function GET(): Promise<Response> {
  // Wait for a real request: a prerendered payload would freeze the clock and the timetable.
  await connection();
  try {
    return jsonResponse(await loadDisplayPayload(), { cors: true });
  } catch (error) {
    unstable_rethrow(error);
    return internalErrorResponse(ROUTE, error, { cors: true });
  }
}

/** CORS preflight for `GET /api/display`. */
export function OPTIONS(): Response {
  return corsPreflightResponse();
}
