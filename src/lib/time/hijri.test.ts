import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, diffDays, listDates } from "./dates";
import {
  HIJRI_MONTH_NAMES,
  HIJRI_MONTH_NAMES_ARABIC,
  type HijriDate,
  formatHijri,
  hijriForMoment,
  hijriFromDate,
  hijriFromDateTabular,
  hijriFromDateUmmAlQura,
  isRamadan,
} from "./hijri";

/** `year-month-day` of a Hijri date, for compact assertions. */
function ymd(hijri: HijriDate | null): string {
  return hijri ? `${hijri.year}-${hijri.month}-${hijri.day}` : "unsupported";
}

/**
 * Loads a fresh copy of the module on a runtime whose `Intl.DateTimeFormat`
 * is replaced, leaving the rest of `Intl` intact. A fresh copy is needed
 * because the module probes the runtime once and remembers the answer.
 */
async function loadHijriWithDateTimeFormat(replacement: unknown): Promise<typeof import("./hijri")> {
  const fakeIntl: typeof Intl = Object.create(Intl);
  Object.defineProperty(fakeIntl, "DateTimeFormat", { value: replacement });
  vi.stubGlobal("Intl", fakeIntl);
  vi.resetModules();
  return import("./hijri");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("month names", () => {
  it("has twelve names in each language, in calendar order", () => {
    expect(HIJRI_MONTH_NAMES).toHaveLength(12);
    expect(HIJRI_MONTH_NAMES_ARABIC).toHaveLength(12);
    expect(HIJRI_MONTH_NAMES[0]).toBe("Muharram");
    expect(HIJRI_MONTH_NAMES[4]).toBe("Jumada al-Awwal");
    expect(HIJRI_MONTH_NAMES[8]).toBe("Ramadan");
    expect(HIJRI_MONTH_NAMES[11]).toBe("Dhu al-Hijjah");
    expect(HIJRI_MONTH_NAMES_ARABIC[8]).toBe("رمضان");
  });

  it("uses the same Arabic names as the runtime's own Islamic calendar", () => {
    const arabic = new Intl.DateTimeFormat("ar-u-ca-islamic-umalqura", { month: "long", timeZone: "UTC" });
    const seen = new Map<number, string>();
    for (const date of listDates("2026-01-01", "2026-12-31")) {
      const hijri = hijriFromDate(date);
      if (!seen.has(hijri.month)) seen.set(hijri.month, arabic.format(new Date(`${date}T00:00:00Z`)));
    }
    expect(seen.size).toBe(12);
    for (const [month, name] of seen) expect(HIJRI_MONTH_NAMES_ARABIC[month - 1]).toBe(name);
  });
});

describe("hijriFromDate (Umm al-Qura)", () => {
  // Reference dates from the published Umm al-Qura calendar.
  it.each([
    ["2023-03-23", "1444-9-1"], // 1 Ramadan 1444
    ["2023-07-19", "1445-1-1"], // Islamic new year 1445
    ["2024-03-11", "1445-9-1"], // 1 Ramadan 1445
    ["2024-04-10", "1445-10-1"], // Eid al-Fitr 1445
    ["2024-07-07", "1446-1-1"], // Islamic new year 1446
    ["2025-03-01", "1446-9-1"], // 1 Ramadan 1446
    ["2025-03-30", "1446-10-1"], // Eid al-Fitr 1446
    ["2025-06-06", "1446-12-10"], // Eid al-Adha 1446
    ["2025-06-26", "1447-1-1"], // Islamic new year 1447
    ["2026-02-18", "1447-9-1"], // 1 Ramadan 1447
    ["2026-03-20", "1447-10-1"], // Eid al-Fitr 1447
    ["2026-05-27", "1447-12-10"], // Eid al-Adha 1447
    ["2026-06-16", "1448-1-1"], // Islamic new year 1448
    ["2026-11-25", "1448-6-15"],
    ["2027-02-08", "1448-9-1"], // 1 Ramadan 1448
  ])("converts %s to %s", (date, expected) => {
    expect(ymd(hijriFromDate(date))).toBe(expected);
    expect(ymd(hijriFromDateUmmAlQura(date))).toBe(expected);
  });

  it("attaches the month names", () => {
    expect(hijriFromDate("2026-02-18")).toEqual({
      day: 1,
      month: 9,
      year: 1447,
      monthName: "Ramadan",
      monthNameArabic: "رمضان",
    });
    expect(hijriFromDate("2026-11-25").monthName).toBe("Jumada al-Thani");
    expect(hijriFromDate("2026-06-16").monthNameArabic).toBe("محرم");
  });

  it("moves to the next month the day after a month's last day", () => {
    expect(ymd(hijriFromDate("2026-02-17"))).toBe("1447-8-29");
    expect(ymd(hijriFromDate("2026-03-19"))).toBe("1447-9-30");
    expect(ymd(hijriFromDate("2026-06-15"))).toBe("1447-12-29");
  });

  it("advances one day at a time with months of 29 or 30 days", () => {
    let previous = hijriFromDate("2024-12-31");
    for (const date of listDates("2025-01-01", "2028-12-31")) {
      const current = hijriFromDate(date);
      if (current.day === 1) {
        expect([29, 30]).toContain(previous.day);
        const expectedMonth = previous.month === 12 ? 1 : previous.month + 1;
        expect(current.month).toBe(expectedMonth);
        expect(current.year).toBe(previous.month === 12 ? previous.year + 1 : previous.year);
      } else {
        expect(current.day).toBe(previous.day + 1);
        expect(current.month).toBe(previous.month);
        expect(current.year).toBe(previous.year);
      }
      previous = current;
    }
  });

  it("applies the adjustment as a shift in days, across month boundaries", () => {
    expect(ymd(hijriFromDate("2026-02-18", 0))).toBe("1447-9-1");
    expect(ymd(hijriFromDate("2026-02-18", 1))).toBe("1447-9-2");
    expect(ymd(hijriFromDate("2026-02-18", 2))).toBe("1447-9-3");
    expect(ymd(hijriFromDate("2026-02-18", -1))).toBe("1447-8-29");
    expect(ymd(hijriFromDate("2026-02-18", -2))).toBe("1447-8-28");
    // The last day of the year plus one is the new year.
    expect(ymd(hijriFromDate("2026-06-15", 1))).toBe("1448-1-1");
  });

  it("ignores an unusable adjustment and rounds a fractional one", () => {
    expect(ymd(hijriFromDate("2026-02-18", Number.NaN))).toBe("1447-9-1");
    expect(ymd(hijriFromDate("2026-02-18", 0.6))).toBe("1447-9-2");
  });

  it("returns frozen values that callers cannot corrupt for each other", () => {
    const first = hijriFromDate("2026-02-18");
    expect(Object.isFrozen(first)).toBe(true);
    expect(hijriFromDate("2026-02-18")).toEqual(first);
  });

  it("throws on an invalid date", () => {
    expect(() => hijriFromDate("2026-02-30")).toThrow(RangeError);
    expect(() => hijriFromDateTabular("soon")).toThrow(RangeError);
  });
});

describe("hijriFromDateTabular (fallback)", () => {
  it("places the epoch on 16 July 622 Julian, which is 19 July in the proleptic Gregorian calendar", () => {
    expect(ymd(hijriFromDateTabular("0622-07-19"))).toBe("1-1-1");
    expect(ymd(hijriFromDateTabular("0622-07-18"))).toBe("0-12-29");
    expect(ymd(hijriFromDateTabular("0622-08-17"))).toBe("1-1-30");
    expect(ymd(hijriFromDateTabular("0622-08-18"))).toBe("1-2-1");
  });

  it("converts known tabular dates", () => {
    expect(ymd(hijriFromDateTabular("1970-01-01"))).toBe("1389-10-22");
    expect(ymd(hijriFromDateTabular("2026-02-18"))).toBe("1447-9-1");
    expect(ymd(hijriFromDateTabular("2026-11-25"))).toBe("1448-6-14");
    expect(hijriFromDateTabular("2026-11-25").monthName).toBe("Jumada al-Thani");
  });

  it("alternates months of 30 and 29 days and adds the leap day to Dhu al-Hijjah", () => {
    const lengthsByYear = new Map<number, number[]>();
    let previous = hijriFromDateTabular("2019-08-30");
    for (let date = "2019-08-31"; date <= "2052-01-01"; date = addDays(date, 1)) {
      const current = hijriFromDateTabular(date);
      if (current.day === 1) {
        const lengths = lengthsByYear.get(previous.year) ?? [];
        lengths[previous.month - 1] = previous.day;
        lengthsByYear.set(previous.year, lengths);
      } else if (current.day !== previous.day + 1) {
        throw new Error(`${date}: day ${current.day} follows day ${previous.day}`);
      }
      previous = current;
    }
    const leapYearsOfCycle = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
    let checkedYears = 0;
    for (const [year, lengths] of lengthsByYear) {
      if (lengths.filter((length) => length !== undefined).length !== 12) continue;
      const leap = leapYearsOfCycle.indexOf(year % 30) !== -1;
      expect(lengths).toEqual([30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, leap ? 30 : 29]);
      checkedYears++;
    }
    // A full 30-year cycle, so every leap position is exercised.
    expect(checkedYears).toBeGreaterThanOrEqual(30);
  });

  it("matches the runtime's islamic-civil calendar on every day from 1900 to 2100", () => {
    const civil = new Intl.DateTimeFormat("en-u-ca-islamic-civil-nu-latn", {
      timeZone: "UTC",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
    expect(civil.resolvedOptions().calendar).toBe("islamic-civil");
    for (let date = "1900-01-01"; date <= "2100-01-01"; date = addDays(date, 1)) {
      const parts: Record<string, number> = {};
      for (const part of civil.formatToParts(new Date(`${date}T00:00:00Z`))) {
        if (part.type === "year" || part.type === "month" || part.type === "day") {
          parts[part.type] = Number(part.value);
        }
      }
      const actual = ymd(hijriFromDateTabular(date));
      const expected = `${parts.year}-${parts.month}-${parts.day}`;
      if (actual !== expected) throw new Error(`${date}: expected ${expected}, got ${actual}`);
    }
  });

  it("applies the adjustment as a shift in days", () => {
    expect(ymd(hijriFromDateTabular("2026-02-18", 1))).toBe("1447-9-2");
    // Sha'ban, an even month, always has 29 days in the tabular calendar.
    expect(ymd(hijriFromDateTabular("2026-02-18", -1))).toBe("1447-8-29");
    expect(ymd(hijriFromDateTabular("2026-02-18", -30))).toBe("1447-7-30");
  });

  it("stays close to Umm al-Qura: month starts differ by one day at most, rarely two", () => {
    // Collect the civil date on which each Hijri month starts, in both calendars.
    const ummAlQuraStarts = new Map<string, string>();
    const tabularStarts = new Map<string, string>();
    for (const date of listDates("2020-01-01", "2029-12-31")) {
      const ummAlQura = hijriFromDateUmmAlQura(date);
      if (ummAlQura === null) throw new Error("this runtime is expected to support Umm al-Qura");
      if (ummAlQura.day === 1) ummAlQuraStarts.set(`${ummAlQura.year}-${ummAlQura.month}`, date);
      const tabular = hijriFromDateTabular(date);
      if (tabular.day === 1) tabularStarts.set(`${tabular.year}-${tabular.month}`, date);
    }
    let compared = 0;
    let withinOneDay = 0;
    for (const [month, ummAlQuraStart] of ummAlQuraStarts) {
      const tabularStart = tabularStarts.get(month);
      if (tabularStart === undefined) continue;
      const difference = Math.abs(diffDays(ummAlQuraStart, tabularStart));
      expect(difference).toBeLessThanOrEqual(2);
      if (difference <= 1) withinOneDay++;
      compared++;
    }
    expect(compared).toBeGreaterThan(115);
    expect(withinOneDay / compared).toBeGreaterThan(0.95);
  });
});

describe("hijriFromDate on a runtime without Umm al-Qura", () => {
  it("falls back to the tabular calendar when Intl silently formats Gregorian dates", async () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    // Old engines ignore an unknown calendar and resolve to the locale default.
    const hijri = await loadHijriWithDateTimeFormat(function (
      _locale: string,
      options: Intl.DateTimeFormatOptions,
    ) {
      return new RealDateTimeFormat("en-US", options);
    });
    expect(hijri.hijriFromDateUmmAlQura("2026-11-25")).toBeNull();
    // Umm al-Qura says the 15th; the tabular calendar says the 14th.
    expect(ymd(hijri.hijriFromDate("2026-11-25"))).toBe("1448-6-14");
    expect(hijri.hijriFromDate("2026-11-25")).toEqual(hijriFromDateTabular("2026-11-25"));
    expect(ymd(hijri.hijriFromDate("2026-11-25", 1))).toBe("1448-6-15");
  });

  it("falls back when Intl substitutes a different Islamic calendar", async () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    // The numbers look believable, but they are not Umm al-Qura; the fallback
    // must be our own arithmetic so every such device shows the same date.
    const hijri = await loadHijriWithDateTimeFormat(function (
      _locale: string,
      options: Intl.DateTimeFormatOptions,
    ) {
      return new RealDateTimeFormat("en-u-ca-islamic-nu-latn", options);
    });
    expect(hijri.hijriFromDateUmmAlQura("2026-11-25")).toBeNull();
    expect(hijri.hijriFromDate("2026-11-25")).toEqual(hijriFromDateTabular("2026-11-25"));
  });

  it("falls back when Intl rejects the calendar outright", async () => {
    const hijri = await loadHijriWithDateTimeFormat(function () {
      throw new RangeError("Unsupported calendar");
    });
    expect(hijri.hijriFromDateUmmAlQura("2026-02-18")).toBeNull();
    expect(ymd(hijri.hijriFromDate("2026-02-18"))).toBe("1447-9-1");
  });

  it("falls back when Intl claims the calendar but prints implausible numbers", async () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const hijri = await loadHijriWithDateTimeFormat(function (
      _locale: string,
      options: Intl.DateTimeFormatOptions,
    ) {
      const gregorian = new RealDateTimeFormat("en-US", options);
      return {
        resolvedOptions: () => ({ ...gregorian.resolvedOptions(), calendar: "islamic-umalqura" }),
        formatToParts: (date: Date) => gregorian.formatToParts(date),
      };
    });
    expect(hijri.hijriFromDateUmmAlQura("2026-11-25")).toBeNull();
    expect(ymd(hijri.hijriFromDate("2026-11-25"))).toBe("1448-6-14");
  });
});

