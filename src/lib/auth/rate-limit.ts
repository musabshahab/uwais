/**
 * Slows down password guessing on the sign-in form.
 *
 * Failed attempts are counted in a sliding window, per client address and
 * across all clients together. The second count matters as much as the
 * first: without a trusted reverse proxy the `X-Forwarded-For` header is
 * whatever the client says it is, so a guesser can appear as a new address on
 * every request. The global ceiling still stops them.
 *
 * State lives in memory. That is right for the single-process deployments
 * this app targets; a restart forgets the counts, and so does each instance
 * of a multi-instance deployment.
 */

import { isIP } from "node:net";

/** Limits of a rate limiter. */
export interface RateLimitOptions {
  /** Failed attempts one client may make inside the window before it is locked out. */
  maxFailures: number;
  /** Failed attempts all clients together may make inside the window. */
  globalMaxFailures: number;
  /** Length of the sliding window, in milliseconds. */
  windowMs: number;
  /** Clock, epoch milliseconds. Replaceable so tests can move time. */
  now: () => number;
}

/** Defaults: five failures in fifteen minutes per client, fifty for everyone together. */
export const DEFAULT_RATE_LIMIT: Readonly<Omit<RateLimitOptions, "now">> = {
  maxFailures: 5,
  globalMaxFailures: 50,
  windowMs: 15 * 60 * 1000,
};

/** Whether a sign-in attempt may go ahead. */
export interface RateLimitDecision {
  /** False while the client, or everyone, is locked out. */
  allowed: boolean;
  /** Whole seconds until an attempt is allowed again; 0 when `allowed`. */
  retryAfterSeconds: number;
  /** Failed attempts this client can still make before being locked out. */
  remainingAttempts: number;
}

/** Counts failed sign-in attempts. */
export interface LoginRateLimiter {
  /** Asks whether `client` may try now. Does not count as an attempt. */
  check(client: string): RateLimitDecision;
  /** Records a failed attempt and returns where that leaves the client. */
  recordFailure(client: string): RateLimitDecision;
  /** Forgets the client's failures after a successful sign-in. */
  recordSuccess(client: string): void;
  /** Forgets everything. */
  reset(): void;
}

/** Bucket for requests whose address is unknown; they share one allowance. */
export const UNKNOWN_CLIENT = "unknown";

/** Longest header value that is parsed; a real address list is far shorter. */
const MAX_FORWARDED_LENGTH = 512;

/** Drops the brackets and port that proxies sometimes attach to an address. */
function stripPort(address: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) return bracketed[1];
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(address);
  return withPort ? withPort[1] : address;
}

/**
 * The key a request is rate-limited under: the first address in
 * `X-Forwarded-For` (the original client, as reported by the nearest proxy),
 * or `UNKNOWN_CLIENT` when the header is missing or does not hold an IP
 * address. Arbitrary text is never used as a key, so a client cannot mint
 * unlimited buckets by sending nonsense.
 */
export function clientKeyFromHeaders(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded || forwarded.length > MAX_FORWARDED_LENGTH) return UNKNOWN_CLIENT;
  const first = stripPort(forwarded.split(",")[0].trim());
  return isIP(first) === 0 ? UNKNOWN_CLIENT : first.toLowerCase();
}

/** Removes, in place, the timestamps that have left the window. They are in ascending order. */
function dropExpired(timestamps: number[], cutoff: number): void {
  let expired = 0;
  while (expired < timestamps.length && timestamps[expired] <= cutoff) expired++;
  if (expired > 0) timestamps.splice(0, expired);
}

/** Whole seconds, at least one, until `timestamp` leaves a window of `windowMs`. */
function secondsUntilExpiry(timestamp: number, windowMs: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp + windowMs - now) / 1000));
}

/**
 * Creates a rate limiter with its own, empty state.
 *
 * A client is locked out once it has `maxFailures` failures inside the
 * window, and stays locked until the oldest of them is `windowMs` old.
 * Everyone is locked out while the total reaches `globalMaxFailures`.
 * Callers are expected to `check` first and to skip the password check
 * entirely while locked out, so a locked-out client cannot extend its own
 * lock or learn anything by continuing to guess.
 */
export function createLoginRateLimiter(options: Partial<RateLimitOptions> = {}): LoginRateLimiter {
  const { maxFailures, globalMaxFailures, windowMs, now } = {
    ...DEFAULT_RATE_LIMIT,
    // Looked up on every call so a replaced clock (as in tests) is honoured.
    now: () => Date.now(),
    ...options,
  };
  const failuresByClient = new Map<string, number[]>();
  const allFailures: number[] = [];

  /** Brings both counts up to date and returns the client's live failures. */
  function prune(client: string, currentMs: number): number[] {
    const cutoff = currentMs - windowMs;
    dropExpired(allFailures, cutoff);
    const failures = failuresByClient.get(client) ?? [];
    dropExpired(failures, cutoff);
    if (failures.length === 0) failuresByClient.delete(client);
    return failures;
  }

  /** Forgets clients whose failures have all expired, so the map cannot grow without bound. */
  function sweep(currentMs: number): void {
    const cutoff = currentMs - windowMs;
    for (const [client, failures] of failuresByClient) {
      dropExpired(failures, cutoff);
      if (failures.length === 0) failuresByClient.delete(client);
    }
  }

  function decide(failures: number[], currentMs: number): RateLimitDecision {
    const remainingAttempts = Math.max(0, maxFailures - failures.length);
    if (failures.length >= maxFailures) {
      // The lock lifts when enough old failures expire to drop below the limit.
      const blocking = failures[failures.length - maxFailures];
      return {
        allowed: false,
        retryAfterSeconds: secondsUntilExpiry(blocking, windowMs, currentMs),
        remainingAttempts: 0,
      };
    }
    if (allFailures.length >= globalMaxFailures) {
      const blocking = allFailures[allFailures.length - globalMaxFailures];
      return {
        allowed: false,
        retryAfterSeconds: secondsUntilExpiry(blocking, windowMs, currentMs),
        remainingAttempts,
      };
    }
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts };
  }

  return {
    check(client) {
      const currentMs = now();
      return decide(prune(client, currentMs), currentMs);
    },

    recordFailure(client) {
      const currentMs = now();
      const failures = prune(client, currentMs);
      failures.push(currentMs);
      failuresByClient.set(client, failures);
      allFailures.push(currentMs);
      // Keep both lists no longer than the limits need, whatever callers do.
      if (failures.length > maxFailures) failures.splice(0, failures.length - maxFailures);
      if (allFailures.length > globalMaxFailures) {
        allFailures.splice(0, allFailures.length - globalMaxFailures);
      }
      sweep(currentMs);
      return decide(failures, currentMs);
    },

    recordSuccess(client) {
      failuresByClient.delete(client);
    },

    reset() {
      failuresByClient.clear();
      allFailures.length = 0;
    },
  };
}

/**
 * The limiter lives on `globalThis` because the development server
 * re-evaluates modules on every edit, which would otherwise hand a guesser a
 * fresh allowance each time a file is saved.
 */
const LIMITER_KEY = Symbol.for("uwais.loginRateLimiter");

type GlobalWithLimiter = typeof globalThis & { [LIMITER_KEY]?: LoginRateLimiter };

/** The process-wide limiter that guards the sign-in form. */
export function getLoginRateLimiter(): LoginRateLimiter {
  const scope = globalThis as GlobalWithLimiter;
  let limiter = scope[LIMITER_KEY];
  if (!limiter) {
    limiter = createLoginRateLimiter();
    scope[LIMITER_KEY] = limiter;
  }
  return limiter;
}
