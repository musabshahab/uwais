import { describe, expect, it } from "vitest";
import { IMPORT_FORM_FIELDS, type ImportPreviewData, type ImportPreviewRow } from "@/lib/actions/types";
import {
  MAPPING_TARGETS,
  MERGE_FIELDS,
  type ColumnMapping,
  type ImportIssue,
  type MergeField,
  type SheetReport,
} from "@/lib/import/types";
import { PRAYERS } from "@/lib/types";
import {
  ALL_SHEETS_KEY,
  EMPTY_CHANGE_VALUE,
  FILE_ACCEPT,
  INITIAL_IMPORT_OPTIONS,
  MAPPING_GROUPS,
  buildImportFormData,
  changesByDate,
  checkSelectedFile,
  columnOptionLabel,
  daysAffected,
  defaultIssueFilter,
  describeProvided,
  describeSheets,
  editMapping,
  editableSheets,
  fileExtension,
  filterIssues,
  filterRows,
  formatChangeValue,
  importVerdict,
  isYearReady,
  issueLocation,
  mappingGaps,
  mappingTargetLabel,
  mappingTargetName,
  mappingsAgree,
  mergeFieldLabel,
  needsYear,
  offersDateOrder,
  offersFillDown,
  pageCount,
  pageSlice,
  rowOutcome,
  setApplyToAll,
} from "./import-wizard";

const MAX_BYTES = 5 * 1024 * 1024;

function mapping(overrides: Partial<ColumnMapping> = {}): ColumnMapping {
  const empty = Object.fromEntries(MAPPING_TARGETS.map((target) => [target, null])) as ColumnMapping;
  return { ...empty, ...overrides };
}

const FULL = mapping({
  date: 0,
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
  note: 12,
});

function issue(overrides: Partial<ImportIssue> = {}): ImportIssue {
  return { severity: "warning", code: "time-jump", message: "m", sheet: "Jan", rowNumber: 5, ...overrides };
}

function sheet(name: string, status: SheetReport["status"], columns = 3): SheetReport {
  return {
    name,
    status,
    headerRowNumber: 1,
    headerRowCount: 1,
    columns: Array.from({ length: columns }, (_, index) => ({
      index,
      letter: String.fromCharCode(65 + index),
      label: `Column ${index}`,
      samples: [],
      content: "other" as const,
    })),
    mapping: FULL,
    mappingSource: "guessed",
    ignoredColumns: [],
    unmappedColumns: [],
    dateOrder: null,
    rowCount: 10,
  };
}

function preview(overrides: Partial<ImportPreviewData> = {}): ImportPreviewData {
  return {
    file: { name: "t.csv", size: 100, format: "csv" },
    options: { year: null, dateOrder: "auto", fillDown: false },
    sheets: [sheet("t", "imported")],
    mapping: { t: FULL },
    mappedFields: [...MERGE_FIELDS],
    rows: [],
    totalRows: 0,
    rowsTruncated: false,
    issues: [],
    issueCounts: { error: 0, warning: 0, info: 0 },
    issuesTruncated: false,
    summary: {
      totalRows: 365,
      validDays: 365,
      errorRows: 0,
      skippedRows: 0,
      warnings: 0,
      firstDate: "2027-01-01",
      lastDate: "2027-12-31",
      missingDates: [],
      pmAssumedFields: [],
      dateOrderUsed: null,
    },
    diff: { added: 365, updated: 0, unchanged: 0, changes: [], changesTruncated: false },
    canCommit: true,
    requiresAcknowledgement: false,
    ...overrides,
  };
}

