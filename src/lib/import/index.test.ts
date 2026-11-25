import { describe, expect, it } from "vitest";
import * as engine from "./index";
import type { PrayerDay } from "@/lib/types";

/**
 * The route handlers only import from the barrel. This walks the whole
 * journey of an upload through it, the way the admin screens will.
 */
describe("the import engine as the app uses it", () => {
  const saved: PrayerDay[] = [
    { ...engine.blankDay("2027-01-01"), fajrBegins: "06:25", fajrJamaat: "06:45", ishaBegins: "17:38", ishaJamaat: "18:00", note: "Bank holiday" },
    { ...engine.blankDay("2027-01-02"), fajrBegins: "06:25", fajrJamaat: "06:45", ishaBegins: "17:38", ishaJamaat: "18:00" },
  ];

  it("previews and merges an uploaded sheet of jamaat changes, then exports the result", async () => {
    const upload = "Date;Fajr Iqamah;Isha Iqamah\n01/01/2027;7:00;6:15\n02/01/2027;6:45;6:00\n03/01/2027;6:45;6:00\n";
    const workbook = await engine.readSpreadsheet({ fileName: "january.csv", data: new TextEncoder().encode(upload) });
    const result = engine.parseTimetable(workbook, { year: 2027 });

    expect(result.summary).toMatchObject({ validDays: 3, errorRows: 0, dateOrderUsed: "dmy" });
    expect(result.mappedFields).toEqual(["fajrJamaat", "ishaJamaat"]);
    expect(result.issues.map((issue) => issue.code).sort()).toEqual(["no-begins-columns", "pm-assumed", "prayer-not-found"]);

    const diff = engine.diffTimetable(saved, result.days, result.mappedFields);
    expect(diff.unchanged).toBe(1);
    expect(diff.added.map((day) => day.date)).toEqual(["2027-01-03"]);
    expect(diff.changed.map((change) => [change.date, change.fields])).toEqual([
      [
        "2027-01-01",
        [
          { field: "fajrJamaat", from: "06:45", to: "07:00" },
          { field: "ishaJamaat", from: "18:00", to: "18:15" },
        ],
      ],
    ]);

    const toWrite = engine.daysToSave(diff);
    expect(toWrite[0]).toEqual({ ...saved[0], fajrJamaat: "07:00", ishaJamaat: "18:15" });

    const after = [saved[1], ...toWrite];
    const exported = await engine.readSpreadsheet({ fileName: "export.xlsx", data: await engine.toXlsx(after) });
    expect(engine.parseTimetable(exported).days).toEqual([toWrite[0], saved[1], toWrite[1]]);
  });

  it("rejects a file that is not a spreadsheet with an error the route can show", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 not a timetable");
    const failure = await engine.readSpreadsheet({ fileName: "timetable.pdf", data: pdf }).catch((error: unknown) => error);
    expect(engine.isImportFileError(failure)).toBe(true);
    expect(failure).toMatchObject({ code: "unsupported-format" });
    expect(engine.IMPORT_FILE_ERROR_CODES).toContain("unsupported-format");
  });

  it("exposes the building blocks the mapping screen needs", () => {
    const table = engine.detectTable({ name: "Sheet1", rows: [["Date", "Fajr", "Zuhr"], ["2027-01-01", "6:25", "12:09"]] });
    expect(table).not.toBeNull();
    expect(engine.guessMapping(table?.columns ?? [])).toMatchObject({ date: 0, fajrBegins: 1, dhuhrBegins: 2 });
    expect(engine.MAPPING_TARGETS).toContain("jumuah3");
    expect(engine.TARGET_LABELS.fajrJamaat).toBe(engine.FIELD_LABELS.fajrJamaat);
    expect(engine.parseTimeCell("5:30 pm", "asrBegins").time).toBe("17:30");
    expect(engine.parseDateCell("31/01/2027", { dateOrder: "dmy" })).toBe("2027-01-31");
    expect(engine.exportHeaders()).toHaveLength(16);
  });
});
