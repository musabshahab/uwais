import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { announcementInputSchema, prayerDaySchema, siteSettingsSchema } from "@/lib/db/schemas";
import {
  failure,
  issueMessage,
  unauthenticatedFailure,
  unexpectedFailure,
  validationFailure,
} from "./result";

afterEach(() => {
  vi.restoreAllMocks();
});

/** The error of a schema that is known to reject `input`. */
function errorOf(schema: z.ZodType, input: unknown): z.ZodError {
  const parsed = schema.safeParse(input);
  if (parsed.success) throw new Error("expected the schema to reject the input");
  return parsed.error;
}

describe("failure", () => {
  it("leaves fieldErrors out when there are none", () => {
    expect(failure("invalid", "No.")).toStrictEqual({ ok: false, code: "invalid", error: "No." });
    expect(failure("invalid", "No.", {})).not.toHaveProperty("fieldErrors");
  });

  it("carries field errors when there are some", () => {
    expect(failure("invalid", "No.", { title: "Enter a title" })).toStrictEqual({
      ok: false,
      code: "invalid",
      error: "No.",
      fieldErrors: { title: "Enter a title" },
    });
  });
});

describe("unauthenticatedFailure", () => {
  it("says nothing was saved and how to carry on", () => {
    const result = unauthenticatedFailure();
    expect(result.code).toBe("unauthenticated");
    expect(result.error).toMatch(/signed out/i);
    expect(result.error).toMatch(/nothing was saved/i);
  });
});

describe("unexpectedFailure", () => {
  it("logs the error on the server and tells the browser nothing about it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("SQLITE_CANTOPEN: unable to open /srv/secret/uwais.db");

    const result = unexpectedFailure("saveDay", error);

    expect(log).toHaveBeenCalledWith("[action] saveDay failed", error);
    expect(result.code).toBe("failed");
    expect(JSON.stringify(result)).not.toMatch(/SQLITE|secret|uwais\.db|stack/i);
    expect(result).not.toHaveProperty("fieldErrors");
  });
});

describe("issueMessage", () => {
  it("digs the schema's own wording out of a failed union", () => {
    const error = errorOf(prayerDaySchema, { date: "2027-01-01", fajrBegins: "25:99" });
    expect(issueMessage(error.issues[0])).toBe("Enter a time as HH:mm (24-hour)");
  });

  it("falls back to a plain sentence when a union only failed on types", () => {
    const error = errorOf(prayerDaySchema, { date: "2027-01-01", fajrBegins: 5 });
    expect(issueMessage(error.issues[0])).toBe("This value is not valid.");
  });

  it("reads a missing value as a required field and any other wrong type as not valid", () => {
    expect(issueMessage(errorOf(z.object({ a: z.string() }), {}).issues[0])).toBe(
      "This field is required.",
    );
    expect(issueMessage(errorOf(z.object({ a: z.string() }), { a: null }).issues[0])).toBe(
      "This field is required.",
    );
    expect(issueMessage(errorOf(z.object({ a: z.string() }), { a: 7 }).issues[0])).toBe(
      "This value is not valid.",
    );
  });

  it("replaces zod's wording for an unknown option", () => {
    const error = errorOf(z.object({ theme: z.enum(["night", "day"]) }), { theme: "dusk" });
    expect(issueMessage(error.issues[0])).toBe("Choose one of the listed options.");
  });

  it("keeps messages the schema worded itself", () => {
    const error = errorOf(announcementInputSchema, { title: "" });
    expect(issueMessage(error.issues[0])).toBe("Enter a title");
  });

  it("keeps the schema's wording when zod files the check under a wrong type or option", () => {
    // zod reports a fraction against `.int()` as a wrong type.
    const whole = z.object({ days: z.number().int("Enter a whole number of days") });
    const fraction = errorOf(whole, { days: 1.5 });
    expect(fraction.issues[0].code).toBe("invalid_type");
    expect(issueMessage(fraction.issues[0])).toBe("Enter a whole number of days");

    const worded = z.object({
      name: z.string("Enter a name"),
      theme: z.enum(["night", "day"], "Pick night or day"),
    });
    const issues = errorOf(worded, { theme: "dusk" }).issues;
    expect(issues.map(issueMessage)).toStrictEqual(["Enter a name", "Pick night or day"]);
  });

  it("finds a schema-worded message inside a union whatever its code", () => {
    const schema = z.object({
      days: z.union([z.literal(""), z.number().int("Enter a whole number of days")]),
    });
    expect(issueMessage(errorOf(schema, { days: 1.5 }).issues[0])).toBe("Enter a whole number of days");
  });
});

