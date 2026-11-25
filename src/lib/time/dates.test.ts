import { describe, expect, it } from "vitest";
import {
  MAX_LISTED_DATES,
  addDays,
  addMonths,
  civilToEpochDay,
  compareTimes,
  dateToUtcMs,
  daysInMonth,
  diffDays,
  epochDayToCivil,
  firstDayOfMonth,
  fromEpochDay,
  isFriday,
  isLeapYear,
  isValidDateString,
  isValidMonthString,
  isValidTimeString,
  lastDayOfMonth,
  listDates,
  minutesToTime,
  monthOf,
  parseDateParts,
  parseTimeToMinutes,
  toDateString,
  toEpochDay,
  weekdayOf,
  yearOf,
} from "./dates";

describe("isValidDateString", () => {
  it.each(["2026-11-25", "2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])(
    "accepts %s",
    (value) => {
      expect(isValidDateString(value)).toBe(true);
    },
  );

  it.each([
    "2026-02-29", // not a leap year
    "1900-02-29", // century years are leap only when divisible by 400
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-11-00",
    "0000-01-01",
    "2026-1-5",
    "26-11-25",
    "2026/11/25",
    "2026-11-25T00:00:00Z",
    " 2026-11-25",
    "",
  ])("rejects %j", (value) => {
    expect(isValidDateString(value)).toBe(false);
  });

  it("rejects values that are not strings", () => {
    expect(isValidDateString(null)).toBe(false);
    expect(isValidDateString(undefined)).toBe(false);
    expect(isValidDateString(20261125)).toBe(false);
    expect(isValidDateString(new Date(0))).toBe(false);
  });
});

describe("isValidMonthString", () => {
  it("accepts YYYY-MM only", () => {
    expect(isValidMonthString("2026-11")).toBe(true);
    expect(isValidMonthString("2026-01")).toBe(true);
    expect(isValidMonthString("2026-13")).toBe(false);
    expect(isValidMonthString("2026-00")).toBe(false);
    expect(isValidMonthString("0000-05")).toBe(false);
    expect(isValidMonthString("2026-11-25")).toBe(false);
    expect(isValidMonthString("2026-1")).toBe(false);
    expect(isValidMonthString(202611)).toBe(false);
  });
});

describe("isValidTimeString", () => {
  it.each(["00:00", "05:42", "12:00", "18:07", "23:59"])("accepts %s", (value) => {
    expect(isValidTimeString(value)).toBe(true);
  });

  it.each(["24:00", "23:60", "5:42", "05:4", "05.42", "05:42:10", "5:42 PM", " 05:42", ""])(
    "rejects %j",
    (value) => {
      expect(isValidTimeString(value)).toBe(false);
    },
  );

  it("rejects values that are not strings", () => {
    expect(isValidTimeString(null)).toBe(false);
    expect(isValidTimeString(undefined)).toBe(false);
    expect(isValidTimeString(542)).toBe(false);
  });
});

describe("time of day", () => {
  it("parses HH:mm into minutes since midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("05:42")).toBe(342);
    expect(parseTimeToMinutes("17:05")).toBe(1025);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("refuses to parse a malformed time", () => {
    expect(() => parseTimeToMinutes("24:00")).toThrow(RangeError);
    expect(() => parseTimeToMinutes("5:42")).toThrow(RangeError);
    expect(() => parseTimeToMinutes(null as unknown as string)).toThrow(RangeError);
  });

  it("turns minutes back into HH:mm", () => {
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(342)).toBe("05:42");
    expect(minutesToTime(1439)).toBe("23:59");
  });

  it("round-trips every minute of the day", () => {
    for (let minutes = 0; minutes < 1440; minutes++) {
      expect(parseTimeToMinutes(minutesToTime(minutes))).toBe(minutes);
    }
  });

  it("wraps around midnight instead of producing an invalid time", () => {
    expect(minutesToTime(1440)).toBe("00:00");
    expect(minutesToTime(1445)).toBe("00:05");
    expect(minutesToTime(-5)).toBe("23:55");
    expect(minutesToTime(-1440)).toBe("00:00");
    expect(minutesToTime(342.9)).toBe("05:42");
  });

  it("refuses non-finite minutes", () => {
    expect(() => minutesToTime(Number.NaN)).toThrow(RangeError);
    expect(() => minutesToTime(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("orders times numerically", () => {
    expect(compareTimes("05:42", "18:07")).toBeLessThan(0);
    expect(compareTimes("18:07", "05:42")).toBeGreaterThan(0);
    expect(compareTimes("12:00", "12:00")).toBe(0);
    expect(["18:07", "00:10", "13:15", "05:42"].sort(compareTimes)).toEqual([
      "00:10",
      "05:42",
      "13:15",
      "18:07",
    ]);
    expect(() => compareTimes("12:00", "noon")).toThrow(RangeError);
  });
});

describe("leap years and month lengths", () => {
  it("applies the Gregorian leap-year rule", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
  });

  it("knows the length of every month", () => {
    const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => daysInMonth(2026, month));
    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it("refuses a month outside 1 to 12", () => {
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 1.5)).toThrow(RangeError);
  });
});

describe("day numbers", () => {
  it("anchors 1970-01-01 at zero", () => {
    expect(toEpochDay("1970-01-01")).toBe(0);
    expect(toEpochDay("1970-01-02")).toBe(1);
    expect(toEpochDay("1969-12-31")).toBe(-1);
    expect(fromEpochDay(0)).toBe("1970-01-01");
    expect(fromEpochDay(-1)).toBe("1969-12-31");
  });

  it("agrees with Date.UTC for every day from 1899 to 2101", () => {
    const first = Date.UTC(1899, 0, 1) / 86400000;
    const last = Date.UTC(2101, 0, 1) / 86400000;
    for (let epochDay = first; epochDay <= last; epochDay++) {
      const expected = new Date(epochDay * 86400000).toISOString().slice(0, 10);
      const actual = fromEpochDay(epochDay);
      if (actual !== expected || toEpochDay(expected) !== epochDay) {
        throw new Error(`day ${epochDay}: expected ${expected}, got ${actual}`);
      }
    }
  });

  it("round-trips dates far from the present, including year 1 and year 9999", () => {
    for (const date of ["0001-01-01", "0622-07-19", "1582-10-15", "9999-12-31"]) {
      expect(fromEpochDay(toEpochDay(date))).toBe(date);
    }
    // 0001-01-01 is 719162 days before 1970-01-01 in the proleptic Gregorian calendar.
    expect(toEpochDay("0001-01-01")).toBe(-719162);
  });

  it("converts numeric components both ways", () => {
    expect(civilToEpochDay(2026, 11, 25)).toBe(Date.UTC(2026, 10, 25) / 86400000);
    expect(epochDayToCivil(civilToEpochDay(2024, 2, 29))).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("gives the UTC-midnight handle used for calendar formatting", () => {
    expect(dateToUtcMs("2026-11-25")).toBe(Date.UTC(2026, 10, 25));
    expect(dateToUtcMs("1970-01-01")).toBe(0);
  });

  it("refuses results outside the supported years and fractional day numbers", () => {
    expect(() => fromEpochDay(toEpochDay("9999-12-31") + 1)).toThrow(RangeError);
    expect(() => fromEpochDay(toEpochDay("0001-01-01") - 1)).toThrow(RangeError);
    expect(() => fromEpochDay(1.5)).toThrow(RangeError);
  });
});

describe("parseDateParts and toDateString", () => {
  it("splits and rebuilds a date", () => {
    expect(parseDateParts("2026-11-05")).toEqual({ year: 2026, month: 11, day: 5 });
    expect(toDateString(2026, 11, 5)).toBe("2026-11-05");
    expect(toDateString(622, 7, 19)).toBe("0622-07-19");
  });

  it("throws on anything that is not a real date", () => {
    expect(() => parseDateParts("2026-02-30")).toThrow(RangeError);
    expect(() => parseDateParts("tomorrow")).toThrow(RangeError);
    expect(() => toDateString(2026, 2, 29)).toThrow(RangeError);
    expect(() => toDateString(2026, 13, 1)).toThrow(RangeError);
    expect(() => toDateString(10000, 1, 1)).toThrow(RangeError);
    expect(() => toDateString(2026, 1.5, 1)).toThrow(RangeError);
  });
});

describe("addDays and diffDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-25", 0)).toBe("2026-11-25");
  });

  it("handles leap days", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 365)).toBe("2025-02-28");
    expect(addDays("2024-02-29", 366)).toBe("2025-03-01");
    expect(addDays("2023-02-28", 365)).toBe("2024-02-28");
  });

  it("is unaffected by DST changes in any timezone", () => {
    // Both dates are clock-change days in Europe/London; a calendar day is still one day.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("measures the distance from the first date to the second", () => {
    expect(diffDays("2026-11-25", "2026-11-28")).toBe(3);
    expect(diffDays("2026-11-28", "2026-11-25")).toBe(-3);
    expect(diffDays("2026-11-25", "2026-11-25")).toBe(0);
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
    expect(diffDays("2024-01-01", "2025-01-01")).toBe(366);
    expect(diffDays("2025-01-01", "2026-01-01")).toBe(365);
  });

  it("refuses invalid input", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("2026-11-25", 0.5)).toThrow(RangeError);
    expect(() => addDays("9999-12-31", 1)).toThrow(RangeError);
    expect(() => diffDays("2026-11-25", "soon")).toThrow(RangeError);
  });
});

