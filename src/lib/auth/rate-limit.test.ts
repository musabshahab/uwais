import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATE_LIMIT,
  UNKNOWN_CLIENT,
  clientKeyFromHeaders,
  createLoginRateLimiter,
  getLoginRateLimiter,
  type RateLimitOptions,
} from "./rate-limit";

const MINUTE = 60 * 1000;

/** A limiter on a clock the test moves by hand. */
function setup(options: Partial<RateLimitOptions> = {}) {
  const clock = { now: 1_000_000 };
  const limiter = createLoginRateLimiter({ now: () => clock.now, ...options });
  return {
    limiter,
    advance(ms: number) {
      clock.now += ms;
    },
    /** Records `count` failures for `client`, one second apart. */
    fail(client: string, count: number) {
      for (let index = 0; index < count; index++) {
        limiter.recordFailure(client);
        clock.now += 1000;
      }
    },
  };
}

describe("createLoginRateLimiter", () => {
  it("defaults to five failures in fifteen minutes per client", () => {
    expect(DEFAULT_RATE_LIMIT).toEqual({
      maxFailures: 5,
      globalMaxFailures: 50,
      windowMs: 15 * MINUTE,
    });
  });

  it("allows a client that has not failed", () => {
    const { limiter } = setup();
    expect(limiter.check("203.0.113.1")).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: 5,
    });
  });

  it("counts down the remaining attempts and locks on the fifth failure", () => {
    const { limiter } = setup();
    const client = "203.0.113.1";

    expect(limiter.recordFailure(client).remainingAttempts).toBe(4);
    expect(limiter.recordFailure(client).remainingAttempts).toBe(3);
    expect(limiter.recordFailure(client).remainingAttempts).toBe(2);
    expect(limiter.recordFailure(client)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: 1,
    });
    expect(limiter.recordFailure(client)).toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60,
      remainingAttempts: 0,
    });
    expect(limiter.check(client).allowed).toBe(false);
  });

  it("does not count a check as an attempt", () => {
    const { limiter } = setup();
    for (let index = 0; index < 20; index++) limiter.check("203.0.113.1");
    expect(limiter.check("203.0.113.1").remainingAttempts).toBe(5);
  });

  it("reports how long the lock lasts and lifts it when the oldest failure expires", () => {
    const { limiter, advance, fail } = setup();
    const client = "203.0.113.1";
    fail(client, 5);

    // Failures at 0 s to 4 s; the clock is at 5 s. The first expires at 900 s.
    expect(limiter.check(client)).toMatchObject({ allowed: false, retryAfterSeconds: 895 });
    advance(894 * 1000);
    expect(limiter.check(client)).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    advance(1000);
    expect(limiter.check(client)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: 1,
    });
  });

  it("slides: one more failure after the lock lifts locks again until the next one expires", () => {
    const { limiter, advance, fail } = setup();
    const client = "203.0.113.1";
    fail(client, 5);
    advance(895 * 1000);

    expect(limiter.recordFailure(client)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
      remainingAttempts: 0,
    });
    advance(1000);
    expect(limiter.check(client).allowed).toBe(true);
  });

  it("forgets failures spread wider than the window", () => {
    const { limiter, advance } = setup();
    const client = "203.0.113.1";
    for (let index = 0; index < 12; index++) {
      expect(limiter.recordFailure(client).allowed).toBe(true);
      advance(4 * MINUTE);
    }
  });

  it("keeps clients apart", () => {
    const { limiter, fail } = setup();
    fail("203.0.113.1", 5);

    expect(limiter.check("203.0.113.1").allowed).toBe(false);
    expect(limiter.check("203.0.113.2")).toMatchObject({ allowed: true, remainingAttempts: 5 });
  });

  it("clears a client's failures on success", () => {
    const { limiter, fail } = setup();
    fail("203.0.113.1", 4);
    limiter.recordSuccess("203.0.113.1");

    expect(limiter.check("203.0.113.1").remainingAttempts).toBe(5);
    fail("203.0.113.1", 4);
    expect(limiter.check("203.0.113.1").allowed).toBe(true);
  });

  it("locks everyone once all clients together reach the global ceiling", () => {
    const { limiter, advance } = setup({ globalMaxFailures: 6 });
    // Six different addresses, one failure each: nobody is near a personal limit.
    for (let index = 1; index <= 6; index++) {
      limiter.recordFailure(`203.0.113.${index}`);
      advance(10 * 1000);
    }

    expect(limiter.check("198.51.100.7")).toEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60 - 60,
      remainingAttempts: 5,
    });
    expect(limiter.check("203.0.113.1")).toMatchObject({ allowed: false, remainingAttempts: 4 });

    // The first failure leaves the window: one attempt's worth of room opens up.
    advance(15 * MINUTE - 60 * 1000);
    expect(limiter.check("198.51.100.7").allowed).toBe(true);
    limiter.recordFailure("198.51.100.7");
    expect(limiter.check("198.51.100.8").allowed).toBe(false);
  });

  it("does not let one client's success lift the global lock", () => {
    const { limiter } = setup({ globalMaxFailures: 3 });
    limiter.recordFailure("203.0.113.1");
    limiter.recordFailure("203.0.113.2");
    limiter.recordFailure("203.0.113.3");
    limiter.recordSuccess("203.0.113.1");

    expect(limiter.check("203.0.113.1").allowed).toBe(false);
  });

  it("honours custom limits", () => {
    const { limiter, advance } = setup({ maxFailures: 2, windowMs: 10_000 });
    limiter.recordFailure("a");
    expect(limiter.recordFailure("a")).toMatchObject({ allowed: false, retryAfterSeconds: 10 });
    advance(10_000);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("forgets everything on reset", () => {
    const { limiter, fail } = setup({ globalMaxFailures: 5 });
    fail("203.0.113.1", 5);
    limiter.reset();

    expect(limiter.check("203.0.113.1")).toMatchObject({ allowed: true, remainingAttempts: 5 });
    expect(limiter.check("203.0.113.2").allowed).toBe(true);
  });

  it("gives each limiter its own state", () => {
    const first = setup();
    const second = setup();
    first.fail("203.0.113.1", 5);
    expect(second.limiter.check("203.0.113.1").allowed).toBe(true);
  });
});

