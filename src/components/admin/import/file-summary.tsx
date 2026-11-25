import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ImportPreviewData } from "@/lib/actions/types";
import { describeProvided, describeSheets } from "@/lib/admin/import-wizard";
import { formatBytes, formatDateRange, formatList, plural } from "@/lib/admin/text";
import { ArrivalHeading } from "../arrival-heading";

const FORMAT_NAMES: Record<ImportPreviewData["file"]["format"], string> = { csv: "CSV", xlsx: "Excel" };

/** Props of {@link FileSummary}. */
export interface FileSummaryProps {
  preview: ImportPreviewData;
  /** Goes back to step one. */
  onChooseAnother: () => void;
  /** True while something is in flight and the file must not be swapped. */
  busy: boolean;
}

/** One thing the importer worked out about the file. */
function Understood({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold break-words text-fg">{children}</dd>
    </div>
  );
}

/**
 * The file that is being reviewed and what was understood from it: how many
 * sheets, which dates, how many days, and which parts of a day it holds.
 * A file with only some of the times says plainly what is left untouched.
 */
export function FileSummary({ preview, onChooseAnother, busy }: FileSummaryProps) {
  const { file, summary, sheets, mappedFields } = preview;
  const provided = describeProvided(mappedFields);
  const partial = preview.canCommit && provided.kept.length > 0;

  return (
    <section aria-labelledby="file-summary-title" className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg-muted">The file you chose</p>
          <ArrivalHeading id="file-summary-title" className="text-xl break-all text-fg">
            {file.name}
          </ArrivalHeading>
          <p className="numerals mt-0.5 text-sm text-fg-muted">
            {FORMAT_NAMES[file.format]} file, {formatBytes(file.size)}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onChooseAnother} disabled={busy}>
          Choose a different file
        </Button>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
          <Understood label="Sheets">{describeSheets(sheets)}</Understood>
          <Understood label="Dates">
            {summary.firstDate !== null && summary.lastDate !== null
              ? formatDateRange(summary.firstDate, summary.lastDate)
              : "No dates were found"}
          </Understood>
          <Understood label="Days that can be imported">
            <span className="numerals">{summary.validDays}</span>
            {summary.missingDates.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-fg-muted">
                ({plural(summary.missingDates.length, "date")} in between {summary.missingDates.length === 1 ? "is" : "are"} not in the file)
              </span>
            ) : null}
          </Understood>
        </dl>
        {preview.canCommit ? (
          <p className="text-base text-fg">
            <span className="text-fg-muted">It provides </span>
            {provided.provided}.
          </p>
        ) : null}
        {partial ? (
          <Alert tone="info" title="Only part of each day is in this file">
            It has no {formatList(provided.kept, "or")}. For days that are already stored, those keep the values they have
            now; for new days they stay empty.
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
