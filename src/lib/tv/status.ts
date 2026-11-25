/**
 * Small decisions behind the status indicators of the TV display.
 */

import { FALLBACK_TIME_ZONE } from "@/lib/time";

/**
 * Whether a screen is showing times in the wrong zone: its browser does not
 * know the mosque's timezone and the time engine fell back to UTC.
 *
 * A browser that only knows the zone by its older name (`Europe/Kiev` for
 * `Europe/Kyiv`) shows the right time under a different label, and a mosque
 * that is configured for UTC is not falling back at all; neither is reported.
 * @param used       The zone the prayer state was computed in (`state.timezone`).
 * @param configured The mosque's zone (`settings.timezone`).
 */
export function isTimeZoneFallback(used: string, configured: string): boolean {
  return used !== configured && used === FALLBACK_TIME_ZONE;
}
