import { describe, expect, it } from "vitest";
import { analyseColumns, classifyLabel, describeColumn, emptyMapping, guessMapping, listUnusedColumns, reviewMapping, type ColumnInput } from "./columns";
import { exportHeaders } from "./export";
import { MAPPING_TARGETS, type ColumnContent, type ColumnMapping } from "./types";

/** Builds column inputs from a list of headings. */
function columns(labels: readonly string[], content: Readonly<Record<string, ColumnContent>> = {}): ColumnInput[] {
  return labels.map((label, index) => ({ index, label, content: content[label] }));
}

/** The mapping as `{ target: heading }`, leaving out unmapped targets, for readable assertions. */
function mappedLabels(labels: readonly string[], content: Readonly<Record<string, ColumnContent>> = {}): Record<string, string> {
  const mapping = guessMapping(columns(labels, content));
  const result: Record<string, string> = {};
  for (const target of MAPPING_TARGETS) {
    const index = mapping[target];
    if (index !== null) result[target] = labels[index];
  }
  return result;
}

describe("classifyLabel: prayers", () => {
  it.each([
    ["fajr", "fajr"],
    ["Fajar", "fajr"],
    ["FAJER", "fajr"],
    ["Subh", "fajr"],
    ["Dhuhr", "dhuhr"],
    ["Zuhr", "dhuhr"],
    ["Zohr", "dhuhr"],
    ["Zuhar", "dhuhr"],
    ["Zohar", "dhuhr"],
    ["Dhuhur", "dhuhr"],
    ["Duhr", "dhuhr"],
    ["Thuhr", "dhuhr"],
    ["Luhr", "dhuhr"],
    ["Asr", "asr"],
    ["Asar", "asr"],
    ["'Asr", "asr"],
    ["ʿAṣr", "asr"],
    ["Maghrib", "maghrib"],
    ["Magrib", "maghrib"],
    ["Maghreb", "maghrib"],
    ["MAghrib", "maghrib"],
    ["Isha", "isha"],
    ["Esha", "isha"],
    ["Ishaa", "isha"],
    ["Isha'a", "isha"],
    ["'Isha", "isha"],
    ["ʿIshāʾ", "isha"],
    ["الفجر", "fajr"],
    ["الظُّهْر", "dhuhr"],
    ["العشاء", "isha"],
  ])("recognises %j as %s", (label, prayer) => {
    expect(classifyLabel(label)).toMatchObject({ kind: "prayer", prayer, role: null });
  });

  it.each(["Begins", "Begin", "Start", "Starts", "Beginning", "Adhan", "Athan", "Azan", "Azaan", "Time", "Waqt"])(
    'reads "Fajr %s" as the begin time',
    (qualifier) => {
      expect(classifyLabel(`Fajr ${qualifier}`)).toMatchObject({ kind: "prayer", prayer: "fajr", role: "begins" });
    },
  );

  it.each([
    "Jamaat",
    "Jama'ah",
    "Jamaah",
    "Jamah",
    "Jamat",
    "Jama'at",
    "Jamaa",
    "Iqamah",
    "Iqama",
    "Iqamat",
    "Iqaamah",
    "Ikamah",
    "Congregation",
    "Salah",
    "Prayer",
  ])('reads "Asr %s" as the jamaat time', (qualifier) => {
    expect(classifyLabel(`Asr ${qualifier}`)).toMatchObject({ kind: "prayer", prayer: "asr", role: "jamaat" });
  });

  it.each([
    ["fajr_begins", "fajr", "begins"],
    ["FAJR-JAMAAT", "fajr", "jamaat"],
    ["fajrBegins", "fajr", "begins"],
    ["ishaJamaat", "isha", "jamaat"],
    ["fajr.start", "fajr", "begins"],
    ["Zuhr (Jama'ah)", "dhuhr", "jamaat"],
    ["Jama'at Times Maghrib", "maghrib", "jamaat"],
    ["Jamaat Time Fajr", "fajr", "jamaat"],
    ["Beginning Time Fajr", "fajr", "begins"],
    ["PRAYER START TIMES Asr", "asr", "begins"],
    ["fajr congregation_start", "fajr", "jamaat"],
    ["Iqamah time Isha", "isha", "jamaat"],
    ["Fajr الفجر Begins", "fajr", "begins"],
    ["الفجر الاقامة", "fajr", "jamaat"],
  ])("reads %j as %s %s", (label, prayer, role) => {
    expect(classifyLabel(label)).toMatchObject({ kind: "prayer", prayer, role });
  });

  it('treats "Prayer Time" as saying nothing about begin or jamaat', () => {
    expect(classifyLabel("Fajr Prayer Time")).toMatchObject({ kind: "prayer", prayer: "fajr", role: null });
  });

  it("keeps Fajr when the heading also mentions the end of suhoor", () => {
    expect(classifyLabel("FAJR (SEHRI ENDS)")).toMatchObject({ kind: "prayer", prayer: "fajr", role: null });
  });

  it("does not use a column for the end of a prayer's time", () => {
    expect(classifyLabel("Fajr Ends")).toMatchObject({ kind: "ignored" });
  });

  it("does not guess between two prayers in one heading", () => {
    expect(classifyLabel("Maghrib / Isha").kind).toBe("unknown");
  });

  it("reads the Asr calculation from the heading", () => {
    expect(classifyLabel("asr_mithl_1")).toMatchObject({ prayer: "asr", role: null, variant: 1 });
    expect(classifyLabel("asr_mithl_2")).toMatchObject({ prayer: "asr", role: null, variant: 2 });
    expect(classifyLabel("Asr Start (1st Mithl)")).toMatchObject({ prayer: "asr", role: "begins", variant: 1 });
    expect(classifyLabel("Asr Start (2nd Mithl)")).toMatchObject({ prayer: "asr", role: "begins", variant: 2 });
    expect(classifyLabel("Asr Mithl Awwal")).toMatchObject({ variant: 1 });
    expect(classifyLabel("Asr Hanafi")).toMatchObject({ variant: 2 });
    expect(classifyLabel("asr_athan_standard")).toMatchObject({ role: "begins", variant: 1 });
    expect(classifyLabel("asr_athan_hanafi")).toMatchObject({ role: "begins", variant: 2 });
    expect(classifyLabel("asr_jamah")).toMatchObject({ role: "jamaat", variant: null });
    expect(classifyLabel("Asr")).toMatchObject({ variant: null });
  });
});

