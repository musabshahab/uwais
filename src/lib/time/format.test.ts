import { describe, expect, it } from "vitest";
import { listDates } from "./dates";
import {
  DEFAULT_LOCALE,
  TIME_PLACEHOLDER,
  formatCountdown,
  formatCountdownClock,
  formatCountdownWords,
  formatDateLong,
  formatDateMedium,
  formatMonthYear,
  formatTime,
  formatTimeOrPlaceholder,
  formatTimeText,
  formatTimeTextOrPlaceholder,
  formatWeekdayLong,
  formatWeekdayShort,
} from "./format";

describe("formatTime", () => {
  it("splits a 12-hour time into digits and period", () => {
    expect(formatTime("17:05", "12h")).toEqual({ text: "5:05", period: "PM" });
    expect(formatTime("05:42", "12h")).toEqual({ text: "5:42", period: "AM" });
    expect(formatTime("11:59", "12h")).toEqual({ text: "11:59", period: "AM" });
    expect(formatTime("23:59", "12h")).toEqual({ text: "11:59", period: "PM" });
  });

  it("shows midnight and noon as 12, not 0", () => {
    expect(formatTime("00:00", "12h")).toEqual({ text: "12:00", period: "AM" });
    expect(formatTime("00:05", "12h")).toEqual({ text: "12:05", period: "AM" });
    expect(formatTime("12:00", "12h")).toEqual({ text: "12:00", period: "PM" });
    expect(formatTime("12:30", "12h")).toEqual({ text: "12:30", period: "PM" });
    expect(formatTime("13:00", "12h")).toEqual({ text: "1:00", period: "PM" });
  });

  it("leaves a 24-hour time as it is, with no period", () => {
    expect(formatTime("17:05", "24h")).toEqual({ text: "17:05", period: null });
    expect(formatTime("05:42", "24h")).toEqual({ text: "05:42", period: null });
    expect(formatTime("00:00", "24h")).toEqual({ text: "00:00", period: null });
  });

  it("joins the parts into one string", () => {
    expect(formatTimeText("17:05", "12h")).toBe("5:05 PM");
    expect(formatTimeText("00:05", "12h")).toBe("12:05 AM");
    expect(formatTimeText("17:05", "24h")).toBe("17:05");
  });

  it("throws on a malformed time", () => {
    expect(() => formatTime("25:00", "12h")).toThrow(RangeError);
    expect(() => formatTime("5:05", "24h")).toThrow(RangeError);
    expect(() => formatTimeText("", "12h")).toThrow(RangeError);
  });
});

describe("formatTimeOrPlaceholder", () => {
  it("formats a present time exactly like formatTime", () => {
    expect(formatTimeOrPlaceholder("17:05", "12h")).toEqual({ text: "5:05", period: "PM" });
    expect(formatTimeTextOrPlaceholder("17:05", "12h")).toBe("5:05 PM");
    expect(formatTimeTextOrPlaceholder("17:05", "24h")).toBe("17:05");
  });

  it("shows the placeholder for a missing time", () => {
    expect(formatTimeOrPlaceholder(null, "12h")).toEqual({ text: TIME_PLACEHOLDER, period: null });
    expect(formatTimeOrPlaceholder(undefined, "24h")).toEqual({ text: "--:--", period: null });
    expect(formatTimeTextOrPlaceholder(null, "12h")).toBe("--:--");
    expect(formatTimeTextOrPlaceholder(undefined, "12h")).toBe("--:--");
  });

  it("shows the placeholder for a malformed time instead of throwing", () => {
    expect(formatTimeOrPlaceholder("25:00", "12h")).toEqual({ text: "--:--", period: null });
    expect(formatTimeTextOrPlaceholder("soon", "24h")).toBe("--:--");
    expect(formatTimeTextOrPlaceholder("", "12h")).toBe("--:--");
  });

  it("lets the caller choose the placeholder", () => {
    expect(formatTimeOrPlaceholder(null, "12h", "n/a")).toEqual({ text: "n/a", period: null });
    expect(formatTimeTextOrPlaceholder(null, "24h", "")).toBe("");
  });

  it("uses a placeholder without dashes that typography would turn into an em dash", () => {
    expect(TIME_PLACEHOLDER).toBe("--:--");
    expect(TIME_PLACEHOLDER).not.toMatch(/[‒-―]/);
  });
});

