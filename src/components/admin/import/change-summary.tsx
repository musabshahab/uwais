"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";
import type { ImportDiffSummary } from "@/lib/actions/types";
import { formatChangeValue, mergeFieldLabel, pageSlice } from "@/lib/admin/import-wizard";
import { formatDateWithYear, plural } from "@/lib/admin/text";
import type { TimeFormat } from "@/lib/types";
import { Pager } from "./pager";
import { ReviewSection } from "./review-section";

/** Changed days shown per page. */
const CHANGES_PER_PAGE = 15;

/** Props of {@link ChangeSummary}. */
export interface ChangeSummaryProps {
  diff: ImportDiffSummary;
  timeFormat: TimeFormat;
}

/** One of the three headline numbers. */
function Tile({ value, label, hint, tone }: { value: number; label: string; hint: string; tone: "new" | "changed" | "same" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3.5",
        tone === "new" && value > 0 && "border-accent-line bg-accent-soft",
        tone === "changed" && value > 0 && "border-info-line bg-info-soft",
        (tone === "same" || value === 0) && "border-line bg-surface-raised",
      )}
    >
      <dt className="text-sm font-semibold text-fg">{label}</dt>
      <dd className="time-numerals mt-1 text-time-lg font-semibold text-fg">{value}</dd>
      <dd className="mt-1 text-sm text-fg-muted">{hint}</dd>
    </div>
  );
}

/**
 * What publishing would do to the stored timetable: how many days are new,
 * how many change and how many stay as they are, then every changing day
 * with each time as it is now and as it would become.
 */
export function ChangeSummary({ diff, timeFormat }: ChangeSummaryProps) {
  const [page, setPage] = useState(1);
  const changes = pageSlice(diff.changes, page, CHANGES_PER_PAGE);

  return (
    <ReviewSection
      id="changes-title"
      title="What will change"
      description="Compared with the timetable that is stored now. Nothing changes until you publish."
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        <Tile value={diff.added} label="New days" hint="Dates that have no times yet." tone="new" />
        <Tile value={diff.updated} label="Days that change" hint="Stored days that get different times." tone="changed" />
        <Tile value={diff.unchanged} label="Already the same" hint="Stored exactly as in the file." tone="same" />
      </dl>

      {diff.updated === 0 ? (
        <p className="mt-4 text-base text-fg-muted">
          {diff.added > 0
            ? "No stored day is altered: this file only adds days."
            : "No stored day is altered and no day is added."}
        </p>
      ) : (
        <div className="mt-5">
          <h3 className="text-base font-semibold text-fg">
            {plural(diff.updated, "stored day")} will change
          </h3>
          <p className="text-sm text-fg-muted">Each time is shown as it is now, then as it will be.</p>
          <ul className="mt-3 flex flex-col rounded-lg border border-line">
            {changes.map((change) => (
              <li key={change.date} className="flex flex-col gap-2 border-line px-4 py-3 not-last:border-b md:flex-row md:items-baseline md:gap-6">
                <p className="numerals w-40 shrink-0 text-base font-semibold text-fg">{formatDateWithYear(change.date)}</p>
                <ul className="flex flex-wrap gap-2">
                  {change.fields.map((field) => (
                    <li key={field.field} className="rounded-md border border-info-line bg-info-soft px-2.5 py-1 text-sm text-fg">
                      <span className="font-semibold">{mergeFieldLabel(field.field)}</span>{" "}
                      <del className="time-numerals text-fg-muted decoration-fg-muted">
                        <span className="sr-only">now </span>
                        {formatChangeValue(field.field, field.from, timeFormat)}
                      </del>
                      <span aria-hidden="true"> → </span>
                      <ins className="time-numerals font-semibold no-underline">
                        <span className="sr-only">becomes </span>
                        {formatChangeValue(field.field, field.to, timeFormat)}
                      </ins>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <Pager noun="changed days" page={page} total={diff.changes.length} pageSize={CHANGES_PER_PAGE} onPage={setPage} />
          {diff.changesTruncated ? (
            <p className="mt-2 text-sm text-fg-muted">
              Only the first {diff.changes.length} of {diff.updated} changing days are listed here. All of them will be
              updated.
            </p>
          ) : null}
        </div>
      )}
    </ReviewSection>
  );
}
