import { Fragment } from "react";
import { cn } from "@/components/ui/cn";
import type { MonthDayRow } from "@/lib/site/month";
import { formatDateLong, formatTime, isValidTimeString } from "@/lib/time";
import { JUMUAH_LABEL, PRAYERS, type JumuahSlot, type TimeFormat, type TimeString } from "@/lib/types";
import { TodayInView } from "./today-in-view";

/** The id of today's row, for the "Jump to today" link. */
export const TODAY_ROW_ID = "today";

/** The id of the frame the table scrolls in. */
const REGION_ID = "timetable-days";

/*
 * The header is two rows tall and stays in view while the days scroll under
 * it. The second row sticks below the first, so the first has a fixed height.
 */
const HEAD = "sticky border-line bg-surface-sunken print:static print:border-line-strong";
/** A prayer's name over its two columns: the first header row. */
const HEAD_GROUP = `${HEAD} top-0 z-20 h-9 align-bottom print:h-auto`;
/** `Begins` and `Jamaat`: the second header row. */
const HEAD_SUB = `${HEAD} top-9 z-20 border-b`;
/** A heading that spans both header rows. */
const HEAD_TALL = `${HEAD} top-0 border-b pb-1.5 align-bottom print:pb-[1pt]`;
const GROUP_NAME = "px-2 font-display text-base font-semibold text-fg print:px-1 print:text-[10pt]";
const SUB_HEADING =
  "px-2 pb-1.5 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase print:px-1 print:pb-[1pt] print:text-[7.5pt] print:text-fg";

/** A line between one prayer's columns and the next. The date column draws its own, which travels with it. */
const GROUP_START = "border-l border-line";

/* On paper a row is one tight line, so that the 31 days of a long month fit one sheet. */
const CELL_BASE = "border-b border-line px-2 py-2 print:px-1 print:py-[0.75pt] print:leading-[1.15]";
const CELL = `${CELL_BASE} whitespace-nowrap`;
/* A block, so that the height of a row is the height of its digits and not of the text face around them. */
const TIME = "block time-numerals text-time-sm print:text-[10pt] print:leading-[1.15]";

/** The background of a row: today stands out on screen, Fridays on screen and on paper. */
function rowTone(row: Pick<MonthDayRow, "isToday" | "isFriday">): string {
  if (row.isToday) return row.isFriday ? "bg-accent-soft print:bg-brand-soft print-exact" : "bg-accent-soft print:bg-surface";
  return row.isFriday ? "bg-brand-soft print-exact" : "bg-surface";
}

/** One time of the month: digits only, as on a printed timetable; a dash when there is none. */
function MonthTime({ time, format, className }: { time: TimeString | null; format: TimeFormat; className?: string }) {
  if (!isValidTimeString(time)) {
    return (
      <span className={cn(TIME, "text-fg-subtle")}>
        <span aria-hidden="true">-</span>
        <span className="sr-only">No time</span>
      </span>
    );
  }
  return (
    <time dateTime={time} className={cn(TIME, className)}>
      {formatTime(time, format).text}
    </time>
  );
}

