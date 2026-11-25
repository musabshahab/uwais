import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DAY_NOTE_LENGTH,
  MAX_UPSERT_DAYS,
  getAllPrayerDays,
  getPrayerDay,
  listImportLog,
  saveSettings,
  upsertPrayerDays,
} from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "@/lib/db/testing";
import { parseTimetable, readSpreadsheet, toXlsx, type ImportIssue } from "@/lib/import";
import { addDays } from "@/lib/time";
import type { PrayerDay } from "@/lib/types";
import {
  IMPORT_PREVIEW_ISSUE_LIMIT,
  IMPORT_PREVIEW_ROW_LIMIT,
  type ImportCommitData,
  type ImportCommitResult,
  type ImportPreview,
  type ImportPreviewData,
} from "../types";
import {
  commitImport,
  commitImportForm,
  parseWorkbook,
  previewImport,
  previewImportForm,
  readImportForm,
  type ImportRequest,
} from "./import";
import { binaryFile, csvFile, fullDay, fullDays, importForm, textFile } from "./testing";

/** Midday on 25 November 2026: "this year" is 2026 in London. */
const NOW = Date.UTC(2026, 10, 25, 12);

const ACKNOWLEDGED = { acknowledgeWarnings: "true" };

/**
 * A Dhuhr later than the Asr of `fullDay` (14:10). Written with a 24-hour
 * hour, so the importer keeps it as typed and only warns about the order.
 */
const OUT_OF_ORDER_DHUHR = "14:20";

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(() => {
  database.close();
});

beforeEach(async () => {
  await database.client.batch(
    ["DELETE FROM prayer_days", "DELETE FROM import_log", "DELETE FROM settings"],
    "write",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The data of a preview that is expected to have succeeded. */
function previewOf(result: ImportPreview): ImportPreviewData {
  if (!result.ok) throw new Error(`expected a preview, got: ${result.error}`);
  return result;
}

/** The data of a commit that is expected to have succeeded. */
function committed(result: ImportCommitResult): ImportCommitData {
  if (!result.ok) throw new Error(`expected a commit, got: ${result.error}`);
  return result;
}

/** The request of a form that is expected to be readable. */
async function requestOf(formData: FormData): Promise<ImportRequest> {
  const form = await readImportForm(formData);
  if (!form.ok) throw new Error(`expected a readable form, got: ${form.error}`);
  return form.request;
}

/** The codes of the issues at one severity. */
function codes(issues: readonly ImportIssue[], severity: ImportIssue["severity"]): string[] {
  return issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);
}

/** A CSV with only a date and the five jamaat columns. */
function jamaatOnlyCsv(rows: readonly (readonly string[])[]): File {
  const header = "Date,Fajr Jamaat,Dhuhr Jamaat,Asr Jamaat,Maghrib Jamaat,Isha Jamaat";
  return textFile("jamaat.csv", [header, ...rows.map((row) => row.join(","))].join("\n"));
}

describe("readImportForm", () => {
  it("refuses anything that is not a form", async () => {
    for (const value of [null, undefined, "file", { file: "x" }]) {
      const result = await readImportForm(value);
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ code: "invalid" });
    }
  });

  it("asks for a file when none was chosen", async () => {
    const missing = await readImportForm(importForm(null));
    expect(missing).toMatchObject({ ok: false, code: "invalid" });
    expect(missing.ok ? null : missing.fieldErrors?.file).toMatch(/Choose the timetable file/);

    // What a browser submits for an empty file input.
    const empty = await readImportForm(importForm(new File([], "")));
    expect(empty.ok ? null : empty.fieldErrors?.file).toMatch(/Choose the timetable file/);

    const text = await readImportForm(importForm(null, { file: "times.csv" }));
    expect(text.ok ? null : text.fieldErrors?.file).toMatch(/Choose the timetable file/);
  });

  it("reads the file and applies the defaults", async () => {
    const request = await requestOf(importForm(textFile("times.csv", "Date\n")));
    expect(request).toStrictEqual({
      file: { name: "times.csv", size: 5, data: new TextEncoder().encode("Date\n") },
      mapping: null,
      year: null,
      dateOrder: "auto",
      fillDown: false,
      acknowledgeWarnings: false,
    });
  });

  it("keeps only the file's own name and never leaves it empty", async () => {
    const withPath = await requestOf(importForm(textFile("C:\\fakepath\\March.csv", "x")));
    expect(withPath.file.name).toBe("March.csv");
    const nameless = await requestOf(importForm(textFile("  ", "x")));
    expect(nameless.file.name).toBe("timetable");
  });

  it("reads the options", async () => {
    const request = await requestOf(
      importForm(textFile("t.csv", "x"), {
        year: " 2027 ",
        dateOrder: "mdy",
        fillDown: "on",
        acknowledgeWarnings: "true",
      }),
    );
    expect(request).toMatchObject({
      year: 2027,
      dateOrder: "mdy",
      fillDown: true,
      acknowledgeWarnings: true,
    });
  });

  it.each(["27", "20270", "twenty", "1999", "2101", "-2027", "2027.0"])(
    "refuses the year %j",
    async (year) => {
      const result = await readImportForm(importForm(textFile("t.csv", "x"), { year }));
      expect(result.ok ? null : result.fieldErrors).toHaveProperty("year");
    },
  );

  it("refuses an unknown date order", async () => {
    const result = await readImportForm(importForm(textFile("t.csv", "x"), { dateOrder: "ydm" }));
    expect(result.ok ? null : result.fieldErrors).toHaveProperty("dateOrder");
  });

  it("accepts column choices, dropping unknown targets and keeping explicit blanks", async () => {
    const mapping = JSON.stringify({
      "*": { date: 0, fajrJamaat: 2, note: null, colour: 4 },
      March: { date: 1 },
    });
    const request = await requestOf(importForm(textFile("t.csv", "x"), { mapping }));
    expect(request.mapping).toEqual({
      "*": { date: 0, fajrJamaat: 2, note: null },
      March: { date: 1 },
    });
  });

  it("builds the column choices without inherited keys, so no sheet name finds one by accident", async () => {
    // Written out as text: in an object literal `__proto__` sets the prototype and JSON.stringify drops it.
    const mapping = '{"*":{"date":0},"__proto__":{"date":3}}';
    const request = await requestOf(importForm(textFile("t.csv", "x"), { mapping }));
    const overrides = request.mapping ?? {};
    expect(Object.getPrototypeOf(overrides)).toBeNull();
    expect(overrides["constructor"]).toBeUndefined();
    expect(overrides["toString"]).toBeUndefined();
    expect(Object.keys(overrides).sort()).toStrictEqual(["*", "__proto__"]);
    expect(overrides["__proto__"]).toEqual({ date: 3 });
  });

  it.each([
    ["not JSON", "{date: 0}"],
    ["an array", "[1, 2]"],
    ["a number", "7"],
    ["null", "null"],
    ["a sheet that is not an object", '{"Sheet1": 3}'],
    ["a column that is not a number", '{"Sheet1": {"date": "A"}}'],
    ["a negative column", '{"Sheet1": {"date": -1}}'],
    ["a fractional column", '{"Sheet1": {"date": 1.5}}'],
    ["a column beyond the widest sheet", '{"Sheet1": {"date": 60}}'],
    ["an empty sheet name", '{"": {"date": 0}}'],
    ["more entries than a workbook has sheets", JSON.stringify(Object.fromEntries(Array.from({ length: 22 }, (_, i) => [`S${i}`, {}])))],
    ["a huge payload", JSON.stringify({ S: { date: 0 }, pad: "x".repeat(100_001) })],
  ])("refuses column choices that are %s", async (_label, mapping) => {
    const result = await readImportForm(importForm(textFile("t.csv", "x"), { mapping }));
    expect(result.ok ? null : result.fieldErrors).toHaveProperty("mapping");
  });

  it("reports every unreadable field at once", async () => {
    const result = await readImportForm(
      importForm(null, { mapping: "{", year: "27", dateOrder: "x" }),
    );
    expect(result.ok ? [] : Object.keys(result.fieldErrors ?? {})).toStrictEqual([
      "file",
      "mapping",
      "year",
      "dateOrder",
    ]);
    expect(result.ok ? null : result.error).toMatch(/Choose the timetable file/);
  });
});

