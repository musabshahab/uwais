import { TimeText } from "@/components/display";
import { PencilIcon, PlusIcon } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { DAY_TIME_GROUPS } from "@/lib/admin/day-form";
import { formatDayOfMonth } from "@/lib/admin/text";
import { formatDateLong } from "@/lib/time";
import type { MonthViewProps } from "./month-table";

/**
 * The month as a list of days, for a phone: each day is a card with a line
 * per prayer (begins, then jamaat) and one button that opens its form.
 */
export function DayCards({ rows, timeFormat, marked, onEdit }: MonthViewProps) {
  return (
    <ul className="flex flex-col gap-2.5 md:hidden">
      {rows.map((row) => {
        const { date, day } = row;
        const tint = row.today || marked === date;
        return (
          <li
            key={date}
            data-day={date}
            aria-current={row.today ? "date" : undefined}
            className={cn(
              "rounded-lg border px-4 py-3",
              tint ? "border-accent-line bg-accent-soft" : row.missing ? "border-warning-line bg-warning-soft" : "border-line bg-surface",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex flex-wrap items-center gap-2 font-sans text-base font-semibold text-fg">
                <span className="numerals">{formatDayOfMonth(date)}</span>
                {row.today ? <Badge tone="accent">Today</Badge> : null}
                {row.friday ? <Badge tone="brand">Jumu&apos;ah</Badge> : null}
              </h3>
              <Button
                variant="secondary"
                size="sm"
                iconStart={row.missing ? <PlusIcon /> : <PencilIcon />}
                onClick={() => onEdit(date)}
              >
                {row.missing ? "Add" : "Edit"}
                <span className="sr-only"> {formatDateLong(date)}</span>
              </Button>
            </div>
            {row.missing || day === null ? (
              <p className="mt-1 text-sm font-semibold text-warning-fg">No prayer times for this day</p>
            ) : (
              <dl className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                {DAY_TIME_GROUPS.map((group) => (
                  <div key={group.key} className="flex items-baseline justify-between gap-3">
                    <dt className="text-fg-muted">{group.name}</dt>
                    {/* Two fixed columns, begins then jamaat, so the times line up down the card. */}
                    <dd className="grid grid-cols-2 gap-x-3 text-right">
                      {group.columns.map((column) => (
                        <TimeText
                          key={column.field}
                          time={day[column.field]}
                          format={timeFormat}
                          missingLabel={`No ${column.fullLabel} time`}
                          className={cn("time-numerals w-20", column.label === "Jamaat" ? "font-semibold text-fg" : "text-fg-muted")}
                        />
                      ))}
                    </dd>
                  </div>
                ))}
                {row.friday ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-fg-muted">Jumu&apos;ah</dt>
                    <dd className="text-right">
                      {day.jumuah.length === 0 ? (
                        <span className="text-fg-muted">Usual times</span>
                      ) : (
                        <span className="flex flex-wrap justify-end gap-x-3">
                          {day.jumuah.map((time) => (
                            <TimeText key={time} time={time} format={timeFormat} className="time-numerals font-semibold text-fg" />
                          ))}
                        </span>
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>
            )}
            {day?.note ? <p className="mt-2 text-sm text-fg">Note: {day.note}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