describe("weekdays", () => {
  it("numbers the week from Sunday", () => {
    expect(weekdayOf("2026-11-22")).toBe(0); // Sunday
    expect(weekdayOf("2026-11-25")).toBe(3); // Wednesday
    expect(weekdayOf("2026-11-27")).toBe(5); // Friday
    expect(weekdayOf("2026-11-28")).toBe(6); // Saturday
    expect(weekdayOf("1970-01-01")).toBe(4); // Thursday
    expect(weekdayOf("1969-12-28")).toBe(0); // before the epoch
    expect(weekdayOf("2000-01-01")).toBe(6);
  });

  it("agrees with Date#getUTCDay across a leap year", () => {
    for (const date of listDates("2024-01-01", "2024-12-31")) {
      expect(weekdayOf(date)).toBe(new Date(`${date}T00:00:00Z`).getUTCDay());
    }
  });

  it("recognises Fridays", () => {
    expect(isFriday("2026-11-27")).toBe(true);
    expect(isFriday("2026-11-26")).toBe(false);
    expect(isFriday("2026-11-28")).toBe(false);
    expect(isFriday("2024-02-29")).toBe(false);
    expect(isFriday("2024-03-01")).toBe(true);
  });
});

describe("listDates", () => {
  it("lists both ends inclusively", () => {
    expect(listDates("2026-11-29", "2026-12-02")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(listDates("2026-11-25", "2026-11-25")).toEqual(["2026-11-25"]);
  });

  it("returns nothing for a reversed range", () => {
    expect(listDates("2026-11-26", "2026-11-25")).toEqual([]);
  });

  it("covers a leap February and a whole year", () => {
    expect(listDates("2024-02-01", "2024-02-29")).toHaveLength(29);
    expect(listDates("2026-01-01", "2026-12-31")).toHaveLength(365);
    expect(listDates("2024-01-01", "2024-12-31")).toHaveLength(366);
  });

  it("refuses absurd ranges", () => {
    const start = "2000-01-01";
    expect(listDates(start, addDays(start, MAX_LISTED_DATES - 1))).toHaveLength(MAX_LISTED_DATES);
    expect(() => listDates(start, addDays(start, MAX_LISTED_DATES))).toThrow(RangeError);
    expect(() => listDates("0001-01-01", "9999-12-31")).toThrow(RangeError);
  });
});

describe("months", () => {
  it("extracts the month and the year of a date", () => {
    expect(monthOf("2026-11-25")).toBe("2026-11");
    expect(monthOf("2027-01-01")).toBe("2027-01");
    expect(yearOf("2026-11-25")).toBe(2026);
    expect(yearOf("0622-07-19")).toBe(622);
    expect(() => monthOf("2026-11")).toThrow(RangeError);
    expect(() => yearOf("2026")).toThrow(RangeError);
  });

  it("finds the first and last day of a month", () => {
    expect(firstDayOfMonth("2026-11")).toBe("2026-11-01");
    expect(lastDayOfMonth("2026-11")).toBe("2026-11-30");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2024-02")).toBe("2024-02-29");
    expect(lastDayOfMonth("2100-02")).toBe("2100-02-28");
  });

  it("accepts any date inside the month", () => {
    expect(firstDayOfMonth("2026-11-25")).toBe("2026-11-01");
    expect(lastDayOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(addMonths("2026-11-25", 1)).toBe("2026-12");
  });

  it("adds months across year boundaries in both directions", () => {
    expect(addMonths("2026-11", 0)).toBe("2026-11");
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
    expect(addMonths("2026-11", 14)).toBe("2028-01");
    expect(addMonths("2026-12", -12)).toBe("2025-12");
  });

  it("refuses invalid months and out-of-range results", () => {
    expect(() => firstDayOfMonth("2026-13")).toThrow(RangeError);
    expect(() => lastDayOfMonth("November")).toThrow(RangeError);
    expect(() => addMonths("2026-11", 0.5)).toThrow(RangeError);
    expect(() => addMonths("9999-12", 1)).toThrow(RangeError);
    expect(() => addMonths("0001-01", -1)).toThrow(RangeError);
  });
});
