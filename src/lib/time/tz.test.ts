import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, listDates, minutesToTime } from "./dates";
import {
  FALLBACK_TIME_ZONE,
  isValidTimeZone,
  listTimeZones,
  resolveTimeZone,
  zoneOffsetMs,
  zonedDateTimeToEpochMs,
  zonedNow,
} from "./tz";

const HOUR = 3600000;
const MINUTE = 60000;

/** Epoch milliseconds of a UTC date-time written as `YYYY-MM-DDTHH:mm[:ss]`. */
function utc(isoWithoutZone: string): number {
  return Date.parse(`${isoWithoutZone}Z`);
}

/** `zonedDateTimeToEpochMs` rendered as an ISO string, for readable assertions. */
function instantOf(date: string, time: string, timeZone: string): string {
  return new Date(zonedDateTimeToEpochMs(date, time, timeZone)).toISOString().slice(0, 16);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isValidTimeZone", () => {
  it.each(["Europe/London", "America/New_York", "Asia/Karachi", "Australia/Sydney", "UTC", "Etc/GMT+1"])(
    "accepts %s",
    (zone) => {
      expect(isValidTimeZone(zone)).toBe(true);
    },
  );

  it("accepts a zone regardless of letter case, as Intl does", () => {
    expect(isValidTimeZone("europe/london")).toBe(true);
  });

  it.each(["Mars/Phobos", "Europe/Londn", "London", "", " ", "Europe/London ", "+01:00", "UTC+1", "1"])(
    "rejects %j",
    (zone) => {
      expect(isValidTimeZone(zone)).toBe(false);
    },
  );

  it("rejects values that are not strings", () => {
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(60)).toBe(false);
  });
});

describe("resolveTimeZone", () => {
  it("keeps a zone the runtime knows", () => {
    expect(resolveTimeZone("Asia/Karachi")).toBe("Asia/Karachi");
  });

  it("falls back to UTC for an unusable zone instead of throwing", () => {
    expect(resolveTimeZone("Mars/Phobos")).toBe(FALLBACK_TIME_ZONE);
    expect(resolveTimeZone("")).toBe(FALLBACK_TIME_ZONE);
    expect(resolveTimeZone("constructor")).toBe(FALLBACK_TIME_ZONE);
  });

  it("uses the pre-rename spelling on a device whose zone database predates the rename", () => {
    const oldDevice = (zone: string) => zone === "Europe/Kiev" || zone === "Asia/Calcutta";
    expect(resolveTimeZone("Europe/Kyiv", oldDevice)).toBe("Europe/Kiev");
    expect(resolveTimeZone("Asia/Kolkata", oldDevice)).toBe("Asia/Calcutta");
    // Renamed, but this device knows neither spelling.
    expect(resolveTimeZone("America/Nuuk", oldDevice)).toBe(FALLBACK_TIME_ZONE);
  });
});