describe("previewImport", () => {
  it("previews a clean file without writing anything", async () => {
    const days = fullDays("2027-01-01", 31);
    const file = csvFile("January 2027.csv", days);
    const preview = previewOf(await previewImportForm(importForm(file), NOW));

    expect(preview.file).toStrictEqual({ name: "January 2027.csv", size: file.size, format: "csv" });
    expect(preview.options).toStrictEqual({ year: null, dateOrder: "auto", fillDown: false });
    expect(preview.summary).toMatchObject({
      totalRows: 31,
      validDays: 31,
      errorRows: 0,
      warnings: 0,
      firstDate: "2027-01-01",
      lastDate: "2027-01-31",
    });
    expect(preview.issues).toStrictEqual([]);
    expect(preview.issueCounts).toStrictEqual({ error: 0, warning: 0, info: 0 });
    expect(preview.diff).toStrictEqual({
      added: 31,
      updated: 0,
      unchanged: 0,
      changes: [],
      changesTruncated: false,
    });
    expect(preview.canCommit).toBe(true);
    expect(preview.requiresAcknowledgement).toBe(false);
    expect(preview.totalRows).toBe(31);
    expect(preview.rowsTruncated).toBe(false);
    expect(preview.issuesTruncated).toBe(false);
    expect(preview.rows).toHaveLength(31);
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      status: "ok",
      date: "2027-01-01",
      effect: "added",
      day: days[0],
    });

    expect(await getAllPrayerDays()).toStrictEqual([]);
    expect(await listImportLog()).toStrictEqual([]);
  });

  it("describes the sheets, columns and mapping so the screen can offer column choices", async () => {
    const preview = previewOf(
      await previewImportForm(importForm(csvFile("jan.csv", fullDays("2027-01-01", 3))), NOW),
    );

    expect(preview.sheets).toHaveLength(1);
    const [sheet] = preview.sheets;
    expect(sheet).toMatchObject({ name: "jan", status: "imported", mappingSource: "guessed" });
    expect(sheet.columns.map((column) => column.label).slice(0, 3)).toStrictEqual([
      "Date",
      "Fajr Begins",
      "Fajr Jamaat",
    ]);
    expect(sheet.columns[1].samples[0]).toBe("06:10");
    expect(preview.mapping).toStrictEqual({ jan: sheet.mapping });
    expect(preview.mapping.jan).toMatchObject({ date: 0, fajrBegins: 1, ishaJamaat: 11, note: 15 });
    expect(preview.mappedFields).toContain("ishaJamaat");
  });

  it("returns plain data that survives being sent to the browser", async () => {
    const file = textFile(
      "odd.csv",
      "Date,Fajr Begins,Sunrise,Dhuhr Begins,Asr Begins\n2027-02-01,06:10,07:50,14:05,13:10\n",
    );
    const preview = await previewImportForm(importForm(file), NOW);
    expect(JSON.parse(JSON.stringify(preview))).toEqual(preview);
  });

  it("flags a file with warnings as needing acknowledgement, with the warning on its row", async () => {
    const days = [
      fullDay("2027-02-01"),
      fullDay("2027-02-02", { dhuhrBegins: OUT_OF_ORDER_DHUHR }),
      fullDay("2027-02-03"),
    ];
    const preview = previewOf(await previewImportForm(importForm(csvFile("feb.csv", days)), NOW));

    expect(preview.canCommit).toBe(true);
    expect(preview.requiresAcknowledgement).toBe(true);
    expect(preview.issueCounts.warning).toBe(preview.summary.warnings);
    expect(codes(preview.issues, "warning")).toContain("times-out-of-order");
    const row = preview.rows.find((candidate) => candidate.date === "2027-02-02");
    expect(row?.status).toBe("ok");
    expect(row?.issues.map((issue) => issue.code)).toContain("times-out-of-order");
    expect(row?.issues[0].message).toMatch(/Row 3 \(2 Feb 2027\)/);
  });

  it("marks each row with what importing it would do", async () => {
    await upsertPrayerDays([fullDay("2027-01-01"), fullDay("2027-01-02")]);
    const days = [
      fullDay("2027-01-01"),
      fullDay("2027-01-02", { ishaJamaat: "19:45" }),
      fullDay("2027-01-03"),
    ];
    const preview = previewOf(await previewImportForm(importForm(csvFile("jan.csv", days)), NOW));

    expect(preview.rows.map((row) => row.effect)).toStrictEqual(["unchanged", "updated", "added"]);
    expect(preview.diff).toStrictEqual({
      added: 1,
      updated: 1,
      unchanged: 1,
      changes: [
        { date: "2027-01-02", fields: [{ field: "ishaJamaat", from: "19:30", to: "19:45" }] },
      ],
      changesTruncated: false,
    });
  });

  it("gives rows that are not imported no effect", async () => {
    const file = textFile(
      "t.csv",
      [
        "Date,Fajr Begins,Fajr Jamaat",
        "2027-01-01,06:10,06:30",
        "2027-01-02,not a time,06:30",
        "2027-01-03,,",
        "2027-01-01,06:11,06:31",
      ].join("\n"),
    );
    const preview = previewOf(await previewImportForm(importForm(file), NOW));

    expect(preview.rows.map((row) => [row.status, row.effect])).toStrictEqual([
      ["replaced", null],
      ["error", null],
      ["no-times", null],
      ["ok", "added"],
    ]);
    expect(preview.summary).toMatchObject({ validDays: 1, errorRows: 1 });
    expect(preview.requiresAcknowledgement).toBe(true);
  });

  it("compares a jamaat-only file against the stored days field by field", async () => {
    await upsertPrayerDays(fullDays("2027-01-01", 3));
    const file = jamaatOnlyCsv([
      ["2027-01-01", "06:45", "13:00", "14:30", "16:25", "19:30"],
      ["2027-01-02", "06:30", "13:00", "14:30", "16:25", "19:30"],
      ["2027-01-03", "06:30", "13:00", "14:30", "16:25", ""],
    ]);
    const preview = previewOf(await previewImportForm(importForm(file), NOW));

    expect(preview.mappedFields).toStrictEqual([
      "fajrJamaat",
      "dhuhrJamaat",
      "asrJamaat",
      "maghribJamaat",
      "ishaJamaat",
    ]);
    expect(codes(preview.issues, "warning")).toStrictEqual(["no-begins-columns"]);
    expect(preview.diff).toMatchObject({ added: 0, updated: 2, unchanged: 1 });
    expect(preview.diff.changes).toStrictEqual([
      { date: "2027-01-01", fields: [{ field: "fajrJamaat", from: "06:30", to: "06:45" }] },
      { date: "2027-01-03", fields: [{ field: "ishaJamaat", from: "19:30", to: null }] },
    ]);
  });

  it("reports a file with nothing usable as not committable", async () => {
    const preview = previewOf(
      await previewImportForm(importForm(textFile("t.csv", "Date,Fajr Begins\n")), NOW),
    );
    expect(preview.canCommit).toBe(false);
    expect(preview.requiresAcknowledgement).toBe(false);
    expect(preview.issueCounts.error).toBeGreaterThan(0);
    expect(preview.summary.validDays).toBe(0);
    expect(preview.diff).toMatchObject({ added: 0, updated: 0, unchanged: 0 });
  });

  it("answers a file that cannot be read with the importer's explanation", async () => {
    const result = await previewImportForm(importForm(new File(["%PDF-1.7 ..."], "times.pdf")), NOW);
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(result.ok ? null : result.error).toMatch(/PDF/);
    expect(result.ok ? null : result.fieldErrors?.file).toBe(result.ok ? null : result.error);
  });

  it("reads an Excel workbook", async () => {
    const days = fullDays("2027-03-01", 5);
    const file = binaryFile("march.xlsx", await toXlsx(days));
    const preview = previewOf(await previewImportForm(importForm(file), NOW));
    expect(preview.file.format).toBe("xlsx");
    expect(preview.summary.validDays).toBe(5);
    expect(preview.rows.map((row) => row.day)).toStrictEqual(days);
  });

  it("uses the column choices sent back by the screen", async () => {
    const file = textFile("t.csv", "When,A,B\n2027-03-01,06:10,19:30\n2027-03-02,06:10,19:30\n");
    const guessed = previewOf(await previewImportForm(importForm(file), NOW));
    expect(guessed.canCommit).toBe(false);

    const mapping = JSON.stringify({ "*": { date: 0, fajrJamaat: 1, ishaJamaat: 2 } });
    const mapped = previewOf(await previewImportForm(importForm(file, { mapping }), NOW));
    expect(mapped.canCommit).toBe(true);
    expect(mapped.sheets[0].mappingSource).toBe("provided");
    expect(mapped.mappedFields).toStrictEqual(["fajrJamaat", "ishaJamaat"]);
    expect(mapped.rows.find((row) => row.status === "ok")?.day).toMatchObject({
      date: "2027-03-01",
      fajrJamaat: "06:10",
      ishaJamaat: "19:30",
      fajrBegins: null,
    });
  });

  it("passes fill-down on to the importer", async () => {
    const file = jamaatOnlyCsv([
      ["2027-01-01", "06:45", "13:00", "14:30", "16:25", "19:30"],
      ["2027-01-02", "", "13:00", "14:30", "16:30", "19:30"],
    ]);
    const plain = previewOf(await previewImportForm(importForm(file), NOW));
    expect(plain.rows[1].day?.fajrJamaat).toBeNull();

    const filled = previewOf(await previewImportForm(importForm(file, { fillDown: "true" }), NOW));
    expect(filled.options.fillDown).toBe(true);
    expect(filled.rows[1].day?.fajrJamaat).toBe("06:45");
    expect(codes(filled.issues, "info")).toContain("cells-filled-down");
  });

  describe("dates without a year", () => {
    const file = textFile(
      "t.csv",
      "Date,Fajr Begins,Fajr Jamaat\n1 Jan,06:10,06:30\n2 Jan,06:10,06:30\n",
    );

    it("asks for the year instead of assuming the current one", async () => {
      const preview = previewOf(await previewImportForm(importForm(file), NOW));
      expect(codes(preview.issues, "error")).toStrictEqual(["year-unknown"]);
      expect(preview.canCommit).toBe(false);
      expect(preview.rows).toStrictEqual([]);
      expect(preview.options.year).toBeNull();
    });

    it("uses the year the user supplied", async () => {
      const preview = previewOf(await previewImportForm(importForm(file, { year: "2027" }), NOW));
      expect(preview.options.year).toBe(2027);
      expect(preview.rows.map((row) => row.date)).toStrictEqual(["2027-01-01", "2027-01-02"]);
      expect(codes(preview.issues, "error")).toStrictEqual([]);
    });
  });

  describe("dates far from the mosque's current year", () => {
    const csvFor = (year: number) =>
      textFile(
        "t.csv",
        `Date,Fajr Begins,Fajr Jamaat\n${year}-01-01,06:10,06:30\n${year}-01-02,06:10,06:30\n`,
      );

    it("warns about a file dated years ago although no year was supplied", async () => {
      const preview = previewOf(await previewImportForm(importForm(csvFor(2019)), NOW));
      const warning = preview.issues.find((issue) => issue.code === "dates-far-from-year");
      expect(warning?.message).toMatch(/more than 2 years away from 2026/);
      expect(preview.rows.map((row) => row.date)).toStrictEqual(["2019-01-01", "2019-01-02"]);
    });

    it("does not warn about next year's timetable", async () => {
      const preview = previewOf(await previewImportForm(importForm(csvFor(2027)), NOW));
      expect(preview.issues.map((issue) => issue.code)).not.toContain("dates-far-from-year");
    });

    it("takes the current year from the mosque's calendar, not from UTC", async () => {
      // 31 December 2026, 23:30 UTC: already 2027 on Kiritimati (UTC+14).
      await saveSettings({ timezone: "Pacific/Kiritimati" });
      const newYearsEve = Date.UTC(2026, 11, 31, 23, 30);
      const preview = previewOf(await previewImportForm(importForm(csvFor(2024)), newYearsEve));
      const warning = preview.issues.find((issue) => issue.code === "dates-far-from-year");
      expect(warning?.message).toMatch(/away from 2027/);
    });
  });

  describe("notes longer than the database stores", () => {
    const noteCsv = (note: string) =>
      textFile("t.csv", `Date,Fajr Begins,Fajr Jamaat,Note\n2027-01-01,06:10,06:30,${note}\n`);

    it("cuts the note to the stored length and says so on the row", async () => {
      const preview = previewOf(await previewImportForm(importForm(noteCsv("n".repeat(150))), NOW));
      const [row] = preview.rows;
      expect(row.day?.note).toBe("n".repeat(MAX_DAY_NOTE_LENGTH));
      expect(row.issues.map((issue) => issue.code)).toStrictEqual(["note-truncated"]);
      expect(row.issues[0]).toMatchObject({
        severity: "warning",
        field: "note",
        rowNumber: 2,
        message: `Row 2: the note is longer than ${MAX_DAY_NOTE_LENGTH} characters and was cut short.`,
      });
      expect(preview.issues.filter((issue) => issue.code === "note-truncated")).toStrictEqual(row.issues);
      expect(preview.summary.warnings).toBe(preview.issueCounts.warning);
      expect(preview.requiresAcknowledgement).toBe(true);
    });

    it("replaces the importer's own remark rather than adding a second one", async () => {
      const preview = previewOf(await previewImportForm(importForm(noteCsv("n".repeat(250))), NOW));
      const remarks = preview.issues.filter((issue) => issue.code === "note-truncated");
      expect(remarks).toHaveLength(1);
      expect(remarks[0].message).toMatch(new RegExp(`longer than ${MAX_DAY_NOTE_LENGTH} characters`));
      expect(preview.rows[0].issues).toStrictEqual(remarks);
      expect(preview.rows[0].day?.note).toHaveLength(MAX_DAY_NOTE_LENGTH);
    });

    it("keeps the issues in file order after adding its warning", async () => {
      const file = textFile(
        "t.csv",
        [
          "Date,Fajr Begins,Sunrise,Dhuhr Begins,Note",
          `2027-01-01,06:10,07:50,12:05,${"a".repeat(130)}`,
          "2027-01-02,06:10,07:50,07:00,",
        ].join("\n"),
      );
      const preview = previewOf(await previewImportForm(importForm(file), NOW));
      const rowIssues = preview.issues.filter((issue) => issue.rowNumber !== null);
      expect(rowIssues.map((issue) => [issue.rowNumber, issue.code])).toStrictEqual([
        [2, "note-truncated"],
        [3, "times-out-of-order"],
        [3, "time-jump"],
      ]);
      const fileLevel = preview.issues.findIndex((issue) => issue.rowNumber === null);
      const firstRow = preview.issues.findIndex((issue) => issue.rowNumber !== null);
      expect(fileLevel).toBeLessThan(firstRow);
    });

    it("leaves a note of exactly the stored length alone", async () => {
      const preview = previewOf(
        await previewImportForm(importForm(noteCsv("n".repeat(MAX_DAY_NOTE_LENGTH))), NOW),
      );
      expect(preview.rows[0].day?.note).toHaveLength(MAX_DAY_NOTE_LENGTH);
      expect(preview.issues.map((issue) => issue.code)).not.toContain("note-truncated");
    });
  });

  describe("limits on what is sent to the browser", () => {
    it("sends the first rows in full and counts the rest", async () => {
      const total = IMPORT_PREVIEW_ROW_LIMIT + 100;
      const preview = previewOf(
        await previewImportForm(importForm(csvFile("long.csv", fullDays("2027-01-01", total))), NOW),
      );
      expect(preview.rows).toHaveLength(IMPORT_PREVIEW_ROW_LIMIT);
      expect(preview.rowsTruncated).toBe(true);
      expect(preview.totalRows).toBe(total);
      expect(preview.summary.validDays).toBe(total);
      expect(preview.diff.added).toBe(total);
      expect(preview.rows[IMPORT_PREVIEW_ROW_LIMIT - 1].date).toBe(
        addDays("2027-01-01", IMPORT_PREVIEW_ROW_LIMIT - 1),
      );
    });

    it("caps the issue list, dropping remarks before problems, and still counts everything", async () => {
      const total = IMPORT_PREVIEW_ISSUE_LIMIT + 50;
      const lines = ["Date,Fajr Begins,Fajr Jamaat", "2027-01-01,06:10,06:30", "footer text,,"];
      for (let offset = 1; offset <= total; offset++) {
        lines.push(`${addDays("2027-01-01", offset)},not a time,06:30`);
      }
      const preview = previewOf(await previewImportForm(importForm(textFile("bad.csv", lines.join("\n"))), NOW));

      expect(preview.issueCounts.error).toBe(total);
      expect(preview.issueCounts.info).toBeGreaterThan(0);
      expect(preview.issues).toHaveLength(IMPORT_PREVIEW_ISSUE_LIMIT);
      expect(preview.issuesTruncated).toBe(true);
      expect(preview.issues.every((issue) => issue.severity === "error")).toBe(true);
      const rowNumbers = preview.issues.map((issue) => issue.rowNumber ?? 0);
      expect(rowNumbers).toStrictEqual([...rowNumbers].sort((a, b) => a - b));
    });

    it("refuses a file with more days than one import can hold", async () => {
      const file = csvFile("huge.csv", fullDays("2027-01-01", MAX_UPSERT_DAYS + 1));
      const result = await previewImportForm(importForm(file), NOW);
      expect(result).toMatchObject({ ok: false, code: "invalid" });
      expect(result.ok ? null : result.error).toMatch(
        new RegExp(`${MAX_UPSERT_DAYS + 1} days.*At most ${MAX_UPSERT_DAYS}`),
      );
    });
  });
});

