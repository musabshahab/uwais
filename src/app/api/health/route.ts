import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { pingDatabase } from "@/lib/db";
import type { HealthResponse } from "@/lib/server/api-types";
import { jsonResponse } from "@/lib/server/http";

/**
 * `GET /api/health`: readiness probe for hosting platforms, the Docker
 * health check and the end-to-end test runner. 200 once the database has been
 * opened, migrated and has answered a query; 503 while it cannot be reached.
 */
export async function GET(): Promise<Response> {
  // Wait for a real request: a health answer worked out while building says nothing.
  await connection();
  try {
    await pingDatabase();
    const healthy: HealthResponse = { ok: true, db: true };
    return jsonResponse(healthy);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[api] /api/health: the database check failed", error);
    const unhealthy: HealthResponse = { ok: false, db: false };
    return jsonResponse(unhealthy, { status: 503 });
  }
}