describe("classifyLabel: everything else", () => {
  it.each(["Sunrise", "Shuruq", "Shurooq", "Shorooq", "Tulu", "Sun Rise", "sunrise_start", "الشروق", "Fajr Sunrise"])("recognises %j as sunrise", (label) => {
    expect(classifyLabel(label).kind).toBe("sunrise");
  });

  it("ranks Ishraq below a real sunrise heading", () => {
    expect(classifyLabel("Ishraq").kind).toBe("sunrise");
    expect(classifyLabel("Ishraq").score).toBeLessThan(classifyLabel("Sunrise").score);
  });

  it.each(["Jumuah", "Jumu'ah", "Jummah", "Jumma", "Juma", "Friday", "Khutbah", "Friday Prayer", "الجمعة"])("recognises %j as Jumu'ah", (label) => {
    expect(classifyLabel(label)).toMatchObject({ kind: "jumuah", jumuahIndex: null });
  });

  it.each([
    ["1st Jumu'ah", 1],
    ["Jumuah 2", 2],
    ["Jummah3", 3],
    ["Second Jumuah", 2],
    ["Third Khutbah", 3],
  ])("reads the number of %j", (label, index) => {
    expect(classifyLabel(label)).toMatchObject({ kind: "jumuah", jumuahIndex: index });
  });

  it.each([
    ["Date", "date"],
    ["d_date", "date"],
    ["Day/Date", "date"],
    ["Gregorian", "date"],
    ["Gregorian Date", "date"],
    ["التاريخ", "date"],
    ["Day", "day"],
    ["DOM", "day"],
    ["day_of_month", "day"],
    ["Day No.", "day"],
    ["Month", "month"],
    ["Note", "note"],
    ["Notes", "note"],
    ["Remarks", "note"],
  ])("recognises %j as %s", (label, kind) => {
    expect(classifyLabel(label).kind).toBe(kind);
  });

  it.each([
    ["hijri_date", "Islamic calendar"],
    ["Hijri", "Islamic calendar"],
    ["Islamic Date", "Islamic calendar"],
    ["is_ramadan", "Islamic calendar"],
    ["Weekday", "Weekday"],
    ["Day of week", "Weekday"],
    ["ZAWAL", "Zawal"],
    ["Sehri Ends", "Suhoor end"],
    ["Suhoor", "Suhoor end"],
    ["Imsak", "Suhoor end"],
    ["Iftar", "Iftar"],
    ["Taraweeh", "Taraweeh"],
    ["fast_begins", "Fasting times"],
  ])("recognises %j as a column it does not need (%s)", (label, reason) => {
    expect(classifyLabel(label)).toMatchObject({ kind: "ignored", ignoredAs: reason });
  });

  it.each([
    ["Begins", "begins"],
    ["Start", "begins"],
    ["Beginning Time", "begins"],
    ["PRAYER START TIMES", "begins"],
    ["Jama'ah", "jamaat"],
    ["JAMA'AT TIMES", "jamaat"],
    ["Jamaat Time", "jamaat"],
    ["Iqamah", "jamaat"],
  ])("recognises %j as the %s half of a two-row header", (label, role) => {
    expect(classifyLabel(label)).toMatchObject({ kind: "qualifier", role });
  });

  it.each(["", "   ", "Masjid Uwais", "Qibla", "Total", "Prayer Times", "123"])("does not recognise %j", (label) => {
    expect(classifyLabel(label).kind).toBe("unknown");
  });
});