describe("zonedNow", () => {
  it("reads the wall clock in Europe/London in winter and in summer", () => {
    expect(zonedNow("Europe/London", utc("2026-11-25T11:40:07"))).toEqual({
      date: "2026-11-25",
      time: "11:40",
      hour: 11,
      minute: 40,
      second: 7,
      minutesOfDay: 700,
      secondsOfDay: 42007,
      weekday: 3,
    });
    const summer = zonedNow("Europe/London", utc("2026-07-01T11:40:00"));
    expect(summer.time).toBe("12:40");
    expect(summer.date).toBe("2026-07-01");
  });

  it("rolls the date over at the zone's midnight, not at UTC midnight", () => {
    const karachi = zonedNow("Asia/Karachi", utc("2026-11-25T19:30:00"));
    expect(karachi.date).toBe("2026-11-26");
    expect(karachi.time).toBe("00:30");
    expect(karachi.weekday).toBe(4);

    const newYork = zonedNow("America/New_York", utc("2026-11-25T03:15:00"));
    expect(newYork.date).toBe("2026-11-24");
    expect(newYork.time).toBe("22:15");
    expect(newYork.weekday).toBe(2);

    const sydney = zonedNow("Australia/Sydney", utc("2026-11-25T13:00:00"));
    expect(sydney.date).toBe("2026-11-26");
    expect(sydney.time).toBe("00:00");
    expect(sydney.minutesOfDay).toBe(0);
  });

  it("reports midnight as hour 0", () => {
    const midnight = zonedNow("Europe/London", utc("2026-11-25T00:00:00"));
    expect(midnight.hour).toBe(0);
    expect(midnight.time).toBe("00:00");
    expect(midnight.secondsOfDay).toBe(0);
    expect(midnight.date).toBe("2026-11-25");
  });

  it("steps over the missing hour when the clocks go forward", () => {
    const before = zonedNow("Europe/London", utc("2026-03-29T00:59:59"));
    const after = zonedNow("Europe/London", utc("2026-03-29T01:00:00"));
    expect(before.time).toBe("00:59");
    expect(before.second).toBe(59);
    expect(after.time).toBe("02:00");
    expect(after.second).toBe(0);
  });

  it("shows the repeated hour twice when the clocks go back", () => {
    expect(zonedNow("Europe/London", utc("2026-10-25T00:30:00")).time).toBe("01:30");
    expect(zonedNow("Europe/London", utc("2026-10-25T01:30:00")).time).toBe("01:30");
    expect(zonedNow("Europe/London", utc("2026-10-25T02:00:00")).time).toBe("02:00");
  });

  it("handles zones with quarter-hour and half-hour offsets", () => {
    expect(zonedNow("Asia/Kathmandu", utc("2026-11-25T06:15:00")).time).toBe("12:00");
    expect(zonedNow("Asia/Kolkata", utc("2026-11-25T18:45:00")).time).toBe("00:15");
  });

  it("truncates fractions of a second, also before 1970", () => {
    expect(zonedNow("UTC", 999).second).toBe(0);
    const beforeEpoch = zonedNow("America/New_York", -1);
    expect(beforeEpoch.date).toBe("1969-12-31");
    expect(beforeEpoch.time).toBe("18:59");
    expect(beforeEpoch.second).toBe(59);
  });

  it("throws on an unknown zone or an invalid instant", () => {
    expect(() => zonedNow("Mars/Phobos", 0)).toThrow(RangeError);
    expect(() => zonedNow("Europe/London", Number.NaN)).toThrow(RangeError);
  });

  it("copes with browsers that print midnight as hour 24", async () => {
    // Chromium 80 formats 00:xx as 24:xx of the day that is starting.
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const quirkyIntl: typeof Intl = Object.create(Intl);
    Object.defineProperty(quirkyIntl, "DateTimeFormat", {
      value: function (locale: string, options: Intl.DateTimeFormatOptions) {
        const real = new RealDateTimeFormat(locale, options);
        return {
          formatToParts: (date: Date) =>
            real
              .formatToParts(date)
              .map((part) => (part.type === "hour" && part.value === "00" ? { ...part, value: "24" } : part)),
        };
      },
    });
    vi.stubGlobal("Intl", quirkyIntl);
    vi.resetModules();
    const quirky = await import("./tz");

    const midnight = quirky.zonedNow("Asia/Karachi", utc("2026-11-25T19:30:00"));
    expect(midnight.date).toBe("2026-11-26");
    expect(midnight.hour).toBe(0);
    expect(midnight.time).toBe("00:30");
    expect(midnight.minutesOfDay).toBe(30);
    expect(quirky.zoneOffsetMs("Asia/Karachi", utc("2026-11-25T19:30:00"))).toBe(5 * HOUR);
    expect(quirky.zonedDateTimeToEpochMs("2026-11-26", "00:30", "Asia/Karachi")).toBe(
      utc("2026-11-25T19:30:00"),
    );
  });
});

describe("zoneOffsetMs", () => {
  it("returns the offset in force at the instant", () => {
    expect(zoneOffsetMs("Asia/Karachi", utc("2026-11-25T00:00:00"))).toBe(5 * HOUR);
    expect(zoneOffsetMs("America/New_York", utc("2026-07-01T00:00:00"))).toBe(-4 * HOUR);
    expect(zoneOffsetMs("America/New_York", utc("2026-12-01T00:00:00"))).toBe(-5 * HOUR);
    expect(zoneOffsetMs("Asia/Kathmandu", utc("2026-11-25T00:00:00"))).toBe(5 * HOUR + 45 * MINUTE);
    expect(zoneOffsetMs("UTC", 123456789)).toBe(0);
  });

  it("changes exactly at the transition, whatever the millisecond", () => {
    expect(zoneOffsetMs("Europe/London", utc("2026-03-29T01:00:00") - 1)).toBe(0);
    expect(zoneOffsetMs("Europe/London", utc("2026-03-29T01:00:00"))).toBe(HOUR);
    expect(zoneOffsetMs("Europe/London", utc("2026-10-25T01:00:00") - 1)).toBe(HOUR);
    expect(zoneOffsetMs("Europe/London", utc("2026-10-25T01:00:00"))).toBe(0);
  });
});