describe("checkSelectedFile", () => {
  it("accepts the supported kinds of file", () => {
    for (const name of ["t.csv", "T.XLSX", "times.tsv", "times.txt", "March 2027.csv"]) {
      expect(checkSelectedFile({ name, size: 2000 }, MAX_BYTES)).toBeNull();
    }
  });

  it("explains how to convert an old Excel file", () => {
    expect(checkSelectedFile({ name: "times.xls", size: 2000 }, MAX_BYTES)).toContain("Save As");
  });

  it("refuses other kinds of file by name", () => {
    const message = checkSelectedFile({ name: "timetable.pdf", size: 2000 }, MAX_BYTES);
    expect(message).toContain('"timetable.pdf"');
    expect(message).toContain(".xlsx");
  });

  it("refuses an empty file", () => {
    expect(checkSelectedFile({ name: "t.csv", size: 0 }, MAX_BYTES)).toContain("empty");
  });

  it("refuses a file over the limit and says both sizes", () => {
    const message = checkSelectedFile({ name: "t.xlsx", size: MAX_BYTES + 1024 * 1024 }, MAX_BYTES);
    expect(message).toContain("6 MB");
    expect(message).toContain("5 MB");
    expect(checkSelectedFile({ name: "t.xlsx", size: MAX_BYTES }, MAX_BYTES)).toBeNull();
  });

  it("lets a file without an ending through for the server to judge", () => {
    expect(checkSelectedFile({ name: "timetable", size: 10 }, MAX_BYTES)).toBeNull();
    expect(fileExtension(".hidden")).toBe("");
  });

  it("offers the same endings to the file picker", () => {
    expect(FILE_ACCEPT).toBe(".csv,.xlsx,.tsv,.txt");
  });
});

describe("isYearReady", () => {
  it("accepts nothing or a complete plausible year", () => {
    expect(isYearReady("")).toBe(true);
    expect(isYearReady(" 2027 ")).toBe(true);
    expect(isYearReady("202")).toBe(false);
    expect(isYearReady("1999")).toBe(false);
    expect(isYearReady("2101")).toBe(false);
    expect(isYearReady("20x7")).toBe(false);
  });
});

describe("buildImportFormData", () => {
  const file = new Blob(["Date,Fajr\n"], { type: "text/csv" });

  it("sends the file with the default options and nothing else", () => {
    const form = buildImportFormData(file, INITIAL_IMPORT_OPTIONS);
    expect(form.get(IMPORT_FORM_FIELDS.file)).toBeInstanceOf(Blob);
    expect(form.get(IMPORT_FORM_FIELDS.dateOrder)).toBe("auto");
    expect(form.has(IMPORT_FORM_FIELDS.mapping)).toBe(false);
    expect(form.has(IMPORT_FORM_FIELDS.year)).toBe(false);
    expect(form.has(IMPORT_FORM_FIELDS.fillDown)).toBe(false);
    expect(form.has(IMPORT_FORM_FIELDS.acknowledgeWarnings)).toBe(false);
  });

  it("sends every choice the user made", () => {
    const form = buildImportFormData(
      file,
      { mapping: { "*": { date: 0, fajrJamaat: 2 } }, year: " 2027 ", dateOrder: "mdy", fillDown: true },
      true,
    );
    expect(JSON.parse(String(form.get(IMPORT_FORM_FIELDS.mapping)))).toEqual({ "*": { date: 0, fajrJamaat: 2 } });
    expect(form.get(IMPORT_FORM_FIELDS.year)).toBe("2027");
    expect(form.get(IMPORT_FORM_FIELDS.dateOrder)).toBe("mdy");
    expect(form.get(IMPORT_FORM_FIELDS.fillDown)).toBe("true");
    expect(form.get(IMPORT_FORM_FIELDS.acknowledgeWarnings)).toBe("true");
  });
});

