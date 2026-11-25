/**
 * Test doubles for the live display: fake responses, a storage that can be
 * made to fail, hand-fired browser events and sample payloads. Imported by
 * the unit tests in this folder and in `src/components/display` only; nothing
 * that ships uses it.
 */

import { DEFAULT_SETTINGS, type DisplayPayload, type PrayerDay } from "@/lib/types";
import type { StorageLike } from "./browser";
import { CACHE_HEADER, CACHE_HEADER_STALE, type ResponseLike, type Timers } from "./http";

/** Timers that go through the globals, so `vi.useFakeTimers()` controls them. */
export const globalTimers: Timers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** A hand-fired event: `listen` is what a module subscribes with, `fire` plays the event. */
export interface Signal {
  listen(listener: () => void): () => void;
  fire(): void;
  /** Number of listeners currently subscribed. */
  count(): number;
}

/** Creates a hand-fired event. */
export function createSignal(): Signal {
  const listeners = new Set<() => void>();
  return {
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire: () => listeners.forEach((listener) => listener()),
    count: () => listeners.size,
  };
}

/** A successful JSON response, optionally marked as served from the service worker's cache. */
export function jsonResponse(body: unknown, options: { cached?: boolean; status?: number } = {}): ResponseLike {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) =>
        options.cached && name.toLowerCase() === CACHE_HEADER.toLowerCase() ? CACHE_HEADER_STALE : null,
    },
    json: () => Promise.resolve(body),
  };
}

/** What a captive portal answers: status 200 with a page of HTML, which is not JSON. */
export function htmlResponse(): ResponseLike {
  return {
    ok: true,
    headers: { get: () => null },
    json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")),
  };
}

/** An in-memory `Storage` whose reads and writes can be made to throw. */
export class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  /** When true, `getItem` throws (storage blocked). */
  failReads = false;
  /** When true, `setItem` and `removeItem` throw (quota exceeded, read-only). */
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error("SecurityError");
    const value = this.items.get(key);
    return value === undefined ? null : value;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.items.delete(key);
  }
}

/** A timetable row with every time filled in, for the given date. */
export function makeDay(date: string, overrides: Partial<PrayerDay> = {}): PrayerDay {
  return {
    date,
    fajrBegins: "05:40",
    fajrJamaat: "06:15",
    sunrise: "07:30",
    dhuhrBegins: "11:55",
    dhuhrJamaat: "12:30",
    asrBegins: "14:05",
    asrJamaat: "14:30",
    maghribBegins: "16:02",
    maghribJamaat: "16:07",
    ishaBegins: "17:45",
    ishaJamaat: "19:30",
    jumuah: [],
    note: null,
    ...overrides,
  };
}

/** Wednesday 25 November 2026, 12:00:00 in London (which is on UTC in winter). */
export const SAMPLE_NOW_MS = Date.UTC(2026, 10, 25, 12, 0, 0);

/** A valid payload around {@link SAMPLE_NOW_MS}: yesterday to Friday, default settings. */
export function makePayload(overrides: Partial<DisplayPayload> = {}): DisplayPayload {
  return {
    version: "build-1",
    serverNow: SAMPLE_NOW_MS,
    settings: { ...DEFAULT_SETTINGS, tv: { ...DEFAULT_SETTINGS.tv }, jumuah: [...DEFAULT_SETTINGS.jumuah] },
    days: [
      makeDay("2026-11-24"),
      makeDay("2026-11-25"),
      makeDay("2026-11-26", { asrJamaat: "14:15" }),
      makeDay("2026-11-27"),
    ],
    announcements: [],
    coverage: { firstDate: "2026-01-01", lastDate: "2026-12-31", totalDays: 365 },
    ...overrides,
  };
}
