import { describe, expect, it } from "vitest";
import {
  COVERAGE_WARNING_DAYS,
  assessCoverage,
  editorHrefForDate,
  gapsBeforeEnd,
  groupDateRuns,
  isSetupComplete,
  setupSteps,
} from "./coverage";

const TODAY = "2026-11-25";

function coverage(firstDate: string | null, lastDate: string | null, totalDays = 365) {
  return { firstDate, lastDate, totalDays };
}

describe("assessCoverage", () => {
  it("reports an empty timetable as the most urgent state", () => {
    const health = assessCoverage(coverage(null, null, 0), TODAY);
    expect(health.level).toBe("empty");
    expect(health.tone).toBe("danger");
    expect(health.daysRemaining).toBeNull();
  });

  it("reports a timetable that has run out, with how long ago", () => {
    const health = assessCoverage(coverage("2025-01-01", "2026-11-22"), TODAY);
    expect(health.level).toBe("expired");
    expect(health.tone).toBe("danger");
    expect(health.headline).toBe("The timetable ran out 3 days ago");
    expect(health.detail).toContain("22 November 2026");
    expect(health.daysRemaining).toBe(0);
  });

  it("says 1 day, not 1 days", () => {
    expect(assessCoverage(coverage("2025-01-01", "2026-11-24"), TODAY).headline).toBe(
      "The timetable ran out 1 day ago",
    );
  });

  it("warns on the last day and the day before", () => {
    expect(assessCoverage(coverage("2026-01-01", TODAY), TODAY).headline).toBe("The timetable runs out today");
    expect(assessCoverage(coverage("2026-01-01", "2026-11-26"), TODAY).headline).toBe(
      "The timetable runs out tomorrow",
    );
  });

  it("warns up to and including the threshold, and not a day beyond", () => {
    const atThreshold = assessCoverage(coverage("2026-01-01", "2026-12-25"), TODAY);
    expect(atThreshold.daysRemaining).toBe(COVERAGE_WARNING_DAYS);
    expect(atThreshold.level).toBe("ending-soon");
    expect(atThreshold.headline).toBe("The timetable runs out in 30 days");

    const beyond = assessCoverage(coverage("2026-01-01", "2026-12-26"), TODAY);
    expect(beyond.level).toBe("ok");
    expect(beyond.tone).toBe("success");
    expect(beyond.daysRemaining).toBe(31);
  });

  it("notices a timetable that only starts in the future", () => {
    const health = assessCoverage(coverage("2027-01-01", "2027-12-31"), TODAY);
    expect(health.level).toBe("not-started");
    expect(health.tone).toBe("warning");
    expect(health.detail).toContain("1 January 2027");
  });

  it("describes a healthy timetable with its range", () => {
    const health = assessCoverage(coverage("2026-01-01", "2027-12-31", 730), TODAY);
    expect(health.level).toBe("ok");
    expect(health.detail).toBe("Prayer times are stored for 1 January 2026 to 31 December 2027.");
  });
});

describe("groupDateRuns", () => {
  it("returns nothing for no dates", () => {
    expect(groupDateRuns([])).toEqual([]);
  });

  it("joins consecutive days, across month and year ends", () => {
    expect(groupDateRuns(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-05"])).toEqual([
      { from: "2026-12-30", to: "2027-01-01", count: 3 },
      { from: "2027-01-05", to: "2027-01-05", count: 1 },
    ]);
  });

  it("sorts and de-duplicates its input", () => {
    expect(groupDateRuns(["2027-02-03", "2027-02-01", "2027-02-02", "2027-02-02"])).toEqual([
      { from: "2027-02-01", to: "2027-02-03", count: 3 },
    ]);
  });
});

describe("gapsBeforeEnd", () => {
  it("keeps the gaps and drops the days after the timetable ends", () => {
    const missing = ["2026-11-28", "2026-12-30", "2027-01-01", "2027-01-02"];
    expect(gapsBeforeEnd(missing, coverage("2026-01-01", "2026-12-31"))).toEqual(["2026-11-28", "2026-12-30"]);
  });

  it("counts days before a timetable that has not started", () => {
    expect(gapsBeforeEnd(["2026-11-25", "2026-11-26"], coverage("2027-01-01", "2027-12-31"))).toEqual([
      "2026-11-25",
      "2026-11-26",
    ]);
  });

  it("has nothing to say about an empty timetable", () => {
    expect(gapsBeforeEnd(["2026-11-25"], coverage(null, null, 0))).toEqual([]);
  });
});

describe("editorHrefForDate", () => {
  it("opens the editor on the month of the date with that day's form", () => {
    expect(editorHrefForDate("2027-03-09")).toBe("/admin/timetable?month=2027-03&edit=2027-03-09");
  });
});

describe("setupSteps", () => {
  const states = (settingsStored: boolean, totalDays: number) =>
    setupSteps({ settingsStored, totalDays }).map((step) => step.state);

  it("starts a brand-new install on the mosque details", () => {
    expect(states(false, 0)).toEqual(["next", "later", "later"]);
    expect(isSetupComplete({ settingsStored: false, totalDays: 0 })).toBe(false);
  });

  it("moves on to the import once the details are saved", () => {
    expect(states(true, 0)).toEqual(["done", "next", "later"]);
  });

  it("still asks for the details when the timetable came first", () => {
    expect(states(false, 365)).toEqual(["next", "done", "later"]);
    expect(isSetupComplete({ settingsStored: false, totalDays: 365 })).toBe(false);
  });

  it("offers the TV display when both are done", () => {
    const steps = setupSteps({ settingsStored: true, totalDays: 365 });
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "next"]);
    expect(steps[2].external).toBe(true);
    expect(isSetupComplete({ settingsStored: true, totalDays: 365 })).toBe(true);
  });
});
