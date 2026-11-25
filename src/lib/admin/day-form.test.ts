import { describe, expect, it } from "vitest";
import { MAX_JUMUAH_SLOTS, prayerDaySchema } from "@/lib/db/schemas";
import { TIME_FIELDS, type PrayerDay } from "@/lib/types";
import {
  DAY_TIME_GROUPS,
  copyTimesFrom,
  dayFormsEqual,
  dayToForm,
  formToDayInput,
  isDayFormBlank,
  jumuahError,
} from "./day-form";

const FRIDAY: PrayerDay = {
  date: "2027-01-01",
  fajrBegins: "06:25",
  fajrJamaat: "06:45",
  sunrise: "08:06",
  dhuhrBegins: "12:09",
  dhuhrJamaat: "13:00",
  asrBegins: "13:46",
  asrJamaat: "14:00",
  maghribBegins: "16:05",
  maghribJamaat: "16:10",
  ishaBegins: "17:38",
  ishaJamaat: "18:00",
  jumuah: ["12:30", "13:30"],
  note: "Bank holiday",
};

describe("dayToForm", () => {
  it("gives an empty form for a date with nothing stored", () => {
    const form = dayToForm(null);
    expect(TIME_FIELDS.every((field) => form.times[field] === "")).toBe(true);
    expect(form.jumuah).toEqual(Array.from({ length: MAX_JUMUAH_SLOTS }, () => ""));
    expect(form.note).toBe("");
    expect(isDayFormBlank(form)).toBe(true);
  });

  it("fills the form from a stored day and pads the Jumu'ah slots", () => {
    const form = dayToForm(FRIDAY);
    expect(form.times.fajrBegins).toBe("06:25");
    expect(form.times.ishaJamaat).toBe("18:00");
    expect(form.jumuah).toEqual(["12:30", "13:30", "", ""]);
    expect(form.note).toBe("Bank holiday");
    expect(isDayFormBlank(form)).toBe(false);
  });
});

describe("formToDayInput", () => {
  it("round-trips a stored day through the schema", () => {
    const input = formToDayInput(FRIDAY.date, dayToForm(FRIDAY), true);
    expect(prayerDaySchema.parse(input)).toEqual(FRIDAY);
  });

  it("sends a cleared time as null so the stored value is removed", () => {
    const form = dayToForm(FRIDAY);
    form.times.sunrise = "";
    const input = formToDayInput(FRIDAY.date, form, true);
    expect(input.sunrise).toBeNull();
    expect(input.fajrBegins).toBe("06:25");
  });

  it("names every time field, so nothing keeps a stale value", () => {
    const input = formToDayInput("2027-01-02", dayToForm(null), false);
    for (const field of TIME_FIELDS) expect(input[field]).toBeNull();
    expect(input.jumuah).toEqual([]);
    expect(input.note).toBeNull();
  });

  it("leaves Jumu'ah times out on a day that is not a Friday", () => {
    const input = formToDayInput("2027-01-02", dayToForm(FRIDAY), false);
    expect(input.jumuah).toEqual([]);
  });

  it("skips empty Jumu'ah slots between filled ones", () => {
    const form = dayToForm(null);
    form.jumuah = ["12:30", "", "13:30", ""];
    expect(formToDayInput("2027-01-01", form, true).jumuah).toEqual(["12:30", "13:30"]);
  });

  it("drops seconds a browser may add", () => {
    const form = dayToForm(null);
    form.times.fajrBegins = "05:30:00";
    form.jumuah[0] = "13:15:00";
    const input = formToDayInput("2027-01-01", form, true);
    expect(input.fajrBegins).toBe("05:30");
    expect(input.jumuah).toEqual(["13:15"]);
  });

  it("treats a note of spaces as no note", () => {
    const form = dayToForm(null);
    form.note = "   ";
    expect(formToDayInput("2027-01-01", form, true).note).toBeNull();
  });
});

describe("copyTimesFrom", () => {
  it("takes the prayer times and keeps the day's own note and Jumu'ah times", () => {
    const form = dayToForm(null);
    form.note = "Eid al-Fitr";
    form.jumuah[0] = "13:00";
    const copied = copyTimesFrom(form, FRIDAY);
    expect(copied.times.maghribBegins).toBe("16:05");
    expect(copied.note).toBe("Eid al-Fitr");
    expect(copied.jumuah[0]).toBe("13:00");
    expect(form.times.maghribBegins).toBe("");
  });

  it("clears a time the source day does not have", () => {
    const form = dayToForm(FRIDAY);
    const copied = copyTimesFrom(form, { ...FRIDAY, sunrise: null });
    expect(copied.times.sunrise).toBe("");
  });
});

describe("dayFormsEqual", () => {
  it("compares every part of the form", () => {
    const base = dayToForm(FRIDAY);
    expect(dayFormsEqual(base, dayToForm(FRIDAY))).toBe(true);
    expect(dayFormsEqual(base, { ...base, note: "x" })).toBe(false);
    expect(dayFormsEqual(base, { ...base, times: { ...base.times, asrJamaat: "14:15" } })).toBe(false);
    expect(dayFormsEqual(base, { ...base, jumuah: ["12:30", "13:45", "", ""] })).toBe(false);
  });
});

describe("jumuahError", () => {
  it("finds an error for the list or for one slot", () => {
    expect(jumuahError({ jumuah: "Too many" })).toBe("Too many");
    expect(jumuahError({ "jumuah.1": "Enter a time as HH:mm (24-hour)" })).toBe("Enter a time as HH:mm (24-hour)");
  });

  it("returns null when there is none", () => {
    expect(jumuahError(undefined)).toBeNull();
    expect(jumuahError({ note: "Too long" })).toBeNull();
  });
});

describe("DAY_TIME_GROUPS", () => {
  it("covers every time field once, in the order of the day", () => {
    const fields = DAY_TIME_GROUPS.flatMap((group) => group.columns.map((column) => column.field));
    expect(fields).toEqual([...TIME_FIELDS]);
  });

  it("puts sunrise after Fajr with a single time", () => {
    expect(DAY_TIME_GROUPS.map((group) => group.name)).toEqual(["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]);
    expect(DAY_TIME_GROUPS[1].columns).toEqual([{ field: "sunrise", label: "Time", fullLabel: "Sunrise" }]);
    expect(DAY_TIME_GROUPS[0].columns[1].fullLabel).toBe("Fajr jamaat");
  });
});