describe("mapping groups and labels", () => {
  it("cover every mapping target exactly once", () => {
    const targets = MAPPING_GROUPS.flatMap((group) => [...group.targets]);
    expect([...targets].sort()).toEqual([...MAPPING_TARGETS].sort());
  });

  it("list the prayers in the order of the day, sunrise after Fajr", () => {
    expect(MAPPING_GROUPS.map((group) => group.title)).toEqual([
      "Date",
      "Fajr",
      "Sunrise",
      "Dhuhr",
      "Asr",
      "Maghrib",
      "Isha",
      "Jumu'ah",
      "Note",
    ]);
  });

  it("label targets inside their group and in full", () => {
    expect(mappingTargetLabel("fajrBegins")).toBe("Begins");
    expect(mappingTargetLabel("ishaJamaat")).toBe("Jamaat");
    expect(mappingTargetLabel("day")).toBe("Day of the month");
    expect(mappingTargetName("fajrBegins")).toBe("Fajr Begins");
    expect(mappingTargetName("jumuah2")).toBe("Jumu'ah 2");
    expect(mappingTargetName("day")).toBe("Day of the month");
  });

  it("describe a column by letter, heading and sample", () => {
    expect(columnOptionLabel({ letter: "C", label: "Fajr Jamaat", samples: ["", "6:45 AM"] })).toBe(
      "C: Fajr Jamaat (e.g. 6:45 AM)",
    );
    expect(columnOptionLabel({ letter: "D", label: " ", samples: [] })).toBe("D: no heading");
  });
});

describe("mappingGaps", () => {
  it("finds nothing missing in a full mapping", () => {
    expect(mappingGaps(FULL)).toEqual({ dateMissing: false, timesMissing: false, unmatchedTimes: [] });
  });

  it("accepts a day-of-month column as the date", () => {
    expect(mappingGaps(mapping({ day: 0, fajrJamaat: 1 })).dateMissing).toBe(false);
  });

  it("flags a missing date and missing times", () => {
    const gaps = mapping({ note: 3 });
    expect(mappingGaps(gaps).dateMissing).toBe(true);
    expect(mappingGaps(gaps).timesMissing).toBe(true);
    expect(mappingGaps(gaps).unmatchedTimes).toHaveLength(11);
  });

  it("lists the unmatched times of a jamaat-only file", () => {
    const jamaatOnly = mapping({ date: 0, ...Object.fromEntries(PRAYERS.map((p, i) => [p.jamaatField, i + 1])) });
    const gaps = mappingGaps(jamaatOnly);
    expect(gaps.timesMissing).toBe(false);
    expect(gaps.unmatchedTimes).toEqual([
      "fajrBegins",
      "sunrise",
      "dhuhrBegins",
      "asrBegins",
      "maghribBegins",
      "ishaBegins",
    ]);
  });
});

describe("editMapping", () => {
  const used = { January: FULL, February: FULL };

  it("changes one target and keeps the rest of the sheet as shown", () => {
    const next = editMapping(used, null, { sheet: "January", target: "note", column: null, applyToAll: false });
    expect(next).toEqual({ January: { ...FULL, note: null } });
  });

  it("moves a column that another field was using", () => {
    const next = editMapping(used, null, { sheet: "January", target: "fajrBegins", column: 2, applyToAll: false });
    expect(next.January?.fajrBegins).toBe(2);
    expect(next.January?.fajrJamaat).toBeNull();
    expect(next.January?.sunrise).toBe(3);
  });

  it("applies the edited sheet to every sheet when asked", () => {
    const next = editMapping(used, { January: FULL }, { sheet: "January", target: "asrBegins", column: 13, applyToAll: true });
    expect(Object.keys(next)).toEqual([ALL_SHEETS_KEY]);
    expect(next[ALL_SHEETS_KEY]?.asrBegins).toBe(13);
  });

  it("keeps earlier per-sheet choices when editing another sheet", () => {
    const first = editMapping(used, null, { sheet: "January", target: "note", column: null, applyToAll: false });
    const second = editMapping(used, first, { sheet: "February", target: "sunrise", column: null, applyToAll: false });
    expect(second.January?.note).toBeNull();
    expect(second.February?.sunrise).toBeNull();
    expect(second.February?.note).toBe(12);
  });

  it("does not mutate what it was given", () => {
    const overrides = { January: { ...FULL } };
    editMapping(used, overrides, { sheet: "January", target: "note", column: 5, applyToAll: false });
    expect(overrides.January.note).toBe(12);
    expect(used.January.note).toBe(12);
  });

  it("copes with a sheet the preview did not report", () => {
    const next = editMapping(used, null, { sheet: "March", target: "date", column: 0, applyToAll: false });
    expect(next.March?.date).toBe(0);
    expect(next.March?.fajrBegins).toBeNull();
  });

  it("treats a sheet with an awkward name as data, not as a prototype", () => {
    const next = editMapping({ constructor: FULL }, null, {
      sheet: "constructor",
      target: "note",
      column: null,
      applyToAll: false,
    });
    expect(next.constructor).toEqual({ ...FULL, note: null });
  });
});