describe("hijriForMoment", () => {
  const base = { date: "2026-02-17", maghribTime: "17:21", adjustmentDays: 0 };

  it("moves to the next Hijri day at Maghrib when configured to", () => {
    const before = hijriForMoment({ ...base, minutesOfDay: 17 * 60 + 20, rollAtMaghrib: true });
    const atMaghrib = hijriForMoment({ ...base, minutesOfDay: 17 * 60 + 21, rollAtMaghrib: true });
    const lateEvening = hijriForMoment({ ...base, minutesOfDay: 23 * 60 + 59, rollAtMaghrib: true });
    expect(ymd(before)).toBe("1447-8-29");
    expect(ymd(atMaghrib)).toBe("1447-9-1");
    expect(ymd(lateEvening)).toBe("1447-9-1");
    expect(isRamadan(before)).toBe(false);
    expect(isRamadan(atMaghrib)).toBe(true);
  });

  it("does not roll back after midnight: the new civil day continues the same Hijri day", () => {
    const afterMidnight = hijriForMoment({
      date: "2026-02-18",
      maghribTime: "17:23",
      adjustmentDays: 0,
      minutesOfDay: 5,
      rollAtMaghrib: true,
    });
    expect(ymd(afterMidnight)).toBe("1447-9-1");
  });

  it("changes at midnight when the Maghrib roll is switched off", () => {
    const evening = hijriForMoment({ ...base, minutesOfDay: 23 * 60, rollAtMaghrib: false });
    expect(ymd(evening)).toBe("1447-8-29");
  });

  it("changes at midnight when the Maghrib time is unknown or malformed", () => {
    const unknown = hijriForMoment({ ...base, maghribTime: null, minutesOfDay: 23 * 60, rollAtMaghrib: true });
    const malformed = hijriForMoment({ ...base, maghribTime: "sunset", minutesOfDay: 23 * 60, rollAtMaghrib: true });
    expect(ymd(unknown)).toBe("1447-8-29");
    expect(ymd(malformed)).toBe("1447-8-29");
  });

  it("combines the Maghrib roll with the moon-sighting adjustment", () => {
    const delayed = { ...base, adjustmentDays: -1, rollAtMaghrib: true };
    expect(ymd(hijriForMoment({ ...delayed, minutesOfDay: 12 * 60 }))).toBe("1447-8-28");
    expect(ymd(hijriForMoment({ ...delayed, minutesOfDay: 18 * 60 }))).toBe("1447-8-29");
    const advanced = { ...base, adjustmentDays: 1, rollAtMaghrib: true };
    expect(ymd(hijriForMoment({ ...advanced, minutesOfDay: 12 * 60 }))).toBe("1447-9-1");
    expect(ymd(hijriForMoment({ ...advanced, minutesOfDay: 18 * 60 }))).toBe("1447-9-2");
  });
});

describe("formatHijri and isRamadan", () => {
  it("formats day, month name, year and era", () => {
    expect(formatHijri(hijriFromDate("2026-02-18"))).toBe("1 Ramadan 1447 AH");
    expect(formatHijri(hijriFromDate("2026-11-25"))).toBe("15 Jumada al-Thani 1448 AH");
    expect(formatHijri(hijriFromDateTabular("2026-10-25"))).toMatch(/^\d+ Jumada al-Awwal 1448 AH$/);
  });

  it("recognises Ramadan from its first to its last day only", () => {
    expect(isRamadan(hijriFromDate("2026-02-17"))).toBe(false);
    expect(isRamadan(hijriFromDate("2026-02-18"))).toBe(true);
    expect(isRamadan(hijriFromDate("2026-03-19"))).toBe(true);
    expect(isRamadan(hijriFromDate("2026-03-20"))).toBe(false);
  });
});
