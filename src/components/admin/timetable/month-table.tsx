import { TimeText } from "@/components/display";
import { PencilIcon, PlusIcon } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { DAY_TIME_GROUPS } from "@/lib/admin/day-form";
import type { MonthRow } from "@/lib/admin/month";
import { formatDayOfMonth } from "@/lib/admin/text";
import { formatDateLong } from "@/lib/time";
import type { DateString, TimeFormat } from "@/lib/types";

/** Props shared by the two presentations of a month. */
export interface MonthViewProps {
  /** One row per calendar day. */
  rows: readonly MonthRow[];
  timeFormat: TimeFormat;
  /** The day that was just saved or asked for, to draw the eye back to it. */
  marked: DateString | null;
  /** Opens the form for a day. */
  onEdit: (date: DateString) => void;
}

const TIME_COLUMN_COUNT = DAY_TIME_GROUPS.reduce((count, group) => count + group.columns.length, 0);

/**
 * Layout the shared table does not offer by itself: slightly narrower cells,
 * so the fifteen columns fit a laptop screen without scrolling; the tint of
 * a day without times carried into its pinned date cell; and the heading of
 * the pinned action column kept above the cells that scroll under it.
 */
const TABLE_LAYOUT = cn(
  "[&_tbody>tr>*]:px-2.5 [&_thead>tr>*]:px-2.5",
  "[&_tbody>tr[data-missing]>*:first-child]:bg-warning-soft",
  "[&_thead_th:last-child]:z-20",
);

/**
 * Keeps the Edit and Add buttons at the right edge while the times scroll
 * sideways on a narrower screen, as the date stays at the left edge.
 */
const PINNED_ACTION =
  "sticky right-0 z-[1] before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-line-strong/40 before:content-['']";

/** The Jumu'ah column of a row: the day's own times, or a pointer to the usual ones. */
function JumuahCell({ row, timeFormat }: { row: MonthRow; timeFormat: TimeFormat }) {
  if (!row.friday) return null;
  const times = row.day?.jumuah ?? [];
  if (times.length === 0) return <span className="text-fg-muted">Usual times</span>;
  return (
    <span className="flex flex-col">
      {times.map((time) => (
        <TimeText key={time} time={time} format={timeFormat} className="time-numerals font-semibold" />
      ))}
    </span>
  );
}

/**
 * The month as a grid, for screens wide enough to hold it: a row per day
 * with all eleven times, the day's own Jumu'ah times and its note. Days
 * without times say so across the row and offer "Add".
 */
export function MonthTable({ rows, timeFormat, marked, onEdit, label }: MonthViewProps & { label: string }) {
  return (
    <Table
      label={label}
      dense
      stickyHeader
      stickyFirstColumn
      maxHeight="max(26rem, calc(100dvh - 9rem))"
      wrapperClassName="hidden md:block"
      className={TABLE_LAYOUT}
    >
      <TableHead>
        <TableRow>
          <TableHeaderCell className="align-top text-fg">Date</TableHeaderCell>
          {DAY_TIME_GROUPS.flatMap((group) =>
            group.columns.map((column, index) => (
              <TableHeaderCell
                key={column.field}
                className={cn("align-top", index === 0 && "border-l border-line")}
                aria-label={column.fullLabel}
              >
                <span className="block text-fg">{index === 0 ? group.name : " "}</span>
                <span className="block text-xs font-normal">{group.columns.length > 1 ? column.label : " "}</span>
              </TableHeaderCell>
            )),
          )}
          <TableHeaderCell className="border-l border-line align-top text-fg">Jumu&apos;ah</TableHeaderCell>
          <TableHeaderCell className="align-top text-fg">Note</TableHeaderCell>
          <TableHeaderCell className={cn(PINNED_ACTION, "align-top")}>
            <span className="sr-only">Edit</span>
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const { date, day } = row;
          const tint = row.today || marked === date;
          return (
            <TableRow
              key={date}
              highlight={tint}
              data-day={date}
              data-missing={row.missing && !tint ? "" : undefined}
              aria-current={row.today ? "date" : undefined}
              className={cn(row.missing && !tint && "bg-warning-soft")}
            >
              <TableHeaderCell scope="row" className={cn(row.friday && "text-brand-fg")}>
                <span className="numerals">{formatDayOfMonth(date)}</span>
                {row.today ? (
                  <Badge tone="accent" className="ml-2">
                    Today
                  </Badge>
                ) : null}
              </TableHeaderCell>
              {row.missing || day === null ? (
                <TableCell colSpan={TIME_COLUMN_COUNT} className="border-l border-line font-semibold text-warning-fg">
                  No prayer times for this day
                </TableCell>
              ) : (
                DAY_TIME_GROUPS.flatMap((group) =>
                  group.columns.map((column, index) => (
                    <TableCell key={column.field} className={cn("whitespace-nowrap", index === 0 && "border-l border-line")}>
                      <TimeText
                        time={day[column.field]}
                        format={timeFormat}
                        className={cn("time-numerals", column.label === "Jamaat" ? "font-semibold text-fg" : "text-fg-muted")}
                      />
                    </TableCell>
                  )),
                )
              )}
              <TableCell className="border-l border-line whitespace-nowrap">
                <JumuahCell row={row} timeFormat={timeFormat} />
              </TableCell>
              <TableCell className="max-w-36 truncate" title={day?.note ?? undefined}>
                {day?.note ?? ""}
              </TableCell>
              <TableCell
                className={cn(PINNED_ACTION, "text-right", tint ? "bg-accent-soft" : row.missing ? "bg-warning-soft" : "bg-surface")}
              >
                <Button
                  variant={row.missing ? "secondary" : "ghost"}
                  size="sm"
                  iconStart={row.missing ? <PlusIcon /> : <PencilIcon />}
                  onClick={() => onEdit(date)}
                >
                  {row.missing ? "Add" : "Edit"}
                  <span className="sr-only"> {formatDateLong(date)}</span>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
