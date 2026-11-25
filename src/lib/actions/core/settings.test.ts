import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getSettings, readSettings, saveSettings } from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { DEFAULT_SETTINGS, type SiteSettings } from "@/lib/types";
import type { ActionFailure, SaveSettingsResult } from "../types";
import { saveSettingsFrom } from "./settings";

const NOW = Date.UTC(2026, 10, 25, 12);

/** Every field of the settings form as a browser submits it, with all checkboxes ticked. */
const COMPLETE_FORM: Readonly<Record<string, string>> = {
  mosqueName: "Masjid Al-Noor",
  shortName: "Al-Noor",
  tagline: "A welcoming community",
  address: "12 High Street, Leicester LE1 1AA",
  phone: "+44 (0)116 496 0000",
  email: "office@example.org",
  mapUrl: "https://maps.example.org/al-noor",
  donateUrl: "https://give.example.org/al-noor",
  timezone: "Europe/London",
  timeFormat: "24h",
  hijriAdjustment: "-1",
  hijriRollAtMaghrib: "on",
  "jumuah.0.label": "First Jumu'ah",
  "jumuah.0.time": "12:30",
  "jumuah.1.label": "Second Jumu'ah",
  "jumuah.1.time": "13:30",
  "tv.theme": "day",
  "tv.showSeconds": "on",
  "tv.showSunrise": "on",
  "tv.jamaatInProgressMinutes": "15",
  "tv.announcementSeconds": "20",
};

/** What `COMPLETE_FORM` is stored as. */
const COMPLETE_SETTINGS: SiteSettings = {
  mosqueName: "Masjid Al-Noor",
  shortName: "Al-Noor",
  tagline: "A welcoming community",
  address: "12 High Street, Leicester LE1 1AA",
  phone: "+44 (0)116 496 0000",
  email: "office@example.org",
  mapUrl: "https://maps.example.org/al-noor",
  donateUrl: "https://give.example.org/al-noor",
  timezone: "Europe/London",
  timeFormat: "24h",
  hijriAdjustment: -1,
  hijriRollAtMaghrib: true,
  jumuah: [
    { label: "First Jumu'ah", time: "12:30" },
    { label: "Second Jumu'ah", time: "13:30" },
  ],
  tv: {
    theme: "day",
    showSeconds: true,
    showSunrise: true,
    jamaatInProgressMinutes: 15,
    announcementSeconds: 20,
  },
};

/**
 * The complete form with some fields changed. A value of `null` leaves the
 * field out, as a browser does for an unticked checkbox.
 */
function settingsForm(changes: Readonly<Record<string, string | null>> = {}): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries({ ...COMPLETE_FORM, ...changes })) {
    if (value !== null) formData.set(name, value);
  }
  return formData;
}

/** The settings of a save that is expected to have succeeded. */
function savedSettings(result: SaveSettingsResult): SiteSettings {
  if (!result.ok) throw new Error(`expected saved settings, got: ${result.error}`);
  return result.settings;
}

/** The failure of a save that is expected to have been refused. */
function refused(result: SaveSettingsResult): ActionFailure {
  if (result.ok) throw new Error("expected a refusal");
  return result;
}

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  await database.client.execute("DELETE FROM settings");
});

