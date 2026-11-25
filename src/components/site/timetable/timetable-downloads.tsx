import { DownloadIcon } from "@/components/brand/icons";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { downloadHref, type DownloadFormat, type DownloadPeriod } from "@/lib/site/month";
import { SiteLink } from "../site-link";

const FORMATS: readonly { format: DownloadFormat; name: string }[] = [
  { format: "csv", name: "CSV" },
  { format: "xlsx", name: "Excel" },
];

/** One period that can be downloaded, with the words that name it. */
export interface DownloadOption {
  /** `November 2026`, `All of 2026`. */
  label: string;
  period: DownloadPeriod;
}

/** Props of {@link TimetableDownloads}. */
export interface TimetableDownloadsProps {
  /** The periods on offer. Nothing is rendered when there are none. */
  options: readonly DownloadOption[];
  className?: string;
}

/**
 * Links that download the timetable as a spreadsheet: each period as CSV
 * and as Excel. They are ordinary links to `/api/timetable/export`, which
 * answers with a file. Not printed.
 */
export function TimetableDownloads({ options, className }: TimetableDownloadsProps) {
  if (options.length === 0) return null;
  return (
    <section aria-labelledby="timetable-downloads" className={cn("print:hidden", className)}>
      <h2 id="timetable-downloads" className="font-display text-xl font-semibold tracking-tight">
        Download
      </h2>
      <p className="mt-1 max-w-prose text-fg-muted">Keep a copy on your phone, or open it in a spreadsheet.</p>
      <ul className="mt-4 flex flex-col gap-3">
        {options.map((option) => (
          <li key={option.label} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="min-w-36 font-semibold">{option.label}</span>
            <span className="flex gap-2">
              {FORMATS.map(({ format, name }) => (
                <SiteLink
                  key={format}
                  href={downloadHref(option.period, format)}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  <DownloadIcon />
                  <span className="sr-only">{`${option.label} as `}</span>
                  {name}
                </SiteLink>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