describe("guessMapping", () => {
  it("maps our own export headers completely", () => {
    const headers = exportHeaders();
    const mapping = guessMapping(columns(headers));
    expect(mapping).toEqual({
      date: 0,
      day: null,
      month: null,
      fajrBegins: 1,
      fajrJamaat: 2,
      sunrise: 3,
      dhuhrBegins: 4,
      dhuhrJamaat: 5,
      asrBegins: 6,
      asrJamaat: 7,
      maghribBegins: 8,
      maghribJamaat: 9,
      ishaBegins: 10,
      ishaJamaat: 11,
      jumuah1: 12,
      jumuah2: 13,
      jumuah3: 14,
      note: 15,
    });
  });

  it("maps the Daily Prayer Time plugin export out of the box", () => {
    const headers = "d_date,fajr_begins,fajr_jamah,sunrise,zuhr_begins,zuhr_jamah,asr_mithl_1,asr_mithl_2,asr_jamah,maghrib_begins,maghrib_jamah,isha_begins,isha_jamah,is_ramadan,hijri_date".split(",");
    const analysis = analyseColumns(columns(headers));
    expect(analysis.mapping).toEqual({
      ...emptyMapping(),
      date: 0,
      fajrBegins: 1,
      fajrJamaat: 2,
      sunrise: 3,
      dhuhrBegins: 4,
      dhuhrJamaat: 5,
      asrBegins: 6,
      asrJamaat: 8,
      maghribBegins: 9,
      maghribJamaat: 10,
      ishaBegins: 11,
      ishaJamaat: 12,
    });
    expect(analysis.unmapped).toEqual([]);
    expect(analysis.ignored.map((column) => column.label).sort()).toEqual(["asr_mithl_2", "hijri_date", "is_ramadan"]);
    expect(analysis.notes).toHaveLength(1);
    expect(analysis.notes[0]).toMatchObject({ severity: "info", code: "asr-two-columns", field: "asrBegins" });
    expect(analysis.notes[0].message).toContain("asr_mithl_1");
    expect(analysis.notes[0].message).toContain("asr_mithl_2");
  });

  it("uses the second Asr calculation when it is the only one", () => {
    expect(mappedLabels(["Date", "Asr Hanafi", "Asr Jamaat"])).toEqual({ date: "Date", asrBegins: "Asr Hanafi", asrJamaat: "Asr Jamaat" });
    expect(analyseColumns(columns(["Date", "Asr Hanafi"])).notes).toEqual([]);
  });

  it("maps the labels of a two-row header", () => {
    const labels = ["Date", "Day", "Fajr Begins", "Fajr Jama'ah", "Sunrise", "Zuhr Begins", "Zuhr Jama'ah", "Asr Begins", "Asr Jama'ah", "Maghrib Begins", "Maghrib Jama'ah", "Isha Begins", "Isha Jama'ah"];
    expect(mappedLabels(labels, { Date: "day-number", Day: "weekday" })).toEqual({
      day: "Date",
      fajrBegins: "Fajr Begins",
      fajrJamaat: "Fajr Jama'ah",
      sunrise: "Sunrise",
      dhuhrBegins: "Zuhr Begins",
      dhuhrJamaat: "Zuhr Jama'ah",
      asrBegins: "Asr Begins",
      asrJamaat: "Asr Jama'ah",
      maghribBegins: "Maghrib Begins",
      maghribJamaat: "Maghrib Jama'ah",
      ishaBegins: "Isha Begins",
      ishaJamaat: "Isha Jama'ah",
    });
  });

  it("reads a bare prayer name as the begin time", () => {
    const analysis = analyseColumns(columns(["Date", "Fajr", "Sunrise", "Zuhr", "Asr", "Maghrib", "Isha"]));
    expect(analysis.mapping).toMatchObject({ date: 0, fajrBegins: 1, sunrise: 2, dhuhrBegins: 3, asrBegins: 4, maghribBegins: 5, ishaBegins: 6 });
    expect(analysis.mapping.fajrJamaat).toBeNull();
    expect(analysis.notes).toEqual([]);
  });

  it("reads a bare prayer name as whichever half the other column leaves open", () => {
    expect(mappedLabels(["Date", "Fajr Jamaat", "Fajr"])).toMatchObject({ fajrBegins: "Fajr", fajrJamaat: "Fajr Jamaat" });
    const analysis = analyseColumns(columns(["Date", "Fajr Adhan", "Fajr"]));
    expect(analysis.mapping).toMatchObject({ fajrBegins: 1, fajrJamaat: 2 });
    expect(analysis.notes.map((note) => note.code)).toEqual(["column-role-assumed"]);
  });

  it("reads two bare columns for one prayer as begin time then jamaat, and says so", () => {
    const analysis = analyseColumns(columns(["Date", "Fajr", "Fajr", "Zuhr", "Zuhr"]));
    expect(analysis.mapping).toMatchObject({ fajrBegins: 1, fajrJamaat: 2, dhuhrBegins: 3, dhuhrJamaat: 4 });
    expect(analysis.notes.map((note) => [note.severity, note.code, note.field])).toEqual([
      ["warning", "column-role-assumed", "fajrJamaat"],
      ["warning", "column-role-assumed", "dhuhrJamaat"],
    ]);
  });

  it("uses sunset as the Maghrib begin time when the timetable heads the jamaat column Maghrib", () => {
    const analysis = analyseColumns(columns(["Date", "Asr", "Sunset", "Maghrib", "Isha"]));
    expect(analysis.mapping).toMatchObject({ maghribBegins: 2, maghribJamaat: 3 });
    expect(analysis.notes.map((note) => note.code)).toEqual(["column-role-assumed"]);
  });

  it("does not need sunset when Maghrib has its own begin time", () => {
    const analysis = analyseColumns(columns(["Date", "Sunset", "Maghrib Begins", "Maghrib Jamaat"]));
    expect(analysis.mapping).toMatchObject({ maghribBegins: 2, maghribJamaat: 3 });
    expect(analysis.ignored).toEqual([{ index: 1, label: "Sunset", reason: "Sunset" }]);
    expect(analysis.notes).toEqual([]);

    const bare = analyseColumns(columns(["Date", "Sunset", "Maghrib", "Maghrib Jamaat"]));
    expect(bare.mapping).toMatchObject({ maghribBegins: 2, maghribJamaat: 3 });
    expect(bare.ignored.map((column) => column.label)).toEqual(["Sunset"]);
  });

  it("prefers a real sunrise column over Ishraq, and uses Ishraq when it is all there is", () => {
    const both = analyseColumns(columns(["Date", "Fajr", "Ishraq", "Sunrise"]));
    expect(both.mapping.sunrise).toBe(3);
    expect(both.ignored).toEqual([{ index: 2, label: "Ishraq", reason: "Ishraq" }]);
    expect(guessMapping(columns(["Date", "Fajr", "Ishraq"])).sunrise).toBe(2);
  });

  it("lets the better heading win and never uses a column twice", () => {
    const analysis = analyseColumns(columns(["Date", "Fajr Begins (old)", "Fajr Begins", "Fajr Jamaat"]));
    expect(analysis.mapping).toMatchObject({ fajrBegins: 2, fajrJamaat: 3 });
    expect(analysis.unmapped).toEqual([1]);
    expect(analysis.notes).toHaveLength(1);
    expect(analysis.notes[0]).toMatchObject({ severity: "warning", code: "duplicate-column", field: "fajrBegins" });

    const used = Object.values(analysis.mapping).filter((index) => index !== null);
    expect(new Set(used).size).toBe(used.length);
  });

  it("takes the leftmost of two identical headings", () => {
    const analysis = analyseColumns(columns(["Date", "Isha Jamaat", "Isha Jamaat"]));
    expect(analysis.mapping.ishaJamaat).toBe(1);
    expect(analysis.unmapped).toEqual([2]);
    expect(analysis.notes[0].code).toBe("duplicate-column");
  });

  it("places numbered Jumu'ah columns in their slot and the others in the gaps", () => {
    expect(mappedLabels(["Date", "Fajr", "Jumuah 2", "Jumuah 1"])).toMatchObject({ jumuah1: "Jumuah 1", jumuah2: "Jumuah 2" });
    expect(mappedLabels(["Date", "Fajr", "Jumuah", "Khutbah"])).toMatchObject({ jumuah1: "Jumuah", jumuah2: "Khutbah" });
    expect(mappedLabels(["Date", "Fajr", "Friday", "2nd Jumu'ah"])).toMatchObject({ jumuah1: "Friday", jumuah2: "2nd Jumu'ah" });
    const four = analyseColumns(columns(["Date", "Jumuah 1", "Jumuah 2", "Jumuah 3", "Jumuah 4"]));
    expect(four.mapping).toMatchObject({ jumuah1: 1, jumuah2: 2, jumuah3: 3 });
    expect(four.unmapped).toEqual([4]);
  });

  it("uses what the values look like to tell date, day number and weekday apart", () => {
    expect(mappedLabels(["Date", "Day", "Fajr"], { Date: "day-number", Day: "weekday" })).toEqual({ day: "Date", fajrBegins: "Fajr" });
    expect(mappedLabels(["Day", "Date", "Fajr"], { Day: "weekday", Date: "date" })).toEqual({ date: "Date", fajrBegins: "Fajr" });
    expect(mappedLabels(["Day", "Fajr"], { Day: "date" })).toEqual({ date: "Day", fajrBegins: "Fajr" });
    expect(mappedLabels(["Month", "Date", "Fajr"], { Month: "day-number", Date: "day-number" })).toEqual({ month: "Month", day: "Date", fajrBegins: "Fajr" });
    expect(mappedLabels(["month", "day_of_month", "fajr"])).toEqual({ month: "month", day: "day_of_month", fajrBegins: "fajr" });
  });

  it("falls back to the heading alone when the values are unknown", () => {
    expect(mappedLabels(["Date", "Day", "Fajr"])).toEqual({ date: "Date", day: "Day", fajrBegins: "Fajr" });
  });

  it("reports weekday columns as ignored and a second date column as not needed", () => {
    const analysis = analyseColumns(columns(["Date", "Day", "Date", "Fajr"], { Day: "weekday" }));
    expect(analysis.mapping.date).toBe(0);
    expect(analysis.ignored).toEqual([
      { index: 1, label: "Day", reason: "Weekday" },
      { index: 2, label: "Date", reason: "Not needed: another column gives the date" },
    ]);
  });

  it("reports recognised-but-unused columns as ignored and unknown ones as unmapped", () => {
    const analysis = analyseColumns(columns(["Date", "Hijri", "Fajr", "Zawal", "Sehri Ends", "Iftar", "Qibla", ""]));
    expect(analysis.ignored.map((column) => column.label)).toEqual(["Hijri", "Zawal", "Sehri Ends", "Iftar"]);
    expect(analysis.unmapped).toEqual([6, 7]);
  });

  it("maps the first note column", () => {
    expect(mappedLabels(["Date", "Fajr", "Notes", "Remarks"])).toMatchObject({ note: "Notes" });
  });

  it("returns an all-null mapping for headings it does not know", () => {
    expect(guessMapping(columns(["A", "B", "C"]))).toEqual(emptyMapping());
    expect(guessMapping([])).toEqual(emptyMapping());
  });
});

