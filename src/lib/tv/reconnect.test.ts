import { describe, expect, it } from "vitest";
import type { StorageLike } from "@/lib/client/browser";
import {
  RECONNECT_BASE_MS,
  RECONNECT_JITTER,
  RECONNECT_MAX_MS,
  RECONNECT_STORAGE_KEY,
  clearReconnectAttempts,
  readReconnectAttempts,
  reconnectDelayMs,
  writeReconnectAttempts,
} from "./reconnect";

/** An in-memory storage that can be made to refuse reads or writes. */
function memoryStorage(options: { failReads?: boolean; failWrites?: boolean } = {}) {
  const items = new Map<string, string>();
  const storage: StorageLike = {
    getItem(key) {
      if (options.failReads) throw new Error("SecurityError");
      const value = items.get(key);
      return value === undefined ? null : value;
    },
    setItem(key, value) {
      if (options.failWrites) throw new Error("QuotaExceededError");
      items.set(key, value);
    },
    removeItem(key) {
      if (options.failWrites) throw new Error("QuotaExceededError");
      items.delete(key);
    },
  };
  return { storage, items };
}

describe("reconnectDelayMs", () => {
  it("starts at the base wait", () => {
    expect(reconnectDelayMs(0, 0)).toBe(RECONNECT_BASE_MS);
  });

  it("grows with every attempt up to the longest wait", () => {
    const waits = [0, 1, 2, 3, 4, 5, 6, 10, 50].map((attempt) => reconnectDelayMs(attempt, 0));
    for (let index = 1; index < waits.length; index++) {
      expect(waits[index]).toBeGreaterThanOrEqual(waits[index - 1]);
    }
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(waits[waits.length - 1]).toBe(RECONNECT_MAX_MS);
  });

  it("adds each screen's random share on top", () => {
    expect(reconnectDelayMs(0, 0.5)).toBe(RECONNECT_BASE_MS * (1 + RECONNECT_JITTER * 0.5));
    expect(reconnectDelayMs(0, 0.999)).toBeGreaterThan(reconnectDelayMs(0, 0.001));
    expect(reconnectDelayMs(50, 0.999)).toBeLessThanOrEqual(
      RECONNECT_MAX_MS * (1 + RECONNECT_JITTER),
    );
  });

  it("never waits less than the base, whatever it is given", () => {
    for (const attempt of [-3, Number.NaN, Number.NEGATIVE_INFINITY, 0.7]) {
      for (const random of [-1, Number.NaN, 0]) {
        expect(reconnectDelayMs(attempt, random)).toBe(RECONNECT_BASE_MS);
      }
    }
    expect(reconnectDelayMs(0, 7)).toBe(RECONNECT_BASE_MS * (1 + RECONNECT_JITTER));
  });

  it("returns whole milliseconds", () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      expect(Number.isInteger(reconnectDelayMs(attempt, 0.37))).toBe(true);
    }
  });
});

describe("reconnect attempts", () => {
  it("starts from zero", () => {
    expect(readReconnectAttempts(memoryStorage().storage)).toBe(0);
    expect(readReconnectAttempts(null)).toBe(0);
  });

  it("remembers and forgets the number of attempts", () => {
    const { storage, items } = memoryStorage();
    writeReconnectAttempts(storage, 3);
    expect(items.get(RECONNECT_STORAGE_KEY)).toBe("3");
    expect(readReconnectAttempts(storage)).toBe(3);
    clearReconnectAttempts(storage);
    expect(items.has(RECONNECT_STORAGE_KEY)).toBe(false);
    expect(readReconnectAttempts(storage)).toBe(0);
  });

  it("ignores a stored value that is not a count", () => {
    const { storage, items } = memoryStorage();
    for (const value of ["", "abc", "-2", "1.5", "1e3", "NaN"]) {
      items.set(RECONNECT_STORAGE_KEY, value);
      expect(readReconnectAttempts(storage)).toBe(0);
    }
  });

  it("keeps the count within bounds", () => {
    const { storage, items } = memoryStorage();
    writeReconnectAttempts(storage, 1_000_000);
    expect(readReconnectAttempts(storage)).toBe(100);
    writeReconnectAttempts(storage, -4);
    expect(items.get(RECONNECT_STORAGE_KEY)).toBe("0");
    writeReconnectAttempts(storage, Number.NaN);
    expect(items.get(RECONNECT_STORAGE_KEY)).toBe("0");
    writeReconnectAttempts(storage, 2.9);
    expect(items.get(RECONNECT_STORAGE_KEY)).toBe("2");
    items.set(RECONNECT_STORAGE_KEY, "99999");
    expect(readReconnectAttempts(storage)).toBe(100);
  });

  it("never throws when storage is missing or refuses", () => {
    const blocked = memoryStorage({ failReads: true, failWrites: true }).storage;
    expect(readReconnectAttempts(blocked)).toBe(0);
    expect(() => writeReconnectAttempts(blocked, 2)).not.toThrow();
    expect(() => clearReconnectAttempts(blocked)).not.toThrow();
    expect(() => writeReconnectAttempts(null, 2)).not.toThrow();
    expect(() => clearReconnectAttempts(null)).not.toThrow();
  });
});
