import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { TimetableSkeleton } from "@/components/site/timetable/timetable-skeleton";
import { TimetableView } from "@/components/site/timetable/timetable-view";
import { loadMonth, loadSettings, type MonthTimetable } from "@/lib/server/data";
import { mosqueToday } from "@/lib/server/display";
import { timetableMetadata } from "@/lib/site/metadata";
import {
  formatHijriMonths,
  hijriMonthsSpanned,
  isMonthInRange,
  monthRows,
  navigableMonths,
  readMonthParam,
} from "@/lib/site/month";
import { configuredSiteUrl, displayHost } from "@/lib/site/site-url";
import { monthOf, type MonthString } from "@/lib/time";

/** What Next.js passes to the page: the query string, known only at request time. */
interface TimetablePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The current month on the mosque's wall clock. */
async function loadCurrentMonth(): Promise<MonthTimetable> {
  const settings = await loadSettings();
  await connection();
  const month = monthOf(mosqueToday(settings.timezone, Date.now()));
  const data = await loadMonth(month);
  if (data === null) throw new Error(`The current month "${month}" could not be loaded.`);
  return data;
}

/**
 * The month a request is answered with: the one asked for when it is a real
 * month the timetable can show (what it covers, a month either side, and
 * the current month); otherwise the current month in the mosque's timezone.
 * Shared by the page and its metadata, so each request reads it once.
 */
const loadRequestedMonth = cache(async (requested: MonthString | null): Promise<MonthTimetable> => {
  const data = requested === null ? null : await loadMonth(requested);
  if (data === null) return loadCurrentMonth();
  const currentMonth = monthOf(data.today);
  if (isMonthInRange(data.month, navigableMonths(data.coverage, currentMonth))) return data;
  return (await loadMonth(currentMonth)) ?? data;
});

/** Title and description name the month on show. */
export async function generateMetadata({ searchParams }: TimetablePageProps): Promise<Metadata> {
  const data = await loadRequestedMonth(readMonthParam((await searchParams).month));
  return timetableMetadata(data.settings, data.month);
}

/**
 * The month the query string asks for, prepared as plain data for the view.
 * Request-time: rendered inside `<Suspense>`.
 */
async function TimetableContent({ searchParams }: TimetablePageProps) {
  const { month, days, settings, today, coverage } = await loadRequestedMonth(readMonthParam((await searchParams).month));
  const site = configuredSiteUrl();
  return (
    <TimetableView
      month={month}
      currentMonth={monthOf(today)}
      rows={monthRows(month, days, settings, today)}
      hijriMonths={formatHijriMonths(hijriMonthsSpanned(month, settings.hijriAdjustment))}
      mosqueName={settings.mosqueName}
      timeFormat={settings.timeFormat}
      coverage={coverage}
      siteHost={site === null ? null : displayHost(site)}
    />
  );
}

/**
 * The monthly prayer timetable, `/timetable?month=YYYY-MM`. Without the
 * parameter, or with one that is not a month the timetable can show, it
 * opens on the current month. The page itself is a static shell; the month
 * streams in.
 */
export default function TimetablePage({ searchParams }: TimetablePageProps) {
  return (
    <Suspense fallback={<TimetableSkeleton />}>
      <TimetableContent searchParams={searchParams} />
    </Suspense>
  );
}