describe("listUnusedColumns", () => {
  it("sorts the columns a hand-made mapping leaves out", () => {
    const inputs = columns(["When", "Day", "Fajr", "Hijri", "Extra"], { Day: "weekday" });
    const mapping: ColumnMapping = { ...emptyMapping(), date: 0, fajrBegins: 2 };
    expect(listUnusedColumns(inputs, mapping)).toEqual({
      ignored: [
        { index: 1, label: "Day", reason: "Weekday" },
        { index: 3, label: "Hijri", reason: "Islamic calendar" },
      ],
      unmapped: [4],
    });
  });
});

describe("reviewMapping", () => {
  const complete: ColumnMapping = guessMapping(columns(exportHeaders()));

  it("has nothing to say about a complete mapping", () => {
    expect(reviewMapping(complete)).toEqual([]);
  });

  it("has nothing to say when sunrise, Jumu'ah or the note are missing", () => {
    expect(reviewMapping({ ...complete, sunrise: null, jumuah1: null, jumuah2: null, jumuah3: null, note: null })).toEqual([]);
  });

  it("warns once when there are no jamaat columns at all", () => {
    const mapping = guessMapping(columns(["Date", "Fajr", "Sunrise", "Zuhr", "Asr", "Maghrib", "Isha"]));
    const notes = reviewMapping(mapping);
    expect(notes.map((note) => [note.severity, note.code])).toEqual([["warning", "no-jamaat-columns"]]);
  });

  it("warns once when there are no begin-time columns at all", () => {
    const mapping = guessMapping(columns(["Date", "Fajr Jamaat", "Zuhr Jamaat", "Asr Jamaat", "Maghrib Jamaat", "Isha Jamaat"]));
    expect(reviewMapping(mapping).map((note) => note.code)).toEqual(["no-begins-columns"]);
  });

  it("names each prayer that has only one of its two columns", () => {
    const notes = reviewMapping({ ...complete, maghribJamaat: null, fajrBegins: null });
    expect(notes.map((note) => [note.code, note.field])).toEqual([
      ["prayer-column-missing", "fajrBegins"],
      ["prayer-column-missing", "maghribJamaat"],
    ]);
    expect(notes[0].message).toBe("Fajr has a jamaat column but no begin-time column.");
    expect(notes[1].message).toBe("Maghrib has a begin-time column but no jamaat column.");
  });

  it("names prayers that have no column at all", () => {
    const notes = reviewMapping({ ...complete, asrBegins: null, asrJamaat: null, ishaBegins: null, ishaJamaat: null });
    expect(notes.map((note) => note.code)).toEqual(["prayer-not-found"]);
    expect(notes[0].message).toContain("Asr and Isha");
  });

  it("says nothing about a mapping without any time column (the parser reports that itself)", () => {
    expect(reviewMapping({ ...emptyMapping(), date: 0 })).toEqual([]);
  });
});

describe("describeColumn", () => {
  it("names a column by heading and letter", () => {
    expect(describeColumn({ index: 2, label: "Fajr Begins" })).toBe('"Fajr Begins" (column C)');
    expect(describeColumn({ index: 27, label: "" })).toBe("column AB");
  });
});
