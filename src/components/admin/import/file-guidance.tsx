import { CheckIcon, DownloadIcon } from "@/components/brand/icons";
import { buttonClasses } from "@/components/ui/button";
import { exportYearHref } from "@/lib/admin/month";

const EXPECTATIONS = [
  "One row for each day, with a column for the date.",
  "A column for each time: when each prayer begins and when its jamaat is. Sunrise too, if you have it.",
  "Headings in the first row, such as Date, Fajr Begins and Fajr Jamaat. Other spellings are understood.",
  "Jumu'ah times and a note for the day are optional.",
  "A whole year on one sheet, or one sheet for each month. Both work.",
];

const DOWNLOAD_LINK = buttonClasses({ variant: "secondary", size: "sm" });

/**
 * What a timetable file should look like, with a template to start from and
 * the stored timetable to download and correct.
 */
export function FileGuidance({ years }: { years: readonly number[] }) {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="file-contents-title" className="rounded-lg border border-line bg-surface px-5 py-5 sm:px-6">
        <h2 id="file-contents-title" className="text-xl text-fg">
          What your file should contain
        </h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {EXPECTATIONS.map((item) => (
            <li key={item} className="flex gap-2.5 text-base text-fg">
              <CheckIcon className="mt-1 shrink-0 text-success-fg" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-md bg-surface-sunken px-3.5 py-3 text-sm text-fg">
          A file with only some of the columns is fine. If yours has just the jamaat times, the begins times that are
          already stored stay as they are.
        </p>
      </section>

      <section aria-labelledby="file-start-title" className="rounded-lg border border-line bg-surface px-5 py-5 sm:px-6">
        <h2 id="file-start-title" className="text-xl text-fg">
          Not sure where to start?
        </h2>
        <p className="mt-1 text-base text-fg-muted">Fill in the template, then come back and upload it.</p>
        <p className="mt-3 flex flex-wrap gap-2">
          <a href="/templates/timetable-template.xlsx" download className={DOWNLOAD_LINK}>
            <DownloadIcon />
            Excel template
          </a>
          <a href="/templates/timetable-template.csv" download className={DOWNLOAD_LINK}>
            <DownloadIcon />
            CSV template
          </a>
        </p>
        {years.length > 0 ? (
          <>
            <p className="mt-5 text-base text-fg-muted">
              Or download the timetable that is stored now, correct it in a spreadsheet and upload it again.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {years.map((year) => (
                <li key={year} className="flex flex-wrap items-center gap-2">
                  <span className="numerals w-12 text-base font-semibold text-fg">{year}</span>
                  <a href={exportYearHref("xlsx", year)} download className={DOWNLOAD_LINK}>
                    <DownloadIcon />
                    Excel<span className="sr-only"> file of {year}</span>
                  </a>
                  <a href={exportYearHref("csv", year)} download className={DOWNLOAD_LINK}>
                    <DownloadIcon />
                    CSV<span className="sr-only"> file of {year}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
