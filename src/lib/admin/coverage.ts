/**
 * Reading the health of the stored timetable for the admin overview: how far
 * it reaches, whether it is about to run out, which days are missing, and
 * what a new installation still has to do.
 */

import { addDays, diffDays, monthOf } from "@/lib/time";
import type { DateString, TimetableCoverage } from "@/lib/types";
import { formatDateFull, formatDateRange, plural } from "./text";

/** The timetable is flagged when it ends within this many days. */
export const COVERAGE_WARNING_DAYS = 30;

/**
 * - `empty`: no day is stored at all.
 * - `expired`: the last stored day is in the past.
 * - `ending-soon`: it ends within {@link COVERAGE_WARNING_DAYS} days.
 * - `not-started`: every stored day is still in the future.
 * - `ok`: today is covered and the end is far enough away.
 */
export type CoverageLevel = "empty" | "expired" | "ending-soon" | "not-started" | "ok";

/** The verdict on the stored timetable, ready to show. */
export interface CoverageHealth {
  level: CoverageLevel;
  /** How loudly to say it. */
  tone: "success" | "warning" | "danger";
  /** One short sentence: the verdict. */
  headline: string;
  /** One or two sentences: what it means and what to do. */
  detail: string;
  /** Days of timetable after today; 0 when it ends today or is over, null when there is none. */
  daysRemaining: number | null;
}

/**
 * Judges the stored timetable against today's date in the mosque's timezone.
 * @param coverage First and last stored date.
 * @param today    Today on the mosque's wall clock.
 */
export function assessCoverage(coverage: TimetableCoverage, today: DateString): CoverageHealth {
  const { firstDate, lastDate } = coverage;
  if (firstDate === null || lastDate === null) {
    return {
      level: "empty",
      tone: "danger",
      headline: "There is no timetable yet",
      detail: "The website and the TV display have no prayer times to show. Import a timetable file to get started.",
      daysRemaining: null,
    };
  }

  const remaining = diffDays(today, lastDate);
  if (remaining < 0) {
    return {
      level: "expired",
      tone: "danger",
      headline: `The timetable ran out ${plural(-remaining, "day")} ago`,
      detail: `The last day with prayer times was ${formatDateFull(lastDate)}. The website and the TV display are showing no times. Import the new timetable now.`,
      daysRemaining: 0,
    };
  }
  if (remaining <= COVERAGE_WARNING_DAYS) {
    const when =
      remaining === 0 ? "today" : remaining === 1 ? "tomorrow" : `in ${plural(remaining, "day")}`;
    return {
      level: "ending-soon",
      tone: "warning",
      headline: `The timetable runs out ${when}`,
      detail: `Prayer times are stored up to ${formatDateFull(lastDate)}. Import the next timetable before then so the screens never go blank.`,
      daysRemaining: remaining,
    };
  }
  if (firstDate > today) {
    return {
      level: "not-started",
      tone: "warning",
      headline: "The timetable has not started yet",
      detail: `The first day with prayer times is ${formatDateFull(firstDate)}, so there is nothing to show today. Import a file that covers today as well.`,
      daysRemaining: remaining,
    };
  }
  return {
    level: "ok",
    tone: "success",
    headline: "The timetable is in order",
    detail: `Prayer times are stored for ${formatDateRange(firstDate, lastDate)}.`,
    daysRemaining: remaining,
  };
}

/** A stretch of consecutive dates. */
export interface DateRun {
  from: DateString;
  to: DateString;
  /** Number of days in the run, both ends included. */
  count: number;
}

/**
 * Groups dates into runs of consecutive days, so a missing fortnight reads
 * as one line instead of fourteen. The input need not be sorted and may
 * repeat dates.
 */
export function groupDateRuns(dates: readonly DateString[]): DateRun[] {
  const sorted = Array.from(new Set(dates)).sort();
  const runs: DateRun[] = [];
  for (const date of sorted) {
    const last = runs[runs.length - 1];
    if (last !== undefined && addDays(last.to, 1) === date) {
      last.to = date;
      last.count += 1;
    } else {
      runs.push({ from: date, to: date, count: 1 });
    }
  }
  return runs;
}

/**
 * The missing dates that are gaps in the timetable rather than the days after
 * its end: those are reported once, as "the timetable runs out", not day by day.
 */
export function gapsBeforeEnd(missingDates: readonly DateString[], coverage: TimetableCoverage): DateString[] {
  const { lastDate } = coverage;
  if (lastDate === null) return [];
  return missingDates.filter((date) => date <= lastDate);
}

/** The address of the timetable editor on the month of `date`, with that day's form open. */
export function editorHrefForDate(date: DateString): string {
  return `/admin/timetable?month=${monthOf(date)}&edit=${date}`;
}

/** Where a step of the setup checklist stands. */
export type SetupStepState = "done" | "next" | "later";

/** One step of the first-run checklist. */
export interface SetupStep {
  id: "details" | "timetable" | "tv";
  title: string;
  description: string;
  /** Where the step is carried out. */
  href: string;
  /** Label of the link to `href`. */
  action: string;
  state: SetupStepState;
  /** True when `href` should open in a new tab (the TV display). */
  external: boolean;
}

/** What the checklist is worked out from. */
export interface SetupFacts {
  /** Whether any setting has been saved yet. */
  settingsStored: boolean;
  /** Number of days in the stored timetable. */
  totalDays: number;
}

/**
 * The steps a new installation goes through, with their real state: saving
 * the mosque's details, importing a timetable, then opening the TV display.
 * The first step that is not done is `next`; the display step can never be
 * observed from here, so it stays `next` once the two before it are done.
 */
export function setupSteps({ settingsStored, totalDays }: SetupFacts): SetupStep[] {
  const detailsDone = settingsStored;
  const timetableDone = totalDays > 0;
  return [
    {
      id: "details",
      title: "Set your mosque's details",
      description: "The name, address and timezone shown on the website and the TV display.",
      href: "/admin/settings",
      action: detailsDone ? "Review settings" : "Open settings",
      state: detailsDone ? "done" : "next",
      external: false,
    },
    {
      id: "timetable",
      title: "Import the timetable",
      description: "Upload the year's prayer times from an Excel or CSV file and check them before they go live.",
      href: "/admin/import",
      action: timetableDone ? "Import another file" : "Import a timetable",
      state: timetableDone ? "done" : detailsDone ? "next" : "later",
      external: false,
    },
    {
      id: "tv",
      title: "Open the TV display",
      description: "Put the display address into the browser of each screen in the mosque.",
      href: "/tv",
      action: "Open the TV display",
      state: detailsDone && timetableDone ? "next" : "later",
      external: true,
    },
  ];
}

/** Whether the first-run checklist still has something to say. */
export function isSetupComplete(facts: SetupFacts): boolean {
  return facts.settingsStored && facts.totalDays > 0;
}