describe("date formatting in the default locale", () => {
  it("formats the long form", () => {
    expect(formatDateLong("2026-11-25")).toBe("Wednesday 25 November 2026");
    expect(formatDateLong("2026-11-27")).toBe("Friday 27 November 2026");
    expect(formatDateLong("2024-02-29")).toBe("Thursday 29 February 2024");
    expect(formatDateLong("2027-01-01")).toBe("Friday 1 January 2027");
  });

  it("formats the medium form without a year", () => {
    expect(formatDateMedium("2026-11-25")).toBe("Wed 25 Nov");
    expect(formatDateMedium("2026-05-03")).toBe("Sun 3 May");
    // ICU versions print "Sep" or "Sept" for en-GB; the output here must not vary.
    expect(formatDateMedium("2026-09-01")).toBe("Tue 1 Sep");
    expect(formatDateMedium("2026-06-30")).toBe("Tue 30 Jun");
  });

  it("formats month headings from a month or from a date", () => {
    expect(formatMonthYear("2026-11")).toBe("November 2026");
    expect(formatMonthYear("2027-01")).toBe("January 2027");
    expect(formatMonthYear("2026-11-25")).toBe("November 2026");
  });

  it("formats weekdays", () => {
    expect(formatWeekdayShort("2026-11-25")).toBe("Wed");
    expect(formatWeekdayLong("2026-11-25")).toBe("Wednesday");
    expect(listDates("2026-11-22", "2026-11-28").map((date) => formatWeekdayShort(date))).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("treats the explicit default locale like no locale", () => {
    expect(formatDateLong("2026-11-25", DEFAULT_LOCALE)).toBe("Wednesday 25 November 2026");
    expect(DEFAULT_LOCALE).toBe("en-GB");
  });

  it("names every weekday and month the way Intl does", () => {
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
    for (const date of listDates("2026-01-01", "2026-12-31")) {
      const instant = new Date(`${date}T00:00:00Z`);
      const expected = `${weekday.format(instant)} ${instant.getUTCDate()} ${month.format(instant)} 2026`;
      expect(formatDateLong(date)).toBe(expected);
    }
  });

  it("throws on an invalid date or month", () => {
    expect(() => formatDateLong("2026-02-30")).toThrow(RangeError);
    expect(() => formatDateMedium("yesterday")).toThrow(RangeError);
    expect(() => formatMonthYear("2026-13")).toThrow(RangeError);
    expect(() => formatWeekdayShort("")).toThrow(RangeError);
  });
});

describe("date formatting in other locales", () => {
  it("delegates to Intl with the locale's own conventions", () => {
    expect(formatDateLong("2026-11-25", "fr-FR")).toBe("mercredi 25 novembre 2026");
    expect(formatDateLong("2026-11-25", "en-US")).toBe("Wednesday, November 25, 2026");
    expect(formatMonthYear("2026-11", "fr-FR")).toBe("novembre 2026");
    expect(formatWeekdayLong("2026-11-25", "fr-FR")).toBe("mercredi");
    expect(formatWeekdayShort("2026-11-25", "de-DE")).toMatch(/^Mi/);
    expect(formatDateMedium("2026-11-25", "en-US")).toBe("Wed, Nov 25");
  });

  it("stays on the Gregorian calendar for locales that default to another one", () => {
    const arabic = formatDateLong("2026-11-25", "ar-SA");
    expect(arabic).toContain("نوفمبر");
    // 1448 is the Hijri year of that date; it must not leak in.
    expect(arabic).not.toMatch(/1448|١٤٤٨/);

    // Thai dates default to the Buddhist era, in which 2026 is 2569.
    const thai = formatDateLong("2026-11-25", "th-TH");
    expect(thai).toContain("2026");
    expect(thai).not.toContain("2569");
    expect(formatMonthYear("2026-11", "th-TH")).toContain("2026");

    // Even a locale tag that asks for another calendar outright.
    const forced = formatDateLong("2026-11-25", "en-GB-u-ca-islamic-umalqura");
    expect(forced).toContain("November");
    expect(forced).toContain("2026");
  });

  it("is independent of the instant's local day: late-evening dates do not shift", () => {
    // A formatter without timeZone UTC would print the previous day west of Greenwich.
    expect(formatDateLong("2026-01-01", "en-US")).toBe("Thursday, January 1, 2026");
    expect(formatMonthYear("2026-01", "en-US")).toBe("January 2026");
  });

  it("falls back to English when the runtime rejects the locale tag", () => {
    expect(formatDateLong("2026-11-25", "not a locale")).toBe("Wednesday 25 November 2026");
    expect(formatDateMedium("2026-11-25", "x")).toBe("Wed 25 Nov");
    expect(formatMonthYear("2026-11", "")).toBe("November 2026");
  });
});

describe("formatCountdown", () => {
  it("breaks seconds into hours, minutes and seconds", () => {
    expect(formatCountdown(0)).toEqual({ hours: 0, minutes: 0, seconds: 0, negative: false });
    expect(formatCountdown(59)).toEqual({ hours: 0, minutes: 0, seconds: 59, negative: false });
    expect(formatCountdown(60)).toEqual({ hours: 0, minutes: 1, seconds: 0, negative: false });
    expect(formatCountdown(3599)).toEqual({ hours: 0, minutes: 59, seconds: 59, negative: false });
    expect(formatCountdown(3600)).toEqual({ hours: 1, minutes: 0, seconds: 0, negative: false });
    expect(formatCountdown(3909)).toEqual({ hours: 1, minutes: 5, seconds: 9, negative: false });
  });

  it("does not cap hours at a day", () => {
    expect(formatCountdown(30 * 3600 + 61)).toEqual({ hours: 30, minutes: 1, seconds: 1, negative: false });
  });

  it("reports a passed moment through the negative flag", () => {
    expect(formatCountdown(-125)).toEqual({ hours: 0, minutes: 2, seconds: 5, negative: true });
    expect(formatCountdown(-3600)).toEqual({ hours: 1, minutes: 0, seconds: 0, negative: true });
  });

  it("drops fractions and never reports a negative zero", () => {
    expect(formatCountdown(59.9)).toEqual({ hours: 0, minutes: 0, seconds: 59, negative: false });
    expect(formatCountdown(-0.4)).toEqual({ hours: 0, minutes: 0, seconds: 0, negative: false });
    expect(formatCountdown(-1.9)).toEqual({ hours: 0, minutes: 0, seconds: 1, negative: true });
  });

  it("treats a non-finite input as zero", () => {
    const zero = { hours: 0, minutes: 0, seconds: 0, negative: false };
    expect(formatCountdown(Number.NaN)).toEqual(zero);
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toEqual(zero);
    expect(formatCountdown(Number.NEGATIVE_INFINITY)).toEqual(zero);
  });
});

describe("formatCountdownClock", () => {
  it("shows MM:SS below an hour", () => {
    expect(formatCountdownClock(0)).toBe("00:00");
    expect(formatCountdownClock(9)).toBe("00:09");
    expect(formatCountdownClock(249)).toBe("04:09");
    expect(formatCountdownClock(3599)).toBe("59:59");
  });

  it("shows H:MM:SS from an hour up", () => {
    expect(formatCountdownClock(3600)).toBe("1:00:00");
    expect(formatCountdownClock(3909)).toBe("1:05:09");
    expect(formatCountdownClock(36000 + 61)).toBe("10:01:01");
    expect(formatCountdownClock(100 * 3600)).toBe("100:00:00");
  });

  it("stops at zero for a moment that has passed", () => {
    expect(formatCountdownClock(-1)).toBe("00:00");
    expect(formatCountdownClock(-5000)).toBe("00:00");
    expect(formatCountdownClock(Number.NaN)).toBe("00:00");
  });
});

describe("formatCountdownWords", () => {
  it("uses hours and minutes, rounded down", () => {
    expect(formatCountdownWords(3900)).toBe("1 hr 5 min");
    expect(formatCountdownWords(3959)).toBe("1 hr 5 min");
    expect(formatCountdownWords(7200)).toBe("2 hr");
    expect(formatCountdownWords(7259)).toBe("2 hr");
    expect(formatCountdownWords(12 * 60)).toBe("12 min");
    expect(formatCountdownWords(12 * 60 + 59)).toBe("12 min");
    expect(formatCountdownWords(60)).toBe("1 min");
    expect(formatCountdownWords(26 * 3600 + 120)).toBe("26 hr 2 min");
  });

  it("says less than a minute below sixty seconds, also once the moment has passed", () => {
    expect(formatCountdownWords(59)).toBe("less than a minute");
    expect(formatCountdownWords(1)).toBe("less than a minute");
    expect(formatCountdownWords(0)).toBe("less than a minute");
    expect(formatCountdownWords(-300)).toBe("less than a minute");
    expect(formatCountdownWords(Number.NaN)).toBe("less than a minute");
  });
});
