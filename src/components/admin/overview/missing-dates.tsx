import Link from "next/link";
import { ChevronRightIcon } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { editorHrefForDate, type DateRun } from "@/lib/admin/coverage";
import { formatDateWithYear, plural } from "@/lib/admin/text";

/** Props of {@link MissingDates}. */
export interface MissingDatesProps {
  /** The missing days, grouped into stretches of consecutive dates. */
  runs: readonly DateRun[];
  /** Total number of missing days across the runs. */
  total: number;
  /** Length of the period that was checked, in days. */
  lookaheadDays: number;
}

/**
 * The days in the coming weeks that have no prayer times, each stretch
 * linking to the editor on its first day.
 */
export function MissingDates({ runs, total, lookaheadDays }: MissingDatesProps) {
  return (
    <Card as="section" aria-labelledby="missing-title" className="border-warning-line">
      <CardHeader>
        <div>
          <CardTitle id="missing-title">Days without prayer times</CardTitle>
          <CardDescription>
            {plural(total, "day")} in the next {lookaheadDays} days {total === 1 ? "is" : "are"} missing from the
            timetable. Add them by hand, or import a file that includes them.
          </CardDescription>
        </div>
        <Badge tone="warning">{total} missing</Badge>
      </CardHeader>
      <CardBody className="pt-3">
        <ul className="flex flex-col">
          {runs.map((run) => (
            <li key={run.from} className="border-line not-last:border-b">
              <Link
                href={editorHrefForDate(run.from)}
                className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-md px-2 text-base text-fg transition-colors duration-fast hover:bg-surface-sunken"
              >
                <span className="font-semibold">
                  {run.count === 1
                    ? formatDateWithYear(run.from)
                    : `${formatDateWithYear(run.from)} to ${formatDateWithYear(run.to)}`}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm text-fg-muted">
                  {run.count === 1 ? "Add times" : `${run.count} days`}
                  <ChevronRightIcon />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