describe("setApplyToAll", () => {
  const used = { January: FULL, February: mapping({ date: 0, fajrJamaat: 1 }) };

  it("turns one sheet's columns into the entry for all sheets", () => {
    expect(setApplyToAll(used, "February", true)).toEqual({ [ALL_SHEETS_KEY]: used.February });
  });

  it("pins every sheet to its own columns when switched off", () => {
    expect(setApplyToAll(used, "January", false)).toEqual(used);
  });
});

describe("mappingsAgree and editableSheets", () => {
  it("compares the columns of every sheet", () => {
    expect(mappingsAgree({ a: FULL, b: { ...FULL } })).toBe(true);
    expect(mappingsAgree({ a: FULL, b: { ...FULL, note: null } })).toBe(false);
    expect(mappingsAgree({ a: FULL })).toBe(true);
    expect(mappingsAgree({})).toBe(true);
  });

  it("offers the sheets whose columns can be corrected", () => {
    const sheets = [sheet("Jan", "imported"), sheet("Notes", "skipped"), sheet("Feb", "failed"), sheet("Empty", "failed", 0)];
    expect(editableSheets(sheets).map((entry) => entry.name)).toEqual(["Jan", "Feb"]);
  });
});

describe("which options to offer", () => {
  it("asks for the year only when the file has none", () => {
    expect(needsYear(preview())).toBe(false);
    expect(needsYear(preview({ issues: [issue({ severity: "error", code: "year-unknown" })] }))).toBe(true);
    expect(needsYear(preview({ options: { year: 2027, dateOrder: "auto", fillDown: false } }))).toBe(true);
  });

  it("offers the date order when numeric dates were read", () => {
    expect(offersDateOrder(preview())).toBe(false);
    expect(offersDateOrder(preview({ summary: { ...preview().summary, dateOrderUsed: "dmy" } }))).toBe(true);
    expect(offersDateOrder(preview({ issues: [issue({ code: "date-order-assumed" })] }))).toBe(true);
    expect(offersDateOrder(preview({ options: { year: null, dateOrder: "mdy", fillDown: false } }))).toBe(true);
  });

  it("offers fill-down when jamaat cells are left blank", () => {
    expect(offersFillDown(preview())).toBe(false);
    expect(offersFillDown(preview({ issues: [issue({ code: "sparse-jamaat-column" })] }))).toBe(true);
    expect(offersFillDown(preview({ options: { year: null, dateOrder: "auto", fillDown: true } }))).toBe(true);
  });
});

describe("describeProvided", () => {
  const jamaat: MergeField[] = PRAYERS.map((prayer) => prayer.jamaatField);
  const begins: MergeField[] = PRAYERS.map((prayer) => prayer.beginsField);

  it("sums up a complete file", () => {
    const summary = describeProvided([...MERGE_FIELDS]);
    expect(summary.provided).toBe("begins and jamaat times for all five prayers, sunrise, Jumu'ah times and notes");
    expect(summary.kept).toEqual([]);
  });

  it("makes plain what a jamaat-only file leaves alone", () => {
    const summary = describeProvided(jamaat);
    expect(summary.provided).toBe("jamaat times for all five prayers");
    expect(summary.kept).toEqual(["begins times", "sunrise"]);
  });

  it("names single missing columns", () => {
    const summary = describeProvided([...begins, ...jamaat.slice(1), "sunrise"]);
    expect(summary.provided).toBe(
      "begins times for all five prayers, Dhuhr Jamaat, Asr Jamaat, Maghrib Jamaat, Isha Jamaat and sunrise",
    );
    expect(summary.kept).toEqual(["Fajr Jamaat"]);
  });

  it("copes with a file that maps no times", () => {
    expect(describeProvided(["note"]).provided).toBe("notes");
    expect(describeProvided([]).provided).toBe("no prayer times");
  });

  it("labels mergeable fields", () => {
    expect(mergeFieldLabel("fajrJamaat")).toBe("Fajr Jamaat");
    expect(mergeFieldLabel("jumuah")).toBe("Jumu'ah times");
    expect(mergeFieldLabel("note")).toBe("Note");
  });
});

