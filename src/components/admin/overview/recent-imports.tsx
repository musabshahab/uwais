import { UploadIcon } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange, formatTimestamp, plural } from "@/lib/admin/text";
import type { ImportLogEntry } from "@/lib/db";
import type { TimeFormat } from "@/lib/types";

/** Props of {@link RecentImports}. */
export interface RecentImportsProps {
  /** The latest imports, newest first. */
  imports: readonly ImportLogEntry[];
  /** The mosque's timezone: the times are shown on its clock, not the viewer's. */
  timeZone: string;
  timeFormat: TimeFormat;
  /** Most entries to list. */
  limit?: number;
}

/** What one import did, as a row of small counts. */
function ImportCounts({ entry }: { entry: ImportLogEntry }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge tone={entry.added > 0 ? "success" : "neutral"}>{entry.added} added</Badge>
      <Badge tone={entry.updated > 0 ? "info" : "neutral"}>{entry.updated} updated</Badge>
      <Badge>{entry.unchanged} unchanged</Badge>
      {entry.warnings > 0 ? <Badge tone="warning">{plural(entry.warnings, "warning")}</Badge> : null}
    </span>
  );
}

/** The history of timetable imports: when, which file, and what each one changed. */
export function RecentImports({ imports, timeZone, timeFormat, limit = 5 }: RecentImportsProps) {
  const shown = imports.slice(0, limit);
  return (
    <Card as="section" aria-labelledby="imports-title">
      <CardHeader>
        <div>
          <CardTitle id="imports-title">Recent imports</CardTitle>
          <CardDescription>
            {shown.length === 0 ? "Nothing has been imported yet." : "The latest timetable files that were published."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody className="pt-3">
        {shown.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base text-fg-muted">
              When you import a timetable file, it is listed here with the number of days it added and changed.
            </p>
            <Button href="/admin/import" variant="secondary" size="sm" iconStart={<UploadIcon />}>
              Import a timetable
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {shown.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 border-line py-3.5 not-last:border-b first:pt-1 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <p className="min-w-0 text-base font-semibold break-words text-fg">{entry.fileName}</p>
                  <p className="numerals shrink-0 text-sm text-fg-muted">
                    {formatTimestamp(entry.createdAt, timeZone, timeFormat)}
                  </p>
                </div>
                {entry.firstDate !== null && entry.lastDate !== null ? (
                  <p className="text-sm text-fg-muted">{formatDateRange(entry.firstDate, entry.lastDate)}</p>
                ) : null}
                <ImportCounts entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
