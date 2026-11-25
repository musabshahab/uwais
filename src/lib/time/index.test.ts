import { describe, expect, it } from "vitest";
import * as time from "./index";

describe("time engine barrel", () => {
  it("exposes the functions the screens build on", () => {
    const expected = [
      // tz
      "isValidTimeZone",
      "resolveTimeZone",
      "zoneOffsetMs",
      "zonedNow",
      "zonedDateTimeToEpochMs",
      "listTimeZones",
      // dates
      "isValidDateString",
      "isValidMonthString",
      "isValidTimeString",
      "parseTimeToMinutes",
      "minutesToTime",
      "compareTimes",
      "addDays",
      "diffDays",
      "weekdayOf",
      "isFriday",
      "listDates",
      "monthOf",
      "yearOf",
      "firstDayOfMonth",
      "lastDayOfMonth",
      "daysInMonth",
      "addMonths",
      // format
      "formatTime",
      "formatTimeText",
      "formatTimeOrPlaceholder",
      "formatTimeTextOrPlaceholder",
      "formatDateLong",
      "formatDateMedium",
      "formatMonthYear",
      "formatWeekdayShort",
      "formatWeekdayLong",
      "formatCountdown",
      "formatCountdownClock",
      "formatCountdownWords",
      // hijri
      "hijriFromDate",
      "hijriFromDateTabular",
      "hijriFromDateUmmAlQura",
      "hijriForMoment",
      "formatHijri",
      "isRamadan",
      // schedule
      "computePrayerState",
      "getDayRow",
      "prayerRowsForDay",
      "resolveJumuahSlots",
    ];
    const exported: Record<string, unknown> = time;
    for (const name of expected) {
      if (typeof exported[name] !== "function") throw new Error(`missing export: ${name}`);
    }
    expect(time.TIME_PLACEHOLDER).toBe("--:--");
  });

  it("works end to end through the barrel", () => {
    const now = time.zonedNow("Europe/London", Date.UTC(2026, 10, 25, 17, 5));
    expect(time.formatTimeText(now.time, "12h")).toBe("5:05 PM");
    expect(time.formatDateLong(now.date)).toBe("Wednesday 25 November 2026");
    expect(time.formatHijri(time.hijriFromDate(now.date))).toBe("15 Jumada al-Thani 1448 AH");
  });
});
