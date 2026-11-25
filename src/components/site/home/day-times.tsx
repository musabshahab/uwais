"use client";

import { useId, useMemo, useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from "@/components/brand/icons";
import { TimeText } from "@/components/display";
import { Alert } from "@/components/ui/alert";
import { Arabic } from "@/components/ui/arabic";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { IconButton } from "@/components/ui/icon-button";
import { useDisplay, usePrayerSchedule, useTimetable, type ScheduledEvent, type TimetableRow } from "@/lib/client";
import {
  browseWindow,
  canStepDay,
  noteForDate,
  relativeDayLabel,
  rowsForDate,
  selectDay,
} from "@/lib/site/home";
import { timetableHref } from "@/lib/site/month";
import { addDays, formatDateLong, formatDateMedium, monthOf } from "@/lib/time";
import { JUMUAH_LABEL, type DateString, type TimeFormat } from "@/lib/types";
import { NEEDS_SCRIPT } from "../no-script";
import { SiteLink } from "../site-link";
import {
  TIMES_BEGINS_COLUMN,
  TIMES_CARD,
  TIMES_COLUMN_HEADING,
  TIMES_DATE,
  TIMES_FOOTER,
  TIMES_HEADER,
  TIMES_JAMAAT_COLUMN,
  TIMES_NAME_COLUMN,
  TIMES_ROW,
  TIMES_ROW_PADDING,
  TIMES_STATUS_SLOT,
  TIMES_SUNRISE_TIME,
  TIMES_TIME,
  TIMES_TITLE,
  timesNameClasses,
} from "./home-layout";

/** On a phone the label shares a 20px line with the Arabic name, so it loses its vertical padding there. */
const BADGE = "display-appear max-sm:py-0";

/** Props of {@link DayTimes}. */
export interface DayTimesProps {
  className?: string;
}

/** The label a row carries once the clock is running: the prayer whose time is in, and the one after. */
function StatusBadge({ status }: { status: TimetableRow["status"] }) {
  if (status === "current") {
    return (
      <Badge tone="accent" variant="solid" className={BADGE}>
        Now
      </Badge>
    );
  }
  if (status === "next") {
    return (
      <Badge tone="brand" className={BADGE}>
        Next
      </Badge>
    );
  }
  return null;
}

/**
 * The congregation cell of a row. On a Friday it lists every Jumu'ah with
 * its label when there is more than one, or when the only one has a label of
 * its own (`Khutbah`).
 */
function JamaatCell({ row, format, className }: { row: TimetableRow; format: TimeFormat; className?: string }) {
  if (row.key === "sunrise") return null;
  const slots = row.isJumuah ? row.jumuahTimes : [];
  const labelled = slots.length > 1 || (slots.length === 1 && slots[0].label !== JUMUAH_LABEL.name);
  if (!labelled) {
    return <TimeText time={row.jamaat} format={format} className={cn(TIMES_TIME, className)} />;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {slots.map((slot) => (
        <li key={`${slot.label}-${slot.time}`}>
          <TimeText time={slot.time} format={format} className={cn("block", TIMES_TIME, className)} />
          <span className="block text-xs font-medium text-fg-muted">{slot.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** One prayer of the day: its names, when its time begins and when the congregation stands. */
function PrayerTimesRow({
  row,
  format,
  countdownTarget,
}: {
  row: TimetableRow;
  format: TimeFormat;
  /** The event the hero is counting down to, when it belongs to the day on screen. */
  countdownTarget: ScheduledEvent | null;
}) {
  const targeted = countdownTarget !== null && countdownTarget.key === row.key;
  const passed = row.status === "passed";
  const sunrise = row.key === "sunrise";
  const tone = passed ? "text-fg-muted" : "text-fg";
  const classes = timesNameClasses(sunrise);
  return (
    <tr
      data-status={row.status ?? undefined}
      className={cn(TIMES_ROW, "transition-colors", targeted && "bg-accent-soft print-exact")}
    >
      <th scope="row" className={cn(TIMES_NAME_COLUMN, TIMES_ROW_PADDING)}>
        <span className={classes.stack}>
          <span className={cn(classes.name, tone)}>{row.name}</span>
          <span className={classes.detail}>
            <Arabic className={cn(classes.arabic, passed ? "text-fg-muted" : "text-accent-fg")}>{row.arabic}</Arabic>
            {sunrise ? null : (
              <span className={TIMES_STATUS_SLOT}>
                <StatusBadge status={row.status} />
              </span>
            )}
          </span>
        </span>
      </th>
      <td className={cn(TIMES_BEGINS_COLUMN, TIMES_ROW_PADDING)}>
        <TimeText
          time={row.begins}
          format={format}
          className={cn(sunrise ? TIMES_SUNRISE_TIME : TIMES_TIME, targeted && countdownTarget.kind === "begins" ? "text-accent-fg" : tone)}
        />
      </td>
      <td className={cn(TIMES_JAMAAT_COLUMN, TIMES_ROW_PADDING)}>
        <JamaatCell
          row={row}
          format={format}
          className={targeted && countdownTarget.kind === "jamaat" ? "text-accent-fg" : tone}
        />
      </td>
    </tr>
  );
}

/**
 * Today's prayer times, and a browser for the days around it.
 *
 * It opens on today: the six rows (Fajr, Sunrise, Dhuhr or Jumu'ah, Asr,
 * Maghrib, Isha) with Begins and Jamaat, rendered on the server. Once the
 * live clock is running the current and the next prayer are labelled and the
 * row the countdown refers to is highlighted, with the exact time it is
 * counting to picked out. The labels fit into space the rows already have,
 * so nothing moves when they appear.
 *
 * The previous and next buttons step through the days the page already holds
 * (yesterday to five weeks ahead), entirely in the browser; the chosen date
 * is announced to screen readers. "Back to today" returns to the live view.
 * Must be rendered inside `DisplayProvider`.
 */
export function DayTimes({ className }: DayTimesProps) {
  const headingId = useId();
  const { payload, settings } = useDisplay();
  const schedule = usePrayerSchedule();
  const timetable = useTimetable();
  const [selected, setSelected] = useState<DateString | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const today = timetable.date;
  const window = useMemo(() => browseWindow(payload, today), [payload, today]);
  // A selection made yesterday may have become today, or fallen out of the window, since.
  const viewing = (selected === null ? null : selectDay(selected, today, window)) ?? today;
  const isToday = viewing === today;
  const rows = useMemo(
    () => (isToday ? timetable.rows : rowsForDate(payload, viewing)),
    [isToday, timetable.rows, payload, viewing],
  );
  const note = noteForDate(payload, viewing);
  const hasTimes = rows.some((row) => row.begins !== null || (row.key !== "sunrise" && row.jamaat !== null));
  const next = schedule === null ? null : schedule.next;
  const countdownTarget = isToday && next !== null && next.date === today ? next : null;
  const canGoBack = canStepDay(viewing, -1, window);
  const canGoForward = canStepDay(viewing, 1, window);

  function show(candidate: DateString) {
    const chosen = selectDay(candidate, today, window);
    setSelected(chosen);
    setAnnouncement(
      chosen === null
        ? `Showing today, ${formatDateLong(today)}`
        : `Showing ${formatDateLong(chosen)}, ${relativeDayLabel(chosen, today).toLowerCase()}`,
    );
  }

  return (
    <Card as="section" aria-labelledby={headingId} className={cn(TIMES_CARD, className)}>
      <div className={TIMES_HEADER}>
        <IconButton
          {...NEEDS_SCRIPT}
          label="Previous day"
          aria-disabled={!canGoBack || undefined}
          onClick={() => {
            if (canGoBack) show(addDays(viewing, -1));
          }}
        >
          <ChevronLeftIcon />
        </IconButton>
        <div className="min-w-0 flex-1 text-center">
          <h2 id={headingId} className={TIMES_TITLE}>
            {relativeDayLabel(viewing, today)}
          </h2>
          <p className={TIMES_DATE}>
            <time dateTime={viewing}>
              <span className="min-[400px]:hidden">{formatDateMedium(viewing)}</span>
              <span className="max-[399.9px]:hidden">{formatDateLong(viewing)}</span>
            </time>
          </p>
        </div>
        <IconButton
          {...NEEDS_SCRIPT}
          label="Next day"
          aria-disabled={!canGoForward || undefined}
          onClick={() => {
            if (canGoForward) show(addDays(viewing, 1));
          }}
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {note !== null ? (
        <p className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-brand-line bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-fg sm:mx-6">
          <InfoIcon className="mt-0.5" size="1.125em" />
          <span>{note}</span>
        </p>
      ) : null}
      {!hasTimes ? (
        <Alert tone="warning" title={isToday ? "Today's prayer times are not available" : "No prayer times for this day"} className="mx-4 mb-3 sm:mx-6">
          {isToday
            ? "The timetable has no times for today. Please check with the mosque."
            : "The timetable has no times for this date yet."}
        </Alert>
      ) : null}

      <table className="w-full border-collapse">
        <caption className="sr-only">{`Prayer times for ${formatDateLong(viewing)}`}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(TIMES_COLUMN_HEADING, TIMES_NAME_COLUMN)}>
              Prayer
            </th>
            <th scope="col" className={cn(TIMES_COLUMN_HEADING, TIMES_BEGINS_COLUMN)}>
              Begins
            </th>
            <th scope="col" className={cn(TIMES_COLUMN_HEADING, TIMES_JAMAAT_COLUMN)}>
              Jamaat
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PrayerTimesRow key={row.key} row={row} format={settings.timeFormat} countdownTarget={countdownTarget} />
          ))}
        </tbody>
      </table>

      <div className={TIMES_FOOTER}>
        <Button
          {...NEEDS_SCRIPT}
          variant="ghost"
          size="sm"
          className={cn(isToday && "invisible")}
          onClick={() => show(today)}
        >
          Back to today
        </Button>
        <SiteLink
          href={isToday ? "/timetable" : timetableHref(monthOf(viewing))}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          <CalendarIcon />
          Full timetable
        </SiteLink>
      </div>
    </Card>
  );
}
