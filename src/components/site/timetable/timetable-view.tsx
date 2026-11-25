"use client";

import { CalendarIcon } from "@/components/brand/icons";
import { LogoMark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { coverageTouchesYear, navigableMonths, timetableHref, type MonthDayRow } from "@/lib/site/month";
import { firstDayOfMonth, formatDateLong, formatMonthYear, monthOf, parseDateParts, type MonthString } from "@/lib/time";
import type { TimeFormat, TimetableCoverage } from "@/lib/types";
import { noScriptReveal } from "../no-script";
import { SiteLink } from "../site-link";
import { MonthNav } from "./month-nav";
import { MonthTable, MonthTableLegend, TODAY_ROW_ID } from "./month-table";
import { PrintButton } from "./print-button";
import { TimetableDownloads, type DownloadOption } from "./timetable-downloads";
import {
  TIMETABLE_FRAME,
  TIMETABLE_HEADING,
  TIMETABLE_NAV,
  TIMETABLE_OVERLINE,
  TIMETABLE_SUBHEADING,
  TIMETABLE_TABLE,
} from "./timetable-layout";

/** Shown in place of the table when the month has no times at all. */
function EmptyMonth({ month, currentMonth, coverage }: { month: MonthString; currentMonth: MonthString; coverage: TimetableCoverage }) {
  const link = buttonClasses({ variant: "secondary" });
  if (coverage.firstDate === null || coverage.lastDate === null) {
    return (
      <EmptyState
        icon={<CalendarIcon />}
        title="Prayer times have not been published yet"
        description="When the mosque adds its timetable, every month will appear here."
        actions={
          <SiteLink href="/admin" className={link}>
            Staff: add the timetable
          </SiteLink>
        }
      />
    );
  }
  const firstMonth = monthOf(coverage.firstDate);
  const lastMonth = monthOf(coverage.lastDate);
  const nearest = month < firstMonth ? firstMonth : month > lastMonth ? lastMonth : currentMonth;
  return (
    <EmptyState
      icon={<CalendarIcon />}
      title={`No prayer times for ${formatMonthYear(month)}`}
      description={`The timetable runs from ${formatDateLong(coverage.firstDate)} to ${formatDateLong(coverage.lastDate)}.`}
      actions={
        nearest === month ? null : (
          <SiteLink href={timetableHref(nearest)} className={link}>
            {`Go to ${formatMonthYear(nearest)}`}
          </SiteLink>
        )
      }
    />
  );
}

/** Props of {@link TimetableView}: one month, as plain data prepared on the server. */
export interface TimetableViewProps {
  /** The month on show. */
  month: MonthString;
  /** The current month on the mosque's wall clock. */
  currentMonth: MonthString;
  /** One row per day of the month, from `monthRows`. */
  rows: readonly MonthDayRow[];
  /** The Hijri months the month spans, from `formatHijriMonths`. */
  hijriMonths: string;
  mosqueName: string;
  /** 12-hour or 24-hour display (`settings.timeFormat`). */
  timeFormat: TimeFormat;
  /** Extent of the whole timetable: decides which months and downloads are offered. */
  coverage: TimetableCoverage;
  /** The site's host name for the printed sheet, or null when the deployment has no address set. */
  siteHost: string | null;
}

/**
 * The monthly timetable page below the site header: the month and the Hijri
 * months it spans, the month navigation, the table (or a message when the
 * month has no times), a legend and the downloads.
 *
 * On paper the site chrome, the navigation and the downloads are left out
 * and a compact heading with the mosque's name takes their place; the sheet
 * is A4 landscape and holds the whole month.
 *
 * It is a Client Component on purpose, although nothing in it changes after
 * the first render. React streams a large tree of Server Component elements
 * in pieces (a month of rows arrives as some thirty of them) which only a
 * script can put together. Handed to a Client Component as plain data, the
 * month is rendered on the server in one piece, so the page is complete in
 * the HTML and readable without JavaScript. Everything that could differ
 * between the server and a browser (the Hijri months, the site's address)
 * is worked out on the server and passed in.
 */
export function TimetableView({ month, currentMonth, rows, hijriMonths, mosqueName, timeFormat, coverage, siteHost }: TimetableViewProps) {
  const monthName = formatMonthYear(month);
  const hasTimes = rows.some((row) => row.hasTimes);
  const year = parseDateParts(firstDayOfMonth(month)).year;

  const downloads: DownloadOption[] = [];
  if (hasTimes) downloads.push({ label: monthName, period: { month } });
  if (coverageTouchesYear(coverage, year)) downloads.push({ label: `All of ${year}`, period: { year } });

  return (
    <div {...noScriptReveal("main")} className={TIMETABLE_FRAME}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 print:hidden">
        <div className="min-w-0">
          <h1 className={TIMETABLE_HEADING}>
            <span className={TIMETABLE_OVERLINE}>Prayer timetable</span> {monthName}
          </h1>
          <p className={TIMETABLE_SUBHEADING}>{hijriMonths}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasTimes && month === currentMonth ? (
            <a href={`#${TODAY_ROW_ID}`} className={buttonClasses({ variant: "ghost" })}>
              Jump to today
            </a>
          ) : null}
          {hasTimes ? <PrintButton /> : null}
        </div>
      </header>

      <div className="hidden items-end justify-between gap-6 border-b border-line-strong pb-[4pt] print:flex">
        <p className="flex items-center gap-[6pt] font-display text-[16pt] leading-none font-semibold">
          <LogoMark size={26} />
          {mosqueName}
        </p>
        <div className="text-right leading-tight">
          <p className="font-display text-[13pt] font-semibold">{`Prayer timetable for ${monthName}`}</p>
          <p className="text-[9pt]">{hijriMonths}</p>
        </div>
      </div>

      <MonthNav month={month} range={navigableMonths(coverage, currentMonth)} className={TIMETABLE_NAV} />

      {hasTimes ? (
        <>
          <MonthTable rows={rows} format={timeFormat} label={`Prayer timetable for ${monthName}`} className={`${TIMETABLE_TABLE} print:mt-[3pt]`} />
          <div className="mt-3 flex items-start justify-between gap-6 print:mt-[3pt]">
            <MonthTableLegend />
            {siteHost !== null ? <p className="hidden text-[8.5pt] print:block">{siteHost}</p> : null}
          </div>
        </>
      ) : (
        <Card className={TIMETABLE_TABLE}>
          <EmptyMonth month={month} currentMonth={currentMonth} coverage={coverage} />
        </Card>
      )}

      <TimetableDownloads options={downloads} className="mt-10 sm:mt-12" />
    </div>
  );
}