describe("saveSettingsFrom with an object", () => {
  it("changes only the fields that were sent", async () => {
    const settings = savedSettings(await saveSettingsFrom({ mosqueName: "  Masjid Al-Noor  " }, NOW));

    expect(settings).toStrictEqual({ ...DEFAULT_SETTINGS, mosqueName: "Masjid Al-Noor" });
    expect(await getSettings()).toStrictEqual(settings);
  });

  it("merges a partial tv object into the stored one", async () => {
    await saveSettings({ tv: { theme: "day", announcementSeconds: 30 } });

    const settings = savedSettings(await saveSettingsFrom({ tv: { showSeconds: false } }, NOW));

    expect(settings.tv).toStrictEqual({
      ...DEFAULT_SETTINGS.tv,
      theme: "day",
      announcementSeconds: 30,
      showSeconds: false,
    });
  });

  it("replaces the Jumu'ah list as a whole, and accepts an empty one", async () => {
    const slots = [
      { label: "First", time: "12:30" },
      { label: "Second", time: "13:30" },
    ];
    expect(savedSettings(await saveSettingsFrom({ jumuah: slots }, NOW)).jumuah).toStrictEqual(slots);
    expect(savedSettings(await saveSettingsFrom({ jumuah: [] }, NOW)).jumuah).toStrictEqual([]);
  });

  it("saves nothing for an empty object and returns the settings as they are", async () => {
    const settings = savedSettings(await saveSettingsFrom({}, NOW));
    expect(settings).toStrictEqual(DEFAULT_SETTINGS);
    expect((await readSettings()).stored).toBe(false);
  });

  it("ignores keys that are not settings", async () => {
    const settings = savedSettings(
      await saveSettingsFrom({ shortName: "Noor", adminPassword: "x", tv: { colour: "red" } }, NOW),
    );
    expect(settings).toStrictEqual({ ...DEFAULT_SETTINGS, shortName: "Noor" });
  });

  it("reports each invalid field under its property path and saves none of them", async () => {
    const failed = refused(
      await saveSettingsFrom(
        {
          mosqueName: "Masjid Al-Noor",
          email: "office at example",
          timezone: "Mars/Olympus",
          jumuah: [
            { label: "First", time: "12:30" },
            { label: "Second", time: "1.30pm" },
          ],
          tv: { theme: "sepia", announcementSeconds: 2 },
        },
        NOW,
      ),
    );

    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toStrictEqual({
      email: "Enter a valid email address",
      timezone: "Choose a timezone such as Europe/London",
      "jumuah.1.time": "Enter a time as HH:mm (24-hour)",
      "tv.theme": "Choose one of the listed options.",
      "tv.announcementSeconds": "Enter 5 to 120 seconds",
    });
    expect(failed.error).toBe("Email address: Enter a valid email address. 4 more fields need attention.");
    // The valid mosque name was not saved either.
    expect((await readSettings()).stored).toBe(false);
  });

  it.each([
    ["a link with another scheme", { donateUrl: "javascript:alert(1)" }, "donateUrl", /https:\/\//],
    ["a link without a scheme", { mapUrl: "maps.example.org" }, "mapUrl", /https:\/\//],
    ["letters in the phone number", { phone: "call the office" }, "phone", /digits/],
    ["a blank mosque name", { mosqueName: "   " }, "mosqueName", /Enter the name/],
    ["a short name that is too long", { shortName: "Masjid Al-Noor" }, "shortName", /12 characters/],
    ["an unknown time format", { timeFormat: "am/pm" }, "timeFormat", /listed options/],
    ["a Hijri adjustment that is too large", { hijriAdjustment: 3 }, "hijriAdjustment", /-2 to 2/],
    ["a fractional Hijri adjustment", { hijriAdjustment: 0.5 }, "hijriAdjustment", /whole number/],
    ["text for a number", { hijriAdjustment: "1" }, "hijriAdjustment", /not valid/],
    ["text for a switch", { hijriRollAtMaghrib: "yes" }, "hijriRollAtMaghrib", /not valid/],
    ["null for a field", { tagline: null }, "tagline", /required/],
    ["a Jumu'ah slot without a label", { jumuah: [{ label: " ", time: "13:00" }] }, "jumuah.0.label", /label/],
    ["minutes out of range", { tv: { jamaatInProgressMinutes: 61 } }, "tv.jamaatInProgressMinutes", /0 to 60/],
  ])("refuses %s", async (_name, patch, field, message) => {
    const failed = refused(await saveSettingsFrom(patch, NOW));
    expect(failed.code).toBe("invalid");
    expect(Object.keys(failed.fieldErrors ?? {})).toStrictEqual([field]);
    expect(failed.fieldErrors?.[field]).toMatch(message);
    expect((await readSettings()).stored).toBe(false);
  });

  it("names the field in the summary, using the label of its group when it has none of its own", async () => {
    const theme = refused(await saveSettingsFrom({ tv: { theme: "sepia" } }, NOW));
    expect(theme.error).toBe("TV theme: Choose one of the listed options.");

    const slot = refused(await saveSettingsFrom({ jumuah: [{ label: "First", time: "noon" }] }, NOW));
    expect(slot.error).toBe("Jumu'ah times: Enter a time as HH:mm (24-hour).");
  });

  it.each([
    ["null", null],
    ["nothing", undefined],
    ["text", "mosqueName=Noor"],
    ["a number", 7],
    ["a list", [{ mosqueName: "Noor" }]],
  ])("refuses %s in place of settings", async (_name, payload) => {
    const failed = refused(await saveSettingsFrom(payload, NOW));
    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toBeUndefined();
    expect(failed.error).toMatch(/could not be read/);
    expect((await readSettings()).stored).toBe(false);
  });
});

describe("saveSettingsFrom with the settings form", () => {
  it("saves the complete form", async () => {
    const settings = savedSettings(await saveSettingsFrom(settingsForm(), NOW));

    expect(settings).toStrictEqual(COMPLETE_SETTINGS);
    expect(await getSettings()).toStrictEqual(COMPLETE_SETTINGS);
  });

  it("reads an unticked checkbox, which a browser leaves out, as off", async () => {
    await saveSettings(COMPLETE_SETTINGS);

    const settings = savedSettings(
      await saveSettingsFrom(
        settingsForm({ hijriRollAtMaghrib: null, "tv.showSeconds": null, "tv.showSunrise": null }),
        NOW,
      ),
    );

    expect(settings.hijriRollAtMaghrib).toBe(false);
    expect(settings.tv.showSeconds).toBe(false);
    expect(settings.tv.showSunrise).toBe(false);
  });

  it("lets a ticked checkbox win over the hidden fallback input before it", async () => {
    const formData = settingsForm({ "tv.showSeconds": null });
    formData.append("tv.showSeconds", "false");
    formData.append("tv.showSeconds", "on");
    expect(savedSettings(await saveSettingsFrom(formData, NOW)).tv.showSeconds).toBe(true);
  });

  it("trims text and accepts blank optional fields", async () => {
    const settings = savedSettings(
      await saveSettingsFrom(
        settingsForm({
          mosqueName: "  Masjid Al-Noor ",
          tagline: "",
          address: "   ",
          phone: "",
          email: "",
          mapUrl: "",
          donateUrl: " ",
          hijriAdjustment: " +2 ",
        }),
        NOW,
      ),
    );

    expect(settings).toMatchObject({
      mosqueName: "Masjid Al-Noor",
      tagline: "",
      address: "",
      phone: "",
      email: "",
      mapUrl: "",
      donateUrl: "",
      hijriAdjustment: 2,
    });
  });

  it("stores no default Jumu'ah times when the form has no rows", async () => {
    await saveSettings(COMPLETE_SETTINGS);
    const settings = savedSettings(
      await saveSettingsFrom(
        settingsForm({
          "jumuah.0.label": null,
          "jumuah.0.time": null,
          "jumuah.1.label": null,
          "jumuah.1.time": null,
        }),
        NOW,
      ),
    );
    expect(settings.jumuah).toStrictEqual([]);
  });

  it("skips empty Jumu'ah rows and keeps the others in row order", async () => {
    const settings = savedSettings(
      await saveSettingsFrom(
        settingsForm({
          "jumuah.0.label": "",
          "jumuah.0.time": " ",
          "jumuah.1.label": null,
          "jumuah.1.time": null,
          "jumuah.10.label": "Late",
          "jumuah.10.time": "14:15",
          "jumuah.3.label": " Early ",
          "jumuah.3.time": "12:15",
        }),
        NOW,
      ),
    );
    expect(settings.jumuah).toStrictEqual([
      { label: "Early", time: "12:15" },
      { label: "Late", time: "14:15" },
    ]);
  });

  it("reports a Jumu'ah problem under the row number of the form, not its place among the filled rows", async () => {
    const failed = refused(
      await saveSettingsFrom(
        settingsForm({
          "jumuah.0.label": "",
          "jumuah.0.time": "",
          "jumuah.1.label": "First",
          "jumuah.1.time": "12:30",
          "jumuah.2.label": "",
          "jumuah.2.time": "",
          "jumuah.3.label": "Second",
          "jumuah.3.time": "half one",
          "jumuah.4.label": "",
          "jumuah.4.time": "14:00",
        }),
        NOW,
      ),
    );

    expect(failed.fieldErrors).toStrictEqual({
      "jumuah.3.time": "Enter a time as HH:mm (24-hour)",
      "jumuah.4.label": "Give the Jumu'ah a label",
    });
    expect(failed.error).toBe(
      "Jumu'ah times: Enter a time as HH:mm (24-hour). 1 more field needs attention.",
    );
  });

  it("asks for the time of a Jumu'ah row that only has a label", async () => {
    const failed = refused(
      await saveSettingsFrom(settingsForm({ "jumuah.1.time": null }), NOW),
    );
    expect(failed.fieldErrors).toStrictEqual({ "jumuah.1.time": "Enter a time as HH:mm (24-hour)" });
  });

  it("refuses more Jumu'ah rows than a day can hold", async () => {
    const rows: Record<string, string> = {};
    for (let row = 0; row < 5; row++) {
      rows[`jumuah.${row}.label`] = `Jumu'ah ${row + 1}`;
      rows[`jumuah.${row}.time`] = `1${row}:30`;
    }
    const failed = refused(await saveSettingsFrom(settingsForm(rows), NOW));
    expect(failed.fieldErrors).toStrictEqual({ jumuah: "List at most 4 Jumu'ah times" });
  });

  it("treats a missing field as an error, not as a reason to reset the setting", async () => {
    await saveSettings(COMPLETE_SETTINGS);

    const failed = refused(
      await saveSettingsFrom(settingsForm({ address: null, "tv.theme": null }), NOW),
    );

    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toStrictEqual({
      address: "This field was not sent with the form.",
      "tv.theme": "This field was not sent with the form.",
    });
    expect(await getSettings()).toStrictEqual(COMPLETE_SETTINGS);
  });

  it("reports every field of an empty form", async () => {
    const failed = refused(await saveSettingsFrom(new FormData(), NOW));

    expect(Object.keys(failed.fieldErrors ?? {}).sort()).toStrictEqual(
      [
        "address",
        "donateUrl",
        "email",
        "hijriAdjustment",
        "mapUrl",
        "mosqueName",
        "phone",
        "shortName",
        "tagline",
        "timeFormat",
        "timezone",
        "tv.announcementSeconds",
        "tv.jamaatInProgressMinutes",
        "tv.theme",
      ].sort(),
    );
    expect(failed.error).toMatch(/^Mosque name: This field was not sent with the form\. 13 more fields need attention\.$/);
  });

  it.each([
    ["a blank number", { hijriAdjustment: "  " }, "hijriAdjustment", "Enter a number."],
    ["words for a number", { "tv.announcementSeconds": "twelve" }, "tv.announcementSeconds", "Enter a number using digits only."],
    ["a number with a unit", { "tv.jamaatInProgressMinutes": "10 min" }, "tv.jamaatInProgressMinutes", "Enter a number using digits only."],
    ["a number in another notation", { hijriAdjustment: "1e0" }, "hijriAdjustment", "Enter a number using digits only."],
    ["a fraction where a whole number belongs", { hijriAdjustment: "1.5" }, "hijriAdjustment", "Enter a whole number of days"],
    ["a number out of range", { "tv.announcementSeconds": "3" }, "tv.announcementSeconds", "Enter 5 to 120 seconds"],
    ["an unknown timezone", { timezone: "London" }, "timezone", "Choose a timezone such as Europe/London"],
    ["an unknown time format", { timeFormat: "12" }, "timeFormat", "Choose one of the listed options."],
    ["an unknown theme", { "tv.theme": "dusk" }, "tv.theme", "Choose one of the listed options."],
    ["an invalid email address", { email: "office@" }, "email", "Enter a valid email address"],
    ["a blank short name", { shortName: " " }, "shortName", "Enter a short name"],
  ])("refuses %s and saves nothing", async (_name, changes, field, message) => {
    const failed = refused(await saveSettingsFrom(settingsForm(changes), NOW));

    expect(failed.code).toBe("invalid");
    expect(failed.fieldErrors).toStrictEqual({ [field]: message });
    expect((await readSettings()).stored).toBe(false);
  });

  it("does not take an uploaded file for a text field", async () => {
    const formData = settingsForm({ tagline: null });
    formData.set("tagline", new File(["hello"], "tagline.txt"));
    const failed = refused(await saveSettingsFrom(formData, NOW));
    expect(failed.fieldErrors).toStrictEqual({ tagline: "This field was not sent with the form." });
  });

  it("ignores fields that are not settings", async () => {
    const settings = savedSettings(
      await saveSettingsFrom(settingsForm({ $ACTION_ID_abc: "", adminPassword: "x" }), NOW),
    );
    expect(settings).toStrictEqual(COMPLETE_SETTINGS);
  });
});
