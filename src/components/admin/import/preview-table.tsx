"use client";

import { useState } from "react";
import { TimeText } from "@/components/display";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import type { ImportPreviewData, ImportPreviewRow } from "@/lib/actions/types";
import { DAY_TIME_GROUPS } from "@/lib/admin/day-form";
import {
  changesByDate,
  filterRows,
  formatChangeValue,
  pageSlice,
  rowOutcome,
  type RowFilter,
} from "@/lib/admin/import-wizard";
import { formatDateWithYear } from "@/lib/admin/text";
import type { FieldChange, MergeField } from "@/lib/import/types";
import { formatTimeText } from "@/lib/time";
import type { TimeFormat } from "@/lib/types";
import { Pager } from "./pager";
import { ReviewSection } from "./review-section";

/** Rows shown per page: about a month. */
const ROWS_PER_PAGE = 31;

const FILTERS: ReadonlyArray<{ value: RowFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "added", label: "New" },
  { value: "updated", label: "Updated" },
  { value: "unchanged", label: "Unchanged" },
  { value: "left-out", label: "Left out" },
];

/** Why a row that is not imported was left out, when it has no message of its own. */
const LEFT_OUT_REASONS: Partial<Record<ImportPreviewRow["status"], string>> = {
  error: "This row has an error and is left out.",
  "no-times": "No times on this row. The times stored for this date are kept.",
  replaced: "A later row has the same date and is used instead.",
  skipped: "Not a timetable row.",
};

/** Props of {@link PreviewTable}. */
export interface PreviewTableProps {
  preview: ImportPreviewData;
  timeFormat: TimeFormat;
}

/** A cell that will replace a stored value says what the stored value is. */
function changeTitle(change: FieldChange | undefined, timeFormat: TimeFormat): string | undefined {
  return change === undefined ? undefined : `Stored now: ${formatChangeValue(change.field, change.from, timeFormat)}`;
}

/**
 * The days read from the file, row by row, as they would be stored. New
 * days are marked, and in days that change the cells that differ from what
 * is stored are highlighted. Columns the file does not have are not shown.
 */
export function PreviewTable({ preview, timeFormat }: PreviewTableProps) {
  const [filter, setFilter] = useState<RowFilter>("all");
  const [page, setPage] = useState(1);

  const provided = new Set<MergeField>(preview.mappedFields);
  // Each time column with the name of its prayer, shown once above the first column of the prayer that is present.
  const columns = DAY_TIME_GROUPS.flatMap((group) => {
    const present = group.columns.filter((column) => provided.has(column.field));
    return present.map((column, index) => ({ ...column, heading: index === 0 ? group.name : null, single: group.columns.length === 1 }));
  });
  const changes = changesByDate(preview.diff.changes);
  const several = preview.sheets.filter((sheet) => sheet.status === "imported").length > 1;

  const options: Array<SegmentedOption<RowFilter>> = FILTERS.map((item) => ({
    value: item.value,
    label: `${item.label} (${filterRows(preview.rows, item.value).length})`,
  })).filter((item, index) => index === 0 || !item.label.endsWith("(0)"));
  const active: RowFilter = options.some((item) => item.value === filter) ? filter : "all";
  const rows = filterRows(preview.rows, active);
  const visible = pageSlice(rows, page, ROWS_PER_PAGE);
  const span = columns.length + (provided.has("jumuah") ? 1 : 0) + (provided.has("note") ? 1 : 0);

  return (
    <ReviewSection
      id="rows-title"
      title="The days in this file"
      description="Each row as it would be stored. Highlighted cells differ from what is stored now."
      aside={
        options.length > 2 ? (
          <SegmentedControl
            name="row-filter"
            label="Show"
            options={options}
            value={active}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
          />
        ) : null
      }
    >
      <Table label="The days read from the file" dense stickyFirstColumn>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="align-top text-fg">Date</TableHeaderCell>
            <TableHeaderCell className="align-top text-fg">Result</TableHeaderCell>
            {columns.map((column) => (
              <TableHeaderCell
                key={column.field}
                aria-label={column.fullLabel}
                className={cn("align-top", column.heading !== null && "border-l border-line")}
              >
                <span className="block text-fg">{column.heading ?? "\u00a0"}</span>
                <span className="block text-xs font-normal">{column.single ? "\u00a0" : column.label}</span>
              </TableHeaderCell>
            ))}
            {provided.has("jumuah") ? (
              <TableHeaderCell className="border-l border-line align-top text-fg">Jumu&apos;ah</TableHeaderCell>
            ) : null}
            {provided.has("note") ? <TableHeaderCell className="align-top text-fg">Note</TableHeaderCell> : null}
            <TableHeaderCell numeric className="align-top">
              {several ? "Sheet and row" : "Row"}
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visible.map((row) => {
            const outcome = rowOutcome(row);
            const { day } = row;
            const rowChanges = row.date === null || row.effect !== "updated" ? undefined : changes.get(row.date);
            const imported = day !== null && row.effect !== null;
            return (
              <TableRow key={`${row.sheet}-${row.rowNumber}`} className={cn(!imported && "text-fg-muted")}>
                <TableHeaderCell scope="row" className="numerals bg-surface">
                  {row.date === null ? "No date" : formatDateWithYear(row.date)}
                </TableHeaderCell>
                <TableCell>
                  <Badge tone={outcome.tone}>{outcome.label}</Badge>
                </TableCell>
                {imported ? (
                  <>
                    {columns.map((column) => {
                      const change = rowChanges?.get(column.field);
                      return (
                        <TableCell
                          key={column.field}
                          title={changeTitle(change, timeFormat)}
                          className={cn(
                            "whitespace-nowrap",
                            column.heading !== null && "border-l border-line",
                            change !== undefined && "bg-info-soft font-semibold",
                          )}
                        >
                          <TimeText time={day[column.field]} format={timeFormat} className="time-numerals" />
                          {change !== undefined ? <span className="sr-only"> (changes)</span> : null}
                        </TableCell>
                      );
                    })}
                    {provided.has("jumuah") ? (
                      <TableCell
                        title={changeTitle(rowChanges?.get("jumuah"), timeFormat)}
                        className={cn("border-l border-line whitespace-nowrap", rowChanges?.has("jumuah") && "bg-info-soft font-semibold")}
                      >
                        <span className="time-numerals">
                          {day.jumuah.map((time) => formatTimeText(time, timeFormat)).join(", ")}
                        </span>
                      </TableCell>
                    ) : null}
                    {provided.has("note") ? (
                      <TableCell
                        title={changeTitle(rowChanges?.get("note"), timeFormat)}
                        className={cn("max-w-56 truncate", rowChanges?.has("note") && "bg-info-soft font-semibold")}
                      >
                        {day.note ?? ""}
                      </TableCell>
                    ) : null}
                  </>
                ) : (
                  <TableCell colSpan={span} className="min-w-80 whitespace-normal">
                    {row.issues[0]?.message ?? LEFT_OUT_REASONS[row.status] ?? ""}
                  </TableCell>
                )}
                <TableCell numeric className="text-fg-muted">
                  {several ? `${row.sheet}, ${row.rowNumber}` : row.rowNumber}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Pager noun="rows" page={page} total={rows.length} pageSize={ROWS_PER_PAGE} onPage={setPage} />
      {preview.rowsTruncated ? (
        <p className="mt-2 text-sm text-fg-muted">
          The file has {preview.totalRows} rows; the first {preview.rows.length} are shown here. Every row is imported.
        </p>
      ) : null}
    </ReviewSection>
  );
}
