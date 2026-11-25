import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings/settings-form";
import { SettingsSkeleton } from "@/components/admin/settings/settings-skeleton";
import { AdminPageHeader } from "@/components/admin/shell/page-header";
import { loadMosqueToday, requireAdminRequest } from "@/lib/admin/request";
import { hijriPreviews } from "@/lib/admin/settings-form";
import { withSelectedZone } from "@/lib/admin/time-zones";
import { loadSettings } from "@/lib/server/data";
import { formatDateLong, listTimeZones } from "@/lib/time";

export const metadata: Metadata = { title: "Settings" };

/**
 * The form with the stored settings in it. The list of timezones and the
 * Hijri previews are worked out here, on the server, because both depend on
 * the runtime's calendar data. Request-time: rendered inside `<Suspense>`.
 */
async function SettingsContent() {
  await requireAdminRequest();
  const [settings, today] = await Promise.all([loadSettings(), loadMosqueToday()]);
  return (
    <SettingsForm
      settings={settings}
      timeZones={withSelectedZone(listTimeZones(), settings.timezone)}
      hijriPreviews={hijriPreviews(today)}
      todayLabel={formatDateLong(today)}
    />
  );
}

/** The settings page, `/admin/settings`. The title is static; the form streams in. */
export default function SettingsPage() {
  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="The mosque's details, the clock and calendar, the usual Jumu'ah times and the look of the TV display."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
