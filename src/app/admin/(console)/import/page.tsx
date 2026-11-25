import { Suspense } from "react";
import type { Metadata } from "next";
import { ImportSkeleton } from "@/components/admin/import/import-skeleton";
import { ImportWizard } from "@/components/admin/import/import-wizard";
import { AdminPageHeader } from "@/components/admin/shell/page-header";
import { coveredYears } from "@/lib/admin/month";
import { requireAdminRequest } from "@/lib/admin/request";
import { IMPORT_LIMITS } from "@/lib/import/errors";
import { loadAdminOverview } from "@/lib/server/data";

export const metadata: Metadata = { title: "Import timetable" };

/**
 * The wizard with what it needs from the server: the size limit (the client
 * may not load the importer itself), the time format and the years that are
 * stored. Request-time: rendered inside `<Suspense>`.
 */
async function ImportContent() {
  await requireAdminRequest();
  const { settings, coverage } = await loadAdminOverview();
  return (
    <ImportWizard
      maxFileBytes={IMPORT_LIMITS.maxFileBytes}
      timeFormat={settings.timeFormat}
      years={coveredYears(coverage)}
    />
  );
}

/** The import page, `/admin/import`. The title is static; the wizard streams in. */
export default function ImportPage() {
  return (
    <>
      <AdminPageHeader
        title="Import timetable"
        description="Upload the year's prayer times from a spreadsheet, see exactly what would change, then publish."
      />
      <Suspense fallback={<ImportSkeleton />}>
        <ImportContent />
      </Suspense>
    </>
  );
}