describe("parseWorkbook", () => {
  const workbookOf = (csv: string) =>
    readSpreadsheet({ fileName: "t.csv", data: new TextEncoder().encode(csv) });

  it("reads the file exactly as the importer does when the user supplied the year", async () => {
    const workbook = await workbookOf("Date,Fajr Begins\n1 Jan,06:10\n");
    expect(parseWorkbook(workbook, { year: 2030 }, 2026)).toStrictEqual(
      parseTimetable(workbook, { year: 2030 }),
    );
  });

  it("never fills in the current year for dates that have none", async () => {
    const workbook = await workbookOf("Date,Fajr Begins\n1 Jan,06:10\n");
    const result = parseWorkbook(workbook, {}, 2026);
    expect(result.days).toStrictEqual([]);
    expect(result.issues.map((issue) => issue.code)).toContain("year-unknown");
  });

  it("changes no date when it adds the current year as the yardstick", async () => {
    const workbook = await workbookOf(
      "Date,Fajr Begins\n2027-12-30,06:10\n2027-12-31,06:10\n2028-01-01,06:10\n",
    );
    const plain = parseTimetable(workbook, {});
    const checked = parseWorkbook(workbook, {}, 2026);
    expect(checked.days).toStrictEqual(plain.days);
    expect(checked.issues).toStrictEqual(plain.issues);
  });
});