describe("describeSheets", () => {
  it("counts the sheets that were read and those left out", () => {
    expect(describeSheets([sheet("a", "imported")])).toBe("1 sheet read");
    expect(describeSheets([sheet("a", "imported"), sheet("b", "imported"), sheet("c", "skipped")])).toBe(
      "2 sheets read, 1 without a timetable left out",
    );
    expect(describeSheets([sheet("a", "failed")])).toBe("0 sheets read, 1 could not be read");
  });
});

describe("issues", () => {
  const issues = [issue({ severity: "error" }), issue(), issue({ severity: "info" }), issue()];

  it("filters by severity and keeps the order", () => {
    expect(filterIssues(issues, "all")).toHaveLength(4);
    expect(filterIssues(issues, "warning")).toHaveLength(2);
    expect(filterIssues(issues, "error")).toEqual([issues[0]]);
  });

  it("says where an issue is", () => {
    expect(issueLocation(issue(), 1)).toBe("Row 5");
    expect(issueLocation(issue(), 12)).toBe("Jan, row 5");
    expect(issueLocation(issue({ rowNumber: null }), 12)).toBe("Sheet Jan");
    expect(issueLocation(issue({ rowNumber: null }), 1)).toBe("Whole sheet");
    expect(issueLocation(issue({ sheet: null, rowNumber: null }), 3)).toBe("Whole file");
  });

  it("opens the list on what matters most", () => {
    expect(defaultIssueFilter({ error: 2, warning: 0, info: 9 })).toBe("error");
    expect(defaultIssueFilter({ error: 0, warning: 3, info: 9 })).toBe("warning");
    expect(defaultIssueFilter({ error: 1, warning: 3, info: 0 })).toBe("all");
    expect(defaultIssueFilter({ error: 0, warning: 0, info: 2 })).toBe("all");
  });
});

describe("importVerdict", () => {
  it("is ready for a clean file", () => {
    const verdict = importVerdict(preview());
    expect(verdict.tone).toBe("success");
    expect(verdict.title).toBe("This file is ready to publish");
    expect(verdict.detail).toContain("365 days");
  });

  it("asks for a check when there are warnings or errors", () => {
    const verdict = importVerdict(
      preview({ requiresAcknowledgement: true, issueCounts: { error: 1, warning: 2, info: 4 } }),
    );
    expect(verdict.tone).toBe("warning");
    expect(verdict.title).toBe("Check 1 error and 2 warnings before you publish");
  });

  it("says so when nothing would change", () => {
    const verdict = importVerdict(
      preview({ diff: { added: 0, updated: 0, unchanged: 365, changes: [], changesTruncated: false } }),
    );
    expect(verdict.title).toBe("Nothing would change");
    expect(verdict.detail).toContain("365 days unchanged");
  });

  it("explains why a file cannot be imported, in the importer's words", () => {
    const verdict = importVerdict(
      preview({
        canCommit: false,
        issues: [issue({ severity: "info" }), issue({ severity: "error", message: "No date column was found." })],
      }),
    );
    expect(verdict.tone).toBe("danger");
    expect(verdict.detail).toBe("No date column was found.");
  });

  it("has a fallback explanation", () => {
    expect(importVerdict(preview({ canCommit: false })).detail).toContain("Check the columns");
  });
});