describe("zonedDateTimeToEpochMs", () => {
  it("converts ordinary wall times", () => {
    expect(instantOf("2026-11-25", "11:40", "Europe/London")).toBe("2026-11-25T11:40");
    expect(instantOf("2026-07-01", "12:40", "Europe/London")).toBe("2026-07-01T11:40");
    expect(instantOf("2026-11-25", "05:00", "Asia/Karachi")).toBe("2026-11-25T00:00");
    expect(instantOf("2026-11-25", "00:30", "Asia/Karachi")).toBe("2026-11-24T19:30");
    expect(instantOf("2026-11-24", "22:15", "America/New_York")).toBe("2026-11-25T03:15");
    expect(instantOf("2026-11-26", "00:00", "Australia/Sydney")).toBe("2026-11-25T13:00");
    expect(instantOf("2026-11-25", "12:00", "Asia/Kathmandu")).toBe("2026-11-25T06:15");
    expect(instantOf("1969-07-20", "20:17", "UTC")).toBe("1969-07-20T20:17");
  });

  describe("spring forward: a wall time inside the gap resolves to the instant of the jump", () => {
    it("Europe/London, 2026-03-29 (01:00 GMT becomes 02:00 BST)", () => {
      expect(instantOf("2026-03-29", "00:59", "Europe/London")).toBe("2026-03-29T00:59");
      expect(instantOf("2026-03-29", "01:00", "Europe/London")).toBe("2026-03-29T01:00");
      expect(instantOf("2026-03-29", "01:30", "Europe/London")).toBe("2026-03-29T01:00");
      expect(instantOf("2026-03-29", "01:59", "Europe/London")).toBe("2026-03-29T01:00");
      expect(instantOf("2026-03-29", "02:00", "Europe/London")).toBe("2026-03-29T01:00");
      expect(instantOf("2026-03-29", "02:30", "Europe/London")).toBe("2026-03-29T01:30");
    });

    it("America/New_York, 2026-03-08 (02:00 EST becomes 03:00 EDT)", () => {
      expect(instantOf("2026-03-08", "01:59", "America/New_York")).toBe("2026-03-08T06:59");
      expect(instantOf("2026-03-08", "02:30", "America/New_York")).toBe("2026-03-08T07:00");
      expect(instantOf("2026-03-08", "03:00", "America/New_York")).toBe("2026-03-08T07:00");
      expect(instantOf("2026-03-08", "03:01", "America/New_York")).toBe("2026-03-08T07:01");
    });

    it("Australia/Sydney, 2026-10-04 (02:00 AEST becomes 03:00 AEDT)", () => {
      expect(instantOf("2026-10-04", "01:59", "Australia/Sydney")).toBe("2026-10-03T15:59");
      expect(instantOf("2026-10-04", "02:30", "Australia/Sydney")).toBe("2026-10-03T16:00");
      expect(instantOf("2026-10-04", "03:00", "Australia/Sydney")).toBe("2026-10-03T16:00");
    });

    it("a half-hour gap (Australia/Lord_Howe, 02:00 becomes 02:30)", () => {
      expect(instantOf("2026-10-04", "01:59", "Australia/Lord_Howe")).toBe("2026-10-03T15:29");
      expect(instantOf("2026-10-04", "02:15", "Australia/Lord_Howe")).toBe("2026-10-03T15:30");
      expect(instantOf("2026-10-04", "02:30", "Australia/Lord_Howe")).toBe("2026-10-03T15:30");
    });

    it("a gap at midnight, so the day itself starts at 01:00 (Africa/Cairo, 2026-04-24)", () => {
      expect(instantOf("2026-04-24", "00:00", "Africa/Cairo")).toBe("2026-04-23T22:00");
      expect(instantOf("2026-04-24", "00:30", "Africa/Cairo")).toBe("2026-04-23T22:00");
      expect(instantOf("2026-04-24", "01:00", "Africa/Cairo")).toBe("2026-04-23T22:00");
    });

    it("a whole skipped day (Pacific/Apia crossed the date line, 2011-12-30 never happened)", () => {
      expect(instantOf("2011-12-29", "23:59", "Pacific/Apia")).toBe("2011-12-30T09:59");
      expect(instantOf("2011-12-30", "12:00", "Pacific/Apia")).toBe("2011-12-30T10:00");
      expect(instantOf("2011-12-31", "00:00", "Pacific/Apia")).toBe("2011-12-30T10:00");
    });
  });

  describe("autumn back: an ambiguous wall time resolves to its first occurrence", () => {
    it("Europe/London, 2026-10-25 (02:00 BST becomes 01:00 GMT)", () => {
      expect(instantOf("2026-10-25", "00:30", "Europe/London")).toBe("2026-10-24T23:30");
      expect(instantOf("2026-10-25", "01:00", "Europe/London")).toBe("2026-10-25T00:00");
      expect(instantOf("2026-10-25", "01:30", "Europe/London")).toBe("2026-10-25T00:30");
      expect(instantOf("2026-10-25", "01:59", "Europe/London")).toBe("2026-10-25T00:59");
      expect(instantOf("2026-10-25", "02:00", "Europe/London")).toBe("2026-10-25T02:00");
    });

    it("America/New_York, 2026-11-01 (02:00 EDT becomes 01:00 EST)", () => {
      expect(instantOf("2026-11-01", "00:59", "America/New_York")).toBe("2026-11-01T04:59");
      expect(instantOf("2026-11-01", "01:30", "America/New_York")).toBe("2026-11-01T05:30");
      expect(instantOf("2026-11-01", "02:00", "America/New_York")).toBe("2026-11-01T07:00");
    });

    it("Australia/Sydney, 2026-04-05 (03:00 AEDT becomes 02:00 AEST)", () => {
      expect(instantOf("2026-04-05", "01:59", "Australia/Sydney")).toBe("2026-04-04T14:59");
      expect(instantOf("2026-04-05", "02:30", "Australia/Sydney")).toBe("2026-04-04T15:30");
      expect(instantOf("2026-04-05", "03:00", "Australia/Sydney")).toBe("2026-04-04T17:00");
    });
  });

  it("never goes backwards as the wall clock advances through a transition day", () => {
    const transitionDays: [string, string][] = [
      ["Europe/London", "2026-03-29"],
      ["Europe/London", "2026-10-25"],
      ["America/New_York", "2026-03-08"],
      ["America/New_York", "2026-11-01"],
      ["Australia/Sydney", "2026-04-05"],
      ["Australia/Sydney", "2026-10-04"],
      ["Africa/Cairo", "2026-04-24"],
    ];
    for (const [zone, date] of transitionDays) {
      let previous = zonedDateTimeToEpochMs(addDays(date, -1), "23:59", zone);
      for (let minutes = 0; minutes < 1440; minutes++) {
        const instant = zonedDateTimeToEpochMs(date, minutesToTime(minutes), zone);
        if (instant < previous) throw new Error(`${zone} ${date} ${minutesToTime(minutes)} went backwards`);
        previous = instant;
      }
      expect(zonedDateTimeToEpochMs(addDays(date, 1), "00:00", zone)).toBeGreaterThan(previous);
    }
  });

  it("round-trips with zonedNow through a whole year in every test zone", () => {
    const zones = [
      "Europe/London",
      "America/New_York",
      "Asia/Karachi",
      "Australia/Sydney",
      "Asia/Kathmandu",
      "Australia/Lord_Howe",
    ];
    // 97 minutes is coprime with the hour, so every minute-of-hour gets sampled.
    const step = 97 * MINUTE;
    const end = utc("2027-01-01T00:00:00");
    for (const zone of zones) {
      for (let instant = utc("2026-01-01T00:00:00"); instant < end; instant += step) {
        const wall = zonedNow(zone, instant);
        const back = zonedDateTimeToEpochMs(wall.date, wall.time, zone);
        if (back === instant) continue;
        // The only legitimate difference: `instant` is the second pass through
        // a repeated hour, and the conversion picked the first pass.
        const firstPass = zonedNow(zone, back);
        const repeated = back < instant && firstPass.date === wall.date && firstPass.time === wall.time;
        if (!repeated) throw new Error(`${zone} ${new Date(instant).toISOString()} did not round-trip`);
      }
    }
  });

  it("round-trips every minute of both London clock-change days", () => {
    for (const date of ["2026-03-29", "2026-10-25", "2027-03-28"]) {
      const start = zonedDateTimeToEpochMs(date, "00:00", "Europe/London");
      const end = zonedDateTimeToEpochMs(addDays(date, 1), "00:00", "Europe/London");
      // 23 real hours in spring, 25 in autumn.
      expect((end - start) / HOUR).toBe(date === "2026-10-25" ? 25 : 23);
      let repeatedMinutes = 0;
      for (let instant = start; instant < end; instant += MINUTE) {
        const wall = zonedNow("Europe/London", instant);
        expect(wall.date).toBe(date);
        const back = zonedDateTimeToEpochMs(wall.date, wall.time, "Europe/London");
        if (back !== instant) {
          expect(instant - back).toBe(HOUR);
          repeatedMinutes++;
        }
      }
      expect(repeatedMinutes).toBe(date === "2026-10-25" ? 60 : 0);
    }
  });

  it("gives every calendar day of the year a start that is 23, 24 or 25 hours long", () => {
    const lengths = new Map<number, number>();
    for (const date of listDates("2026-01-01", "2026-12-31")) {
      const start = zonedDateTimeToEpochMs(date, "00:00", "Europe/London");
      const next = zonedDateTimeToEpochMs(addDays(date, 1), "00:00", "Europe/London");
      const hours = (next - start) / HOUR;
      lengths.set(hours, (lengths.get(hours) ?? 0) + 1);
    }
    expect(lengths.get(23)).toBe(1);
    expect(lengths.get(25)).toBe(1);
    expect(lengths.get(24)).toBe(363);
  });

  it("returns the same answer when asked again (served from the cache)", () => {
    const first = zonedDateTimeToEpochMs("2026-10-25", "01:30", "Europe/London");
    expect(zonedDateTimeToEpochMs("2026-10-25", "01:30", "Europe/London")).toBe(first);
    // Same wall time, different zone: must not be confused with the entry above.
    expect(zonedDateTimeToEpochMs("2026-10-25", "01:30", "Asia/Karachi")).toBe(first - 4 * HOUR);
  });

  it("throws on an invalid date, time or zone", () => {
    expect(() => zonedDateTimeToEpochMs("2026-02-30", "12:00", "Europe/London")).toThrow(RangeError);
    expect(() => zonedDateTimeToEpochMs("2026-02-28", "24:00", "Europe/London")).toThrow(RangeError);
    expect(() => zonedDateTimeToEpochMs("2026-02-28", "12:00", "Mars/Phobos")).toThrow(RangeError);
  });
});

