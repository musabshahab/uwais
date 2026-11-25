/**
 * The server's clock.
 *
 * Everything on the server that asks "what time is it?" for the timetable
 * (which day is today, what the screens are told the time is, the stamps on
 * saved rows) reads this one function, so the answer can be moved for
 * end-to-end tests: a test run must be able to stand on a known date (a
 * Friday, the night the clocks change) whatever the real date is.
 *
 * Signing in and session expiry deliberately do not use it; they always run
 * on the real clock.
 */

/** Environment variable that moves the server's clock. For tests only. */
export const FAKE_NOW_ENV = "UWAIS_FAKE_NOW";

/**
 * Works out how far the clock is moved by a `UWAIS_FAKE_NOW` value.
 *
 * The value is an instant with an explicit offset, for example
 * `2027-03-12T12:00:00Z` or `2027-03-12T12:00:00+01:00`. The clock is not
 * frozen: it reads that instant at the moment given as `startedAtMs` and
 * runs on from there at normal speed, so countdowns keep ticking.
 *
 * @param value        The variable's value; empty or missing means "real time".
 * @param startedAtMs  The real time, epoch milliseconds, at which the fake clock starts.
 * @returns The offset to add to the real clock, in milliseconds; 0 for real time.
 * @throws When the value is set but is not an instant with an explicit offset.
 */
export function fakeClockOffset(value: string | undefined, startedAtMs: number): number {
  const text = value?.trim() ?? "";
  if (text === "") return 0;
  // A bare "2027-03-12T12:00:00" would be read in the server's own timezone.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const fakeMs = hasOffset ? Date.parse(text) : Number.NaN;
  if (Number.isNaN(fakeMs)) {
    throw new Error(
      `${FAKE_NOW_ENV} must be an instant with an offset, such as 2027-03-12T12:00:00Z; got "${text}".`,
    );
  }
  return fakeMs - startedAtMs;
}

let offsetMs: number | null = null;

/**
 * The current time, epoch milliseconds: the real clock, unless
 * `UWAIS_FAKE_NOW` moves it.
 *
 * The variable is read on the first call rather than when the module loads,
 * so nothing touches the clock while pages are being prerendered; callers
 * wait for a real request (`connection()`) before asking.
 */
export function serverNowMs(): number {
  const realMs = Date.now();
  if (offsetMs === null) {
    offsetMs = fakeClockOffset(process.env[FAKE_NOW_ENV], realMs);
    if (offsetMs !== 0) {
      console.warn(
        `[uwais] ${FAKE_NOW_ENV} is set: the timetable clock starts at ${new Date(realMs + offsetMs).toISOString()}. This is for tests only.`,
      );
    }
  }
  return realMs + offsetMs;
}

/** Forgets the offset so the variable is read again. For unit tests. */
export function resetServerClockForTests(): void {
  offsetMs = null;
}