describe("rows", () => {
  function row(status: ImportPreviewRow["status"], effect: ImportPreviewRow["effect"]): ImportPreviewRow {
    return { sheet: "t", rowNumber: 2, status, date: "2027-01-01", day: null, issues: [], effect };
  }

  it("labels what becomes of each row", () => {
    expect(rowOutcome(row("ok", "added"))).toEqual({ label: "New", tone: "accent" });
    expect(rowOutcome(row("ok", "updated"))).toEqual({ label: "Updated", tone: "info" });
    expect(rowOutcome(row("ok", "unchanged"))).toEqual({ label: "Unchanged", tone: "neutral" });
    expect(rowOutcome(row("error", null)).label).toBe("Left out");
    expect(rowOutcome(row("no-times", null)).label).toBe("No times");
    expect(rowOutcome(row("replaced", null)).label).toBe("Replaced");
    expect(rowOutcome(row("skipped", null)).label).toBe("Skipped");
  });

  it("filters rows by what becomes of them", () => {
    const rows = [row("ok", "added"), row("ok", "updated"), row("ok", "unchanged"), row("error", null), row("ok", "added")];
    expect(filterRows(rows, "all")).toHaveLength(5);
    expect(filterRows(rows, "added")).toHaveLength(2);
    expect(filterRows(rows, "updated")).toHaveLength(1);
    expect(filterRows(rows, "unchanged")).toHaveLength(1);
    expect(filterRows(rows, "left-out")).toHaveLength(1);
  });

  it("indexes changes by date and field", () => {
    const index = changesByDate([
      { date: "2027-01-01", fields: [{ field: "fajrJamaat", from: "06:45", to: "06:30" }] },
      { date: "2027-01-02", fields: [{ field: "note", from: null, to: "Eid" }] },
    ]);
    expect(index.get("2027-01-01")?.get("fajrJamaat")?.to).toBe("06:30");
    expect(index.get("2027-01-01")?.has("note")).toBe(false);
    expect(index.get("2027-01-03")).toBeUndefined();
  });
});

describe("paging", () => {
  const items = Array.from({ length: 45 }, (_, index) => index);

  it("counts pages, never fewer than one", () => {
    expect(pageCount(45, 20)).toBe(3);
    expect(pageCount(40, 20)).toBe(2);
    expect(pageCount(0, 20)).toBe(1);
  });

  it("slices a page and clamps one that is out of range", () => {
    expect(pageSlice(items, 1, 20)).toHaveLength(20);
    expect(pageSlice(items, 3, 20)).toEqual([40, 41, 42, 43, 44]);
    expect(pageSlice(items, 9, 20)).toEqual([40, 41, 42, 43, 44]);
    expect(pageSlice(items, 0, 20)[0]).toBe(0);
    expect(pageSlice([], 1, 20)).toEqual([]);
  });
});

describe("formatChangeValue", () => {
  it("writes times in the mosque's time format", () => {
    expect(formatChangeValue("fajrJamaat", "06:30", "24h")).toBe("06:30");
    expect(formatChangeValue("ishaJamaat", "19:45", "12h")).toBe("7:45 PM");
  });

  it("lists every Jumu'ah time", () => {
    expect(formatChangeValue("jumuah", "13:15, 14:00", "12h")).toBe("1:15 PM, 2:00 PM");
  });

  it("leaves a note alone, commas included", () => {
    expect(formatChangeValue("note", "Eid, in sha Allah", "12h")).toBe("Eid, in sha Allah");
  });

  it("says when there is nothing", () => {
    expect(formatChangeValue("sunrise", null, "24h")).toBe(EMPTY_CHANGE_VALUE);
    expect(formatChangeValue("note", "  ", "24h")).toBe(EMPTY_CHANGE_VALUE);
  });
});

describe("daysAffected", () => {
  it("adds the new days to the changed ones", () => {
    expect(daysAffected({ added: 31, updated: 4 })).toBe(35);
    expect(daysAffected({ added: 0, updated: 0 })).toBe(0);
  });
});
