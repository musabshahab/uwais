import Link from "next/link";
import { CalendarIcon, CheckIcon, ExternalLinkIcon, UploadIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import type { ImportCommitData } from "@/lib/actions/types";
import { timetableHref } from "@/lib/admin/month";
import { formatDateRange, plural } from "@/lib/admin/text";
import { TV_PATH } from "@/lib/admin/tv-url";
import { monthOf } from "@/lib/time";
import { ArrivalHeading } from "../arrival-heading";
import { TEXT_LINK } from "../shell/styles";

/** Props of {@link DoneStep}. */
export interface DoneStepProps {
  result: ImportCommitData;
  /** Starts the wizard again for another file. */
  onAnother: () => void;
}

/** One of the numbers of a finished import. */
function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-4 py-3.5 text-center">
      <dd className="time-numerals text-time-lg font-semibold text-fg">{value}</dd>
      <dt className="mt-1 text-sm text-fg-muted">{label}</dt>
    </div>
  );
}

/**
 * The confirmation after publishing: what was saved, for which dates, and
 * where to go next.
 */
export function DoneStep({ result, onAnother }: DoneStepProps) {
  return (
    <section aria-labelledby="done-title" className="mx-auto max-w-3xl rounded-xl border border-success-line bg-surface px-5 py-8 text-center shadow-sm sm:px-10">
      <span aria-hidden="true" className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-success-soft text-success-fg">
        <CheckIcon size={28} />
      </span>
      <ArrivalHeading id="done-title" className="text-3xl text-fg">
        {result.added + result.updated === 0 ? "The timetable was already up to date" : "The timetable is published"}
      </ArrivalHeading>
      <p className="mx-auto mt-2 max-w-prose text-base text-fg-muted">
        <span className="font-semibold break-all text-fg">{result.fileName}</span> was imported for{" "}
        {formatDateRange(result.firstDate, result.lastDate)}.{" "}
        {result.added + result.updated === 0
          ? "Every day was already stored like this, so nothing changed."
          : "The website and the TV display are already showing the new times."}
      </p>
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <Count value={result.added} label={result.added === 1 ? "day added" : "days added"} />
        <Count value={result.updated} label={result.updated === 1 ? "day changed" : "days changed"} />
        <Count value={result.unchanged} label={result.unchanged === 1 ? "day already the same" : "days already the same"} />
      </dl>
      {result.warnings > 0 ? (
        <p className="mt-4 text-sm text-fg-muted">
          The file had {plural(result.warnings, "warning")}, which you confirmed before publishing.
        </p>
      ) : null}
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button href={timetableHref(monthOf(result.firstDate))} iconStart={<CalendarIcon />}>
          Check the timetable
        </Button>
        <Button href={TV_PATH} target="_blank" rel="noopener" variant="secondary" iconStart={<ExternalLinkIcon />}>
          Open the TV display
          <span className="sr-only"> (opens in a new tab)</span>
        </Button>
        <Button variant="secondary" iconStart={<UploadIcon />} onClick={onAnother}>
          Import another file
        </Button>
      </div>
      <p className="mt-5 text-base">
        <Link href="/admin" className={TEXT_LINK}>
          Back to the overview
        </Link>
      </p>
    </section>
  );
}
