import { Suspense } from "react";
import type { Metadata } from "next";
import { AnnouncementsManager } from "@/components/admin/announcements/announcements-manager";
import { AnnouncementsSkeleton } from "@/components/admin/announcements/announcements-skeleton";
import { AdminPageHeader } from "@/components/admin/shell/page-header";
import { loadMosqueToday, requireAdminRequest } from "@/lib/admin/request";
import { loadAdminAnnouncements } from "@/lib/server/data";

export const metadata: Metadata = { title: "Announcements" };

/**
 * Every stored announcement with today's date in the mosque's timezone, which
 * decides what is active. Request-time: rendered inside `<Suspense>`.
 */
async function AnnouncementsContent() {
  await requireAdminRequest();
  const [announcements, today] = await Promise.all([loadAdminAnnouncements(), loadMosqueToday()]);
  return <AnnouncementsManager announcements={announcements} today={today} />;
}

/** The announcements page, `/admin/announcements`. The title is static; the list streams in. */
export default function AnnouncementsPage() {
  return (
    <>
      <AdminPageHeader
        title="Announcements"
        description="Short notices for the website and the TV display. Each one can start and end on days you choose."
      />
      <Suspense fallback={<AnnouncementsSkeleton />}>
        <AnnouncementsContent />
      </Suspense>
    </>
  );
}
