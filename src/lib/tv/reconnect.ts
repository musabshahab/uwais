/**
 * When the TV page has crashed into its error screen, it gets itself out
 * again: it waits, checks that the server answers, and reloads. The waits
 * grow so that a server that is down is not hammered, and each screen adds
 * its own random share so that a hall full of screens does not come back in
 * step and knock it over again.
 *
 * A reload starts a new page, which would start counting from nothing. The
 * number of attempts is therefore kept in `sessionStorage` and cleared only
 * when the display is up again, so a screen that keeps failing slows down
 * instead of reloading every few seconds for ever.
 */

import type { StorageLike } from "@/lib/client/browser";
import { MS_PER_SECOND } from "@/lib/time";

/** The first wait is at least this long. */
export const RECONNECT_BASE_MS = 8 * MS_PER_SECOND;

/** No wait is longer than this, before the random share. */
export const RECONNECT_MAX_MS = 60 * MS_PER_SECOND;

/** Each wait is this many times the one before. */
export const RECONNECT_GROWTH = 1.6;

/** The random share: up to this fraction is added on top of a wait. */
export const RECONNECT_JITTER = 0.5;

/**
 * How long to wait before attempt number `attempt` (0 for the first).
 * @param random A number from 0 (inclusive) to 1 (exclusive), such as `Math.random()`.
 * @returns Whole milliseconds, from the base wait up to one and a half times the longest.
 */
export function reconnectDelayMs(attempt: number, random: number): number {
  const step = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const share = Number.isFinite(random) ? Math.min(1, Math.max(0, random)) : 0;
  const wait = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(RECONNECT_GROWTH, step));
  return Math.round(wait * (1 + RECONNECT_JITTER * share));
}

/** `sessionStorage` key of the number of reloads tried so far. The suffix is the format version. */
export const RECONNECT_STORAGE_KEY = "uwais:tv-reconnect:v1";

/** Attempts beyond this change nothing: the wait has long reached its maximum. */
const MAX_COUNTED_ATTEMPTS = 100;

/**
 * How many reloads the error screen has tried since the display last worked.
 * Zero when nothing is stored, the value is not a count, or storage is blocked.
 */
export function readReconnectAttempts(storage: StorageLike | null): number {
  if (storage === null) return 0;
  try {
    const stored = storage.getItem(RECONNECT_STORAGE_KEY);
    if (stored === null || !/^\d+$/.test(stored)) return 0;
    return Math.min(MAX_COUNTED_ATTEMPTS, Number(stored));
  } catch {
    return 0;
  }
}

/** Remembers the number of reloads tried. A storage that refuses is ignored. */
export function writeReconnectAttempts(storage: StorageLike | null, attempts: number): void {
  if (storage === null) return;
  const count = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
  try {
    storage.setItem(RECONNECT_STORAGE_KEY, String(Math.min(MAX_COUNTED_ATTEMPTS, count)));
  } catch {
    // Without storage the next page simply starts from the first wait.
  }
}

/** Forgets the attempts: the display is running again. */
export function clearReconnectAttempts(storage: StorageLike | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(RECONNECT_STORAGE_KEY);
  } catch {
    // Nothing to clean up where storage cannot be written.
  }
}
