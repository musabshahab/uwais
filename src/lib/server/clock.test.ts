import { afterEach, describe, expect, it, vi } from "vitest";
import { FAKE_NOW_ENV, fakeClockOffset, resetServerClockForTests, serverNowMs } from "./clock";

const START = Date.UTC(2026, 10, 25, 9, 30, 0);

describe("fakeClockOffset", () => {
  it("is zero when the variable is missing or blank", () => {
    expect(fakeClockOffset(undefined, START)).toBe(0);
    expect(fakeClockOffset("", START)).toBe(0);
    expect(fakeClockOffset("   ", START)).toBe(0);
  });

  it("measures from the start time to the given instant", () => {
    expect(fakeClockOffset("2026-11-25T09:30:00Z", START)).toBe(0);
    expect(fakeClockOffset("2026-11-25T10:30:00Z", START)).toBe(3_600_000);
    expect(fakeClockOffset("2026-11-25T08:30:00Z", START)).toBe(-3_600_000);
  });

  it("accepts numeric offsets, with or without a colon", () => {
    const expected = Date.UTC(2027, 2, 28, 0, 30, 0) - START;
    expect(fakeClockOffset("2027-03-28T01:30:00+01:00", START)).toBe(expected);
    expect(fakeClockOffset("2027-03-28T01:30:00+0100", START)).toBe(expected);
    expect(fakeClockOffset(" 2027-03-27T19:30:00-05:00 ", START)).toBe(expected);
  });

  it("rejects an instant without an offset, which would depend on the server's timezone", () => {
    expect(() => fakeClockOffset("2027-03-12T12:00:00", START)).toThrow(FAKE_NOW_ENV);
    expect(() => fakeClockOffset("2027-03-12", START)).toThrow(FAKE_NOW_ENV);
  });

  it("rejects text that is not a date", () => {
    expect(() => fakeClockOffset("tomorrow", START)).toThrow(/tomorrow/);
    expect(() => fakeClockOffset("2027-13-45T99:00:00Z", START)).toThrow(FAKE_NOW_ENV);
  });
});

describe("serverNowMs", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetServerClockForTests();
  });

  it("is the real clock when the variable is not set", () => {
    vi.stubEnv(FAKE_NOW_ENV, "");
    vi.useFakeTimers({ now: START });
    resetServerClockForTests();
    expect(serverNowMs()).toBe(START);
    vi.advanceTimersByTime(5_000);
    expect(serverNowMs()).toBe(START + 5_000);
  });

  it("starts at the fake instant on first use and keeps running", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv(FAKE_NOW_ENV, "2027-03-12T12:00:00Z");
    vi.useFakeTimers({ now: START });
    resetServerClockForTests();

    const fake = Date.UTC(2027, 2, 12, 12, 0, 0);
    expect(serverNowMs()).toBe(fake);
    vi.advanceTimersByTime(90_000);
    expect(serverNowMs()).toBe(fake + 90_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("2027-03-12T12:00:00.000Z");
  });

  it("reads the variable once", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv(FAKE_NOW_ENV, "2027-03-12T12:00:00Z");
    vi.useFakeTimers({ now: START });
    resetServerClockForTests();
    const first = serverNowMs();

    vi.stubEnv(FAKE_NOW_ENV, "2030-01-01T00:00:00Z");
    expect(serverNowMs()).toBe(first);
  });
});
