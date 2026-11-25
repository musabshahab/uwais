import { Suspense } from "react";
import type { Metadata } from "next";
import { AnnouncementsSummary } from "@/components/admin/overview/announcements-summary";
import { MissingDates } from "@/components/admin/overview/missing-dates";
import { OverviewSkeleton } from "@/components/admin/overview/overview-skeleton";
import { RecentImports } from "@/components/admin/overview/recent-imports";
import { SetupChecklist } from "@/components/admin/overview/setup-checklist";
import { TimetableHealth } from "@/components/admin/overview/timetable-health";
import { TodayTimes } from "@/components/admin/overview/today-times";
import { TvDisplayCard } from "@/components/admin/overview/tv-display-card";
import { AdminPageHeader } from "@/components/admin/shell/page-header";
import { announcementStatus, countActiveAnnouncements } from "@/lib/admin/announcements";
import { assessCoverage, gapsBeforeEnd, groupDateRuns, isSetupComplete, setupSteps } from "@/lib/admin/coverage";
import { hasAnyTime } from "@/lib/admin/month";
import { requireAdminRequest } from "@/lib/admin/request";
import { loadAdminOverview, loadTimetableRange } from "@/lib/server/data";
import { configuredSiteUrl } from "@/lib/site/site-url";
import { prayerRowsForDay } from "@/lib/time";

export const metadata: Metadata = { title: "Overview" };

/**
 * Everything on the overview that needs data. The session is checked before
 * anything is read, so nothing private is rendered for a signed-out visitor.
 * Request-time: rendered inside `<Suspense>`.
 */
async function OverviewContent() {
  await requireAdminRequest();
  const overview = await loadAdminOverview();
  const { settings, today, coverage, announcements } = overview;
  const { days } = await loadTimetableRange(today, today);
  const todayRow = days.find((day) => day.date === today) ?? null;

  const health = assessCoverage(coverage, today);
  const gaps = gapsBeforeEnd(overview.missingDates, coverage);
  const setup = { settingsStored: overview.settingsStored, totalDays: coverage.totalDays };
  const scheduled = announcements.filter((item) => announcementStatus(item, today) === "scheduled").length;

  // One column on a phone, in the order a volunteer needs: the verdict, then
  // today's times. On a wide screen the same pieces sit in two columns.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-1">
            <TimetableHealth
              health={health}
              coverage={coverage}
              today={today}
              gapDays={gaps.length}
              lookaheadDays={overview.lookaheadDays}
            />
          </div>
          {isSetupComplete(setup) ? null : (
            <div className="order-3">
              <SetupChecklist steps={setupSteps(setup)} />
            </div>
          )}
          {gaps.length > 0 ? (
            <div className="order-4">
              <MissingDates runs={groupDateRuns(gaps)} total={gaps.length} lookaheadDays={overview.lookaheadDays} />
            </div>
          ) : null}
          <div className="order-6">
            <RecentImports imports={overview.recentImports} timeZone={settings.timezone} timeFormat={settings.timeFormat} />
          </div>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-2">
            <TodayTimes
              today={today}
              rows={prayerRowsForDay(todayRow, settings, today)}
              stored={todayRow !== null && hasAnyTime(todayRow)}
              note={todayRow?.note ?? null}
              timeFormat={settings.timeFormat}
            />
          </div>
          <div className="order-5">
            <AnnouncementsSummary active={countActiveAnnouncements(announcements, today)} scheduled={scheduled} />
          </div>
        </div>
      </div>
      <TvDisplayCard siteOrigin={configuredSiteUrl()?.origin ?? null} />
    </div>
  );
}

/**
 * The admin overview, `/admin`: whether the timetable is in order, what
 * needs doing next, today's times and how to put the display on a screen.
 * The title is static; everything below it streams in.
 */
export default function OverviewPage() {
  return (
    <>
      <AdminPageHeader
        title="Overview"
        description="Check that the timetable is in order, see what visitors see today, and find everything else from here."
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </>
  );
}