describe("commitImport", () => {
  it("saves a clean file and records it in the import history", async () => {
    const days = fullDays("2027-01-01", 31);
    const result = committed(
      await commitImportForm(importForm(csvFile("January 2027.csv", days)), NOW),
    );

    expect(result).toStrictEqual({
      ok: true,
      added: 31,
      updated: 0,
      unchanged: 0,
      firstDate: "2027-01-01",
      lastDate: "2027-01-31",
      warnings: 0,
      fileName: "January 2027.csv",
    });
    expect(await getAllPrayerDays()).toStrictEqual(days);
    expect(await listImportLog()).toMatchObject([
      {
        fileName: "January 2027.csv",
        added: 31,
        updated: 0,
        unchanged: 0,
        firstDate: "2027-01-01",
        lastDate: "2027-01-31",
        warnings: 0,
        createdAt: new Date(NOW).toISOString(),
      },
    ]);
  });

  it("reports everything unchanged when the same file is imported again", async () => {
    const file = csvFile("jan.csv", fullDays("2027-01-01", 31));
    await commitImportForm(importForm(file), NOW);
    const before = await database.client.execute("SELECT date, updated_at FROM prayer_days");

    const second = committed(await commitImportForm(importForm(file), NOW + 60_000));

    expect(second).toMatchObject({ added: 0, updated: 0, unchanged: 31 });
    const after = await database.client.execute("SELECT date, updated_at FROM prayer_days");
    expect(after.rows).toStrictEqual(before.rows);
    expect(await listImportLog()).toHaveLength(2);
  });

  it("does what the preview said it would", async () => {
    await upsertPrayerDays([fullDay("2027-01-01"), fullDay("2027-01-02")]);
    const file = csvFile("jan.csv", [
      fullDay("2027-01-01"),
      fullDay("2027-01-02", { ishaJamaat: "19:45" }),
      fullDay("2027-01-03"),
    ]);
    const preview = previewOf(await previewImportForm(importForm(file), NOW));
    const result = committed(await commitImportForm(importForm(file), NOW));

    expect([result.added, result.updated, result.unchanged]).toStrictEqual([
      preview.diff.added,
      preview.diff.updated,
      preview.diff.unchanged,
    ]);
  });

  it("refuses a file with warnings until they are acknowledged", async () => {
    const file = csvFile("feb.csv", [
      fullDay("2027-02-01"),
      fullDay("2027-02-02", { dhuhrBegins: OUT_OF_ORDER_DHUHR }),
    ]);

    const unconfirmed: Record<string, string>[] = [
      {},
      { acknowledgeWarnings: "false" },
      { acknowledgeWarnings: "" },
    ];
    for (const fields of unconfirmed) {
      const refused = await commitImportForm(importForm(file, fields), NOW);
      expect(refused).toMatchObject({ ok: false, code: "confirmation-required" });
      expect(refused.ok ? null : refused.error).toMatch(/Nothing was imported yet/);
      expect(refused.ok ? null : refused.fieldErrors).toHaveProperty("acknowledgeWarnings");
    }
    expect(await getAllPrayerDays()).toStrictEqual([]);
    expect(await listImportLog()).toStrictEqual([]);

    const accepted = committed(await commitImportForm(importForm(file, ACKNOWLEDGED), NOW));
    expect(accepted.added).toBe(2);
    expect(accepted.warnings).toBeGreaterThan(0);
    expect((await listImportLog())[0].warnings).toBe(accepted.warnings);
    expect((await getPrayerDay("2027-02-02"))?.dhuhrBegins).toBe(OUT_OF_ORDER_DHUHR);
  });

  it("names how many problems and warnings stand in the way", async () => {
    const file = textFile(
      "t.csv",
      [
        "Date,Fajr Begins,Sunrise,Dhuhr Begins",
        "2027-01-01,06:10,07:50,12:05",
        "2027-01-02,oops,07:50,12:05",
      ].join("\n"),
    );
    const refused = await commitImportForm(importForm(file), NOW);
    expect(refused.ok ? null : refused.error).toMatch(/1 problem and \d+ warnings?/);
  });

  it("imports the usable rows of a file with bad rows once that is acknowledged", async () => {
    const file = textFile(
      "t.csv",
      [
        "Date,Fajr Begins,Fajr Jamaat,Sunrise,Dhuhr Begins,Dhuhr Jamaat,Asr Begins,Asr Jamaat,Maghrib Begins,Maghrib Jamaat,Isha Begins,Isha Jamaat",
        "2027-01-01,06:10,06:30,07:50,12:05,13:00,14:10,14:30,16:20,16:25,17:55,19:30",
        "2027-01-02,oops,06:30,07:50,12:05,13:00,14:10,14:30,16:20,16:25,17:55,19:30",
      ].join("\n"),
    );
    expect(await commitImportForm(importForm(file), NOW)).toMatchObject({
      ok: false,
      code: "confirmation-required",
    });
    const result = committed(await commitImportForm(importForm(file, ACKNOWLEDGED), NOW));
    expect(result).toMatchObject({ added: 1, firstDate: "2027-01-01", lastDate: "2027-01-01" });
    expect((await getAllPrayerDays()).map((day) => day.date)).toStrictEqual(["2027-01-01"]);
  });

  it("refuses a file with no usable day, acknowledged or not", async () => {
    for (const content of ["Date,Fajr Begins\n", "just some text\n", "Date,Fajr Begins\n1 Jan,06:10\n"]) {
      const result = await commitImportForm(importForm(textFile("t.csv", content), ACKNOWLEDGED), NOW);
      expect(result).toMatchObject({ ok: false, code: "invalid" });
      expect(result.ok ? null : result.error).toMatch(/^Nothing was imported\. /);
    }
    expect(await getAllPrayerDays()).toStrictEqual([]);
    expect(await listImportLog()).toStrictEqual([]);
  });

  it("quotes the importer's reason when nothing can be imported", async () => {
    const result = await commitImportForm(
      importForm(textFile("t.csv", "Date,Fajr Begins\n1 Jan,06:10\n"), ACKNOWLEDGED),
      NOW,
    );
    expect(result.ok ? null : result.error).toMatch(/The dates have no year/);
  });

  it("refuses an unreadable file", async () => {
    const result = await commitImportForm(
      importForm(new File(["%PDF-1.7 ..."], "times.pdf"), ACKNOWLEDGED),
      NOW,
    );
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(result.ok ? null : result.fieldErrors).toHaveProperty("file");
  });

  it("keeps stored begin times when a jamaat-only file is imported", async () => {
    const stored = [
      fullDay("2027-01-01", { note: "New Year" }),
      fullDay("2027-01-02"),
      fullDay("2027-01-03"),
    ];
    await upsertPrayerDays(stored);
    const file = jamaatOnlyCsv([
      ["2027-01-01", "06:45", "13:15", "14:45", "16:30", "19:45"],
      ["2027-01-02", "06:30", "13:00", "14:30", "16:25", "19:30"],
      ["2027-01-04", "06:45", "13:15", "14:45", "16:30", "19:45"],
    ]);

    const result = committed(await commitImportForm(importForm(file, ACKNOWLEDGED), NOW));

    expect(result).toMatchObject({ added: 1, updated: 1, unchanged: 1 });
    expect(await getPrayerDay("2027-01-01")).toStrictEqual({
      ...stored[0],
      fajrJamaat: "06:45",
      dhuhrJamaat: "13:15",
      asrJamaat: "14:45",
      maghribJamaat: "16:30",
      ishaJamaat: "19:45",
    });
    expect(await getPrayerDay("2027-01-02")).toStrictEqual(stored[1]);
    expect(await getPrayerDay("2027-01-03")).toStrictEqual(stored[2]);
    expect(await getPrayerDay("2027-01-04")).toMatchObject({
      fajrBegins: null,
      sunrise: null,
      fajrJamaat: "06:45",
      ishaJamaat: "19:45",
    });
  });

  it("clears a stored time when the file has the column and leaves the cell empty", async () => {
    await upsertPrayerDays([fullDay("2027-01-01")]);
    const file = jamaatOnlyCsv([["2027-01-01", "06:30", "13:00", "14:30", "16:25", ""]]);

    await commitImportForm(importForm(file, ACKNOWLEDGED), NOW);

    expect(await getPrayerDay("2027-01-01")).toStrictEqual(fullDay("2027-01-01", { ishaJamaat: null }));
  });

  it("parses the uploaded bytes again instead of trusting an earlier preview", async () => {
    const previewed = csvFile("jan.csv", [fullDay("2027-01-01", { fajrJamaat: "06:30" })]);
    const preview = previewOf(await previewImportForm(importForm(previewed), NOW));
    expect(preview.rows[0].day?.fajrJamaat).toBe("06:30");

    // The same file name, different content: what counts is what arrives with the commit.
    const sent = csvFile("jan.csv", [fullDay("2027-01-01", { fajrJamaat: "06:50" })]);
    await commitImportForm(importForm(sent), NOW);

    expect((await getPrayerDay("2027-01-01"))?.fajrJamaat).toBe("06:50");
  });

  it("ignores rows and days smuggled in next to the file", async () => {
    const forged = fullDay("2027-01-01", { fajrJamaat: "03:00" });
    const formData = importForm(csvFile("jan.csv", [fullDay("2027-01-01")]), {
      rows: JSON.stringify([{ status: "ok", date: forged.date, day: forged }]),
      days: JSON.stringify([forged, fullDay("2030-06-01")]),
      diff: JSON.stringify({ added: 0, updated: 0, unchanged: 0 }),
    });

    const result = committed(await commitImportForm(formData, NOW));

    expect(result).toMatchObject({ added: 1, firstDate: "2027-01-01", lastDate: "2027-01-01" });
    expect(await getAllPrayerDays()).toStrictEqual([fullDay("2027-01-01")]);
  });

  it("stores notes cut to the length the database accepts instead of failing", async () => {
    const file = textFile(
      "t.csv",
      `Date,Fajr Begins,Fajr Jamaat,Note\n2027-01-01,06:10,06:30,${"n".repeat(180)}\n`,
    );
    const result = committed(await commitImportForm(importForm(file, ACKNOWLEDGED), NOW));
    expect(result.added).toBe(1);
    expect((await getPrayerDay("2027-01-01"))?.note).toBe("n".repeat(MAX_DAY_NOTE_LENGTH));
  });

  it("treats Jumu'ah times written out of order as the same times on a second import", async () => {
    // 1 January 2027 is a Friday.
    const file = textFile(
      "t.csv",
      "Date,Fajr Begins,Fajr Jamaat,Jumuah 1,Jumuah 2\n2027-01-01,06:10,06:30,13:30,12:45\n",
    );
    await commitImportForm(importForm(file, ACKNOWLEDGED), NOW);
    expect((await getPrayerDay("2027-01-01"))?.jumuah).toStrictEqual(["12:45", "13:30"]);

    const again = previewOf(await previewImportForm(importForm(file), NOW));
    expect(again.diff).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    expect(committed(await commitImportForm(importForm(file, ACKNOWLEDGED), NOW))).toMatchObject({
      updated: 0,
      unchanged: 1,
    });
  });

  it("saves nothing at all when the write fails part of the way", async () => {
    await upsertPrayerDays([fullDay("2027-01-01")]);
    await database.client.execute(
      "CREATE TRIGGER reject_day BEFORE INSERT ON prayer_days WHEN NEW.date = '2027-01-20' " +
        "BEGIN SELECT RAISE(ABORT, 'rejected for the test'); END",
    );
    try {
      const file = csvFile("jan.csv", [
        fullDay("2027-01-01", { fajrJamaat: "06:50" }),
        ...fullDays("2027-01-02", 30),
      ]);
      await expect(commitImportForm(importForm(file), NOW)).rejects.toThrow();
    } finally {
      await database.client.execute("DROP TRIGGER reject_day");
    }
    expect(await getAllPrayerDays()).toStrictEqual([fullDay("2027-01-01")]);
    expect(await listImportLog()).toStrictEqual([]);
  });

  it("still reports success when only the history entry cannot be written", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await database.client.execute("ALTER TABLE import_log RENAME TO import_log_away");
    try {
      const result = await commitImportForm(importForm(csvFile("jan.csv", fullDays("2027-01-01", 2))), NOW);
      expect(result).toMatchObject({ ok: true, added: 2 });
    } finally {
      await database.client.execute("ALTER TABLE import_log_away RENAME TO import_log");
    }
    expect(await getAllPrayerDays()).toHaveLength(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toMatch(/could not write the import log/);
  });

  it("lets two overlapping imports each build on the other instead of overwriting it", async () => {
    await upsertPrayerDays(fullDays("2027-01-01", 3));
    const jamaat = await requestOf(
      importForm(
        jamaatOnlyCsv([
          ["2027-01-01", "06:45", "13:15", "14:45", "16:30", "19:45"],
          ["2027-01-02", "06:45", "13:15", "14:45", "16:30", "19:45"],
          ["2027-01-03", "06:45", "13:15", "14:45", "16:30", "19:45"],
        ]),
        ACKNOWLEDGED,
      ),
    );
    const begins = await requestOf(
      importForm(
        textFile(
          "begins.csv",
          [
            "Date,Fajr Begins,Sunrise,Dhuhr Begins,Asr Begins,Maghrib Begins,Isha Begins",
            "2027-01-01,06:12,07:52,12:06,14:11,16:21,17:56",
            "2027-01-02,06:12,07:52,12:06,14:11,16:21,17:56",
            "2027-01-03,06:12,07:52,12:06,14:11,16:21,17:56",
          ].join("\n"),
        ),
        ACKNOWLEDGED,
      ),
    );

    const [first, second] = await Promise.all([commitImport(jamaat, NOW), commitImport(begins, NOW)]);

    expect(first).toMatchObject({ ok: true, updated: 3 });
    expect(second).toMatchObject({ ok: true, updated: 3 });
    const expected: PrayerDay = {
      date: "2027-01-02",
      fajrBegins: "06:12",
      fajrJamaat: "06:45",
      sunrise: "07:52",
      dhuhrBegins: "12:06",
      dhuhrJamaat: "13:15",
      asrBegins: "14:11",
      asrJamaat: "14:45",
      maghribBegins: "16:21",
      maghribJamaat: "16:30",
      ishaBegins: "17:56",
      ishaJamaat: "19:45",
      jumuah: [],
      note: null,
    };
    expect(await getPrayerDay("2027-01-02")).toStrictEqual(expected);
  });

  it("previews without the acknowledgement flag mattering", async () => {
    const request = await requestOf(
      importForm(csvFile("feb.csv", [fullDay("2027-02-02", { dhuhrBegins: OUT_OF_ORDER_DHUHR })])),
    );
    expect((await previewImport(request, NOW)).ok).toBe(true);
    expect(await getAllPrayerDays()).toStrictEqual([]);
  });
});