describe("getLoginRateLimiter", () => {
  it("returns the same limiter every time", () => {
    expect(getLoginRateLimiter()).toBe(getLoginRateLimiter());
  });
});

describe("clientKeyFromHeaders", () => {
  /** The key for a request with the given `X-Forwarded-For` header. */
  function keyFor(forwardedFor?: string): string {
    const headers = new Headers();
    if (forwardedFor !== undefined) headers.set("x-forwarded-for", forwardedFor);
    return clientKeyFromHeaders(headers);
  }

  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["203.0.113.7, 10.0.0.2, 10.0.0.1", "203.0.113.7"],
    ["  203.0.113.7  ,10.0.0.1", "203.0.113.7"],
    ["203.0.113.7:51234", "203.0.113.7"],
    ["2001:DB8::1", "2001:db8::1"],
    ["[2001:db8::1]:443", "2001:db8::1"],
    ["[2001:db8::1]", "2001:db8::1"],
    ["::ffff:192.0.2.1", "::ffff:192.0.2.1"],
    ["::1", "::1"],
  ])("reads the first hop of %j", (header, expected) => {
    expect(keyFor(header)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "unknown",
    "not an address",
    "999.1.1.1",
    "203.0.113.7; DROP TABLE",
    ", 203.0.113.7",
    "localhost",
    `203.0.113.7${", 10.0.0.1".repeat(100)}`,
  ])("uses the shared bucket for %j", (header) => {
    expect(keyFor(header)).toBe(UNKNOWN_CLIENT);
  });

  it("gives the same key however the address is written", () => {
    expect(keyFor("2001:DB8::A")).toBe(keyFor("2001:db8::a"));
  });
});
