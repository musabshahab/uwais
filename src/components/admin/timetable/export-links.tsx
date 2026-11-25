import { DownloadIcon } from "@/components/brand/icons";
import { buttonClasses } from "@/components/ui/button";
import { exportMonthHref, exportYearHref, type ExportFormat } from "@/lib/admin/month";
import { firstDayOfMonth, formatMonthYear, yearOf, type MonthString } from "@/lib/time";

const FORMATS: ReadonlyArray<{ format: ExportFormat; label: string }> = [
  { format: "xlsx", label: "Excel" },
  { format: "csv", label: "CSV" },
];

/** One pair of download links: the same days as Excel and as CSV. */
function DownloadPair({ title, href }: { title: string; href: (format: ExportFormat) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-base font-semibold text-fg">{title}</span>
      <span className="flex gap-2">
        {FORMATS.map(({ format, label }) => (
          // A plain link: the address answers with a file, not a page.
          <a key={format} href={href(format)} download className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <DownloadIcon />
            {label}
            <span className="sr-only"> file of {title}</span>
          </a>
        ))}
      </span>
    </div>
  );
}

/**
 * Downloads of the stored timetable for the month on show and for its year,
 * in the same layout the importer reads: a safe way to make corrections in a
 * spreadsheet and import them again.
 */
export function ExportLinks({ month }: { month: MonthString }) {
  const year = yearOf(firstDayOfMonth(month));
  return (
    <section aria-labelledby="export-title" className="mt-8 rounded-lg border border-line bg-surface px-5 py-5 sm:px-6">
      <h2 id="export-title" className="text-xl text-fg">
        Download the timetable
      </h2>
      <p className="mt-1 max-w-prose text-base text-fg-muted">
        The files have the same columns the importer reads, so you can correct them in a spreadsheet and import them
        again.
      </p>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:gap-10">
        <DownloadPair title={formatMonthYear(month)} href={(format) => exportMonthHref(format, month)} />
        <DownloadPair title={`All of ${year}`} href={(format) => exportYearHref(format, year)} />
      </div>
    </section>
  );
}