/** Every Jumu'ah of a Friday on one line, each announced with its label. */
function JumuahTimes({ slots, format }: { slots: readonly JumuahSlot[]; format: TimeFormat }) {
  return (
    <span className="flex items-baseline justify-center gap-x-1.5 print:gap-x-1">
      {slots.map((slot, index) => (
        <Fragment key={`${slot.label}-${slot.time}`}>
          {index > 0 ? (
            <span aria-hidden="true" className="leading-none text-fg-subtle">
              /
            </span>
          ) : null}
          <span>
            <span className="sr-only">{`${slot.label} `}</span>
            <MonthTime time={slot.time} format={format} className="font-semibold text-brand-fg" />
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** The first cell of a row: the weekday and the day of the month. */
function DateCell({ row }: { row: MonthDayRow }) {
  return (
    <th
      scope="row"
      aria-current={row.isToday ? "date" : undefined}
      className={cn(
        CELL,
        "sticky left-0 z-10 border-r pr-3 pl-3 text-left font-normal sm:pl-4 print:static print:pl-1",
        rowTone(row),
        row.isToday &&
          "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-accent before:content-[''] print:before:hidden",
      )}
    >
      <time dateTime={row.date} className="flex items-baseline gap-2 print:gap-1.5">
        <span className="sr-only">{formatDateLong(row.date)}</span>
        <span
          aria-hidden="true"
          className={cn(
            "w-8 text-xs leading-none font-semibold tracking-[0.08em] uppercase print:w-[2.6em] print:text-[8pt]",
            row.isFriday ? "text-brand-fg" : "text-fg-muted",
          )}
        >
          {row.weekday}
        </span>
        <span aria-hidden="true" className={cn(TIME, "min-w-[2ch] text-right font-semibold text-fg")}>
          {row.dayOfMonth}
        </span>
      </time>
      {row.isToday ? <span className="sr-only">, today</span> : null}
    </th>
  );
}

/** Props of {@link MonthTable}. */
export interface MonthTableProps {
  /** One row per day of the month, from `monthRows`. */
  rows: readonly MonthDayRow[];
  /** 12-hour or 24-hour display (`settings.timeFormat`). */
  format: TimeFormat;
  /** What the table is, for assistive technology: `Prayer timetable for November 2026`. */
  label: string;
  className?: string;
}

/**
 * A month of prayer times: one row per day, with Begins and Jamaat for each
 * prayer under a shared heading, and Sunrise. Today's row is highlighted,
 * Fridays are shaded and show the Jumu'ah times in place of the Dhuhr
 * congregation, days the timetable does not cover say so, and a Notes
 * column appears when any day of the month has a note.
 *
 * Below the `lg` breakpoint the table scrolls inside its own frame, in both
 * directions, with the header and the date column held in place; the frame
 * opens on today's row. From `lg` up it is laid out in full and the header
 * sticks to the top of the window.
 * Printed, it is plain and compact enough for a whole month to fit one A4
 * landscape sheet.
 */
export function MonthTable({ rows, format, label, className }: MonthTableProps) {
  const hasNotes = rows.some((row) => row.note !== null);
  const timeColumns = PRAYERS.length * 2 + 1;
  return (
    <div
      id={REGION_ID}
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        // `relative`: visually hidden labels inside the cells are positioned, and must scroll with the table.
        "relative max-h-[min(80dvh,46rem)] overflow-auto overscroll-x-contain rounded-lg border border-line bg-surface shadow-sm",
        "lg:max-h-none lg:overflow-clip",
        "print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none",
        className,
      )}
    >
      <table className="w-full border-separate border-spacing-0 text-center">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={cn(HEAD_TALL, GROUP_NAME, "left-0 z-30 border-r pr-3 pl-3 text-left sm:pl-4 print:pl-1")}
            >
              Date
            </th>
            {PRAYERS.map((prayer, index) => (
              <Fragment key={prayer.key}>
                <th scope="colgroup" colSpan={2} className={cn(HEAD_GROUP, GROUP_NAME, index > 0 && GROUP_START)}>
                  {prayer.name}
                </th>
                {index === 0 ? (
                  <th scope="col" rowSpan={2} className={cn(HEAD_TALL, GROUP_NAME, GROUP_START, "z-20")}>
                    Sunrise
                  </th>
                ) : null}
              </Fragment>
            ))}
            {hasNotes ? (
              <th scope="col" rowSpan={2} className={cn(HEAD_TALL, GROUP_NAME, GROUP_START, "z-20 text-left")}>
                Notes
              </th>
            ) : null}
          </tr>
          <tr>
            {PRAYERS.map((prayer, index) => (
              <Fragment key={prayer.key}>
                <th scope="col" className={cn(HEAD_SUB, SUB_HEADING, index > 0 && GROUP_START)}>
                  Begins
                </th>
                <th scope="col" className={cn(HEAD_SUB, SUB_HEADING)}>
                  Jamaat
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = rowTone(row);
            return (
              <tr key={row.date} id={row.isToday ? TODAY_ROW_ID : undefined} className="scroll-mt-20">
                <DateCell row={row} />
                {row.hasTimes ? (
                  PRAYERS.map((prayer, index) => {
                    const cell = row[prayer.key];
                    const jumuah = prayer.key === "dhuhr" && row.jumuah.length > 0;
                    return (
                      <Fragment key={prayer.key}>
                        <td className={cn(CELL, index > 0 && GROUP_START, tone)}>
                          <MonthTime time={cell.begins} format={format} className="text-fg-muted print:text-fg" />
                        </td>
                        <td className={cn(CELL, tone)}>
                          {jumuah ? (
                            <JumuahTimes slots={row.jumuah} format={format} />
                          ) : (
                            <MonthTime time={cell.jamaat} format={format} className="font-semibold text-fg" />
                          )}
                        </td>
                        {index === 0 ? (
                          <td className={cn(CELL, GROUP_START, tone)}>
                            <MonthTime time={row.sunrise} format={format} className="text-fg-muted print:text-fg" />
                          </td>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <td colSpan={timeColumns} className={cn(CELL, tone, "text-sm text-fg-muted print:text-[9pt]")}>
                    No times
                  </td>
                )}
                {hasNotes ? (
                  <td className={cn(CELL_BASE, GROUP_START, tone, "max-w-64 min-w-36 text-left text-sm text-fg-muted print:max-w-none print:min-w-0 print:text-[8.5pt] print:leading-[1.2] print:whitespace-nowrap print:text-fg")}>
                    {row.note}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((row) => row.isToday) ? <TodayInView regionId={REGION_ID} rowId={TODAY_ROW_ID} /> : null}
    </div>
  );
}

/** What the shading and the Friday column mean, in a line under the table. */
export function MonthTableLegend({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2.5 text-sm text-fg-muted print:text-[8.5pt] print:text-fg", className)}>
      <span aria-hidden="true" className="mt-1 size-3.5 shrink-0 rounded-xs border border-brand-line bg-brand-soft print-exact print:mt-0.5 print:size-[8pt]" />
      <span>{`Fridays are shaded. Their Dhuhr jamaat column shows the ${JUMUAH_LABEL.name} times.`}</span>
    </p>
  );
}