describe("validationFailure", () => {
  it("keys messages by dotted path and keeps the first message per field", () => {
    const schema = z.object({
      name: z.string().min(3, "Too short").regex(/^[a-z]+$/, "Letters only"),
      tv: z.object({ theme: z.enum(["night", "day"]) }),
      slots: z.array(z.object({ time: z.string().min(1, "Enter a time") })),
    });
    const result = validationFailure(
      errorOf(schema, { name: "A", tv: { theme: "x" }, slots: [{ time: "1" }, { time: "" }] }),
    );

    expect(result.code).toBe("invalid");
    expect(result.fieldErrors).toStrictEqual({
      name: "Too short",
      "tv.theme": "Choose one of the listed options.",
      "slots.1.time": "Enter a time",
    });
  });

  it("names the first problem with its label and counts the rest", () => {
    const error = errorOf(prayerDaySchema, {
      date: "2027-01-01",
      fajrBegins: "6am",
      ishaJamaat: "late",
      note: "x".repeat(121),
    });
    const result = validationFailure(error, { labels: { fajrBegins: "Fajr Begins" } });

    expect(result.error).toBe(
      "Fajr Begins: Enter a time as HH:mm (24-hour). 2 more fields need attention.",
    );
    expect(Object.keys(result.fieldErrors ?? {})).toStrictEqual(["fajrBegins", "ishaJamaat", "note"]);
  });

  it("uses the singular for one more field and no count for none", () => {
    const two = errorOf(prayerDaySchema, { date: "2027-01-01", fajrBegins: "x", sunrise: "y" });
    expect(validationFailure(two).error).toBe(
      "Enter a time as HH:mm (24-hour). 1 more field needs attention.",
    );
    const one = errorOf(prayerDaySchema, { date: "2027-01-01", fajrBegins: "x" });
    expect(validationFailure(one).error).toBe("Enter a time as HH:mm (24-hour).");
  });

  it("labels a nested field with the label of its parent when it has none of its own", () => {
    const error = errorOf(siteSettingsSchema.pick({ jumuah: true }), {
      jumuah: [{ label: "First", time: "1pm" }],
    });
    const result = validationFailure(error, { labels: { jumuah: "Jumu'ah times" } });
    expect(result.error).toBe("Jumu'ah times: Enter a time as HH:mm (24-hour).");
    expect(result.fieldErrors).toStrictEqual({ "jumuah.0.time": "Enter a time as HH:mm (24-hour)" });
  });

  it("renames schema paths to the caller's field names", () => {
    const error = errorOf(z.object({ a: z.string() }), {});
    const result = validationFailure(error, { rename: (key) => `form.${key}` });
    expect(result.fieldErrors).toStrictEqual({ "form.a": "This field is required." });
  });

  it("lets messages found before the schema ran win over the schema's", () => {
    const error = errorOf(z.object({ minutes: z.number(), name: z.string() }), {});
    const result = validationFailure(error, { fieldErrors: { minutes: "Enter a number." } });
    expect(result.fieldErrors).toStrictEqual({
      minutes: "Enter a number.",
      name: "This field is required.",
    });
    expect(result.error).toBe("Enter a number. 1 more field needs attention.");
  });

  it("works from earlier messages alone", () => {
    const result = validationFailure(null, { fieldErrors: { minutes: "Enter a number." } });
    expect(result).toStrictEqual({
      ok: false,
      code: "invalid",
      error: "Enter a number.",
      fieldErrors: { minutes: "Enter a number." },
    });
  });

  it("answers input that is not an object at all with a general message and no field errors", () => {
    const result = validationFailure(errorOf(prayerDaySchema, "tomorrow"));
    expect(result.code).toBe("invalid");
    expect(result.error).toMatch(/could not be read/);
    expect(result).not.toHaveProperty("fieldErrors");
  });

  it("uses a check on the whole object as the message when no field is at fault", () => {
    const schema = z.object({ a: z.number(), b: z.number() }).refine((v) => v.a < v.b, "a must be below b");
    expect(validationFailure(errorOf(schema, { a: 2, b: 1 })).error).toBe("a must be below b");
  });
});
