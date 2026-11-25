import { connection } from "next/server";
import type { VersionResponse } from "@/lib/server/api-types";
import { buildVersion } from "@/lib/server/display";
import { jsonResponse } from "@/lib/server/http";

/**
 * `GET /api/version`: the id of the running build and the server clock.
 * Screens poll it; a changed id tells them to reload after a deployment, and
 * the clock lets them correct a TV whose own clock has drifted. Touches no
 * database, so it keeps answering while the database is down.
 */
export async function GET(): Promise<Response> {
  // Wait for a real request: the clock must be read now, not while building.
  await connection();
  const body: VersionResponse = { version: buildVersion(), serverNow: Date.now() };
  return jsonResponse(body);
}
