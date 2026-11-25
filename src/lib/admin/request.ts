/**
 * What every admin page's data component asks of the request it serves:
 * the gate at its top, and today's date.
 */

import { cache } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { serverNowMs } from "@/lib/server/clock";
import { loadSettings } from "@/lib/server/data";
import { mosqueToday } from "@/lib/server/display";
import type { DateString } from "@/lib/types";

/**
 * Waits for a real request, then lets the signed-in admin through and sends
 * everybody else to the sign-in page.
 *
 * `connection()` comes first on purpose. With Partial Prefetching, Next.js
 * renders a per-session shell in which cookies can already be read; without
 * the wait, the session check (which compares the token's expiry with the
 * clock) would run in that shell, and Next.js rightly objects to the clock
 * being read there. Waiting for the connection also keeps every piece of
 * private data out of anything that is rendered ahead of the request.
 */
export async function requireAdminRequest(): Promise<void> {
  await connection();
  await requireAdmin();
}

/**
 * Today's date on the mosque's wall clock, read once per request so every
 * part of a page agrees on it. The clock is only read once a real request
 * is being served.
 */
export const loadMosqueToday: () => Promise<DateString> = cache(async () => {
  await connection();
  const settings = await loadSettings();
  return mosqueToday(settings.timezone, serverNowMs());
});