describe("listTimeZones", () => {
  it("lists the runtime's zones with UTC first and no duplicates", () => {
    const zones = listTimeZones();
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("Europe/London");
    expect(zones).toContain("Asia/Karachi");
    expect(zones.length).toBeGreaterThan(300);
    expect(new Set(zones).size).toBe(zones.length);
    for (const zone of zones) {
      if (!isValidTimeZone(zone)) throw new Error(`listed zone is not usable: ${zone}`);
    }
  });

  it("offers a built-in list on runtimes that cannot enumerate their zones", () => {
    const withoutEnumeration: typeof Intl = Object.create(Intl);
    Object.defineProperty(withoutEnumeration, "supportedValuesOf", { value: undefined });
    vi.stubGlobal("Intl", withoutEnumeration);

    const zones = listTimeZones();
    expect(zones[0]).toBe("UTC");
    expect(zones.length).toBeGreaterThan(50);
    expect(zones.length).toBeLessThan(200);
    expect(zones).toContain("Europe/London");
    expect(zones).toContain("Asia/Karachi");
    expect(zones).toContain("America/New_York");
    expect(new Set(zones).size).toBe(zones.length);
    expect(zones.slice(1)).toEqual(zones.slice(1).sort());
    for (const zone of zones) {
      if (!isValidTimeZone(zone)) throw new Error(`built-in zone is not usable: ${zone}`);
    }
  });
});
