"use client";

import { memo, useMemo } from "react";
import { PrayerName, TimeText } from "@/components/display";
import { cn } from "@/components/ui/cn";
import { useDisplay, usePrayerSchedule, useTimetable } from "@/lib/client";
import { formatDateMedium, getDayRow } from "@/lib/time";
import {
  buildTvTimetable,
  dayHasTimes,
  type TimetableDay,
  type TvTimetableRow,
} from "@/lib/tv/timetable";
import type { TimeFormat } from "@/lib/types";
import { TvNoData } from "./tv-no-data";

/** Props of {@link TvTimetable}. */
export interface TvTimetableProps {
  /** The day to show, from `useTimetableDay()`. */
  day: TimetableDay;
}

interface RowProps {
  row: TvTimetableRow;
  format: TimeFormat;
  showBegins: boolean;
  showJamaat: boolean;
}

/** The words of the small tag on the current and the next prayer. */
const STATUS_TAGS: Partial<Record<NonNullable<TvTimetableRow["status"]>, string>> = {
  current: "Now",
  next: "Next",
};

/** Every Jumu'ah of a Friday in one cell, earliest first; the one being counted down to is picked out. */
function JumuahTimes({ row, format }: Pick<RowProps, "row" | "format">) {
  return (
    <span className={cn("tvx-slots", row.jumuahTimes.length > 2 && "tvx-slots-grid")}>
      {row.jumuahTimes.map((slot) => (
        <span key={`${slot.label}-${slot.time}`} className="tvx-slot">
          <span className="display-sr-only">{`${slot.label}: `}</span>
          <TimeText
            time={slot.time}
            format={format}
            className={cn(
              "tv-time tvx-slot-time",
              row.target === "jamaat" && row.targetTime === slot.time && "tvx-time-target",
            )}
          />
        </span>
      ))}
    </span>
  );
}

function Row({ row, format, showBegins, showJamaat }: RowProps) {
  const tag = row.status === null ? undefined : STATUS_TAGS[row.status];
  const sunrise = row.key === "sunrise";
  const manySlots = row.isJumuah && row.jumuahTimes.length > 1;
  return (
    <div
      role="row"
      className={cn(
        "tvx-row",
        row.status !== null && `tvx-row-${row.status}`,
        sunrise && "tvx-row-minor",
        manySlots && "tvx-row-tall",
      )}
    >
      <div role="rowheader" className="tvx-row-name">
        <PrayerName
          name={row.name}
          arabic={row.arabic}
          className="tv-display tvx-prayer"
          arabicClassName="tvx-prayer-arabic"
        />
        {tag === undefined ? null : <span className="tvx-tag">{tag}</span>}
      </div>
      {showBegins ? (
        <div role="cell" className="tvx-cell">
          <TimeText
            time={row.begins}
            format={format}
            className={cn("tv-time tvx-time", row.target === "begins" && "tvx-time-target")}
          />
        </div>
      ) : null}
      {showJamaat ? (
        <div role="cell" className="tvx-cell">
          {sunrise ? null : manySlots ? (
            <JumuahTimes row={row} format={format} />
          ) : (
            <TimeText
              time={row.jamaat}
              format={format}
              className={cn("tv-time tvx-time", row.target === "jamaat" && "tvx-time-target")}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The timetable of the TV display: Fajr, sunrise, Dhuhr (Jumu'ah with every
 * slot on a Friday), Asr, Maghrib and Isha, with their Begins and Jamaat
 * times. The current prayer is a filled row marked "Now", the next one is
 * outlined and marked "Next", prayers that have passed are dimmed, and the
 * one time the countdown is heading for is picked out in brass.
 *
 * With `day="tomorrow"` it shows tomorrow's times under a brass "Tomorrow"
 * heading with the date. When the timetable has nothing for today it shows
 * a message instead (see `TvNoData`).
 *
 * The server renders today's rows from the payload, without statuses, so the
 * table is complete before the page hydrates. Must be rendered inside
 * `DisplayProvider`.
 */
export const TvTimetable = memo(function TvTimetable({ day }: TvTimetableProps) {
  const { payload, settings } = useDisplay();
  const timetable = useTimetable();
  const schedule = usePrayerSchedule();
  const table = useMemo(
    () => buildTvTimetable({ timetable, schedule, settings, day }),
    [timetable, schedule, settings, day],
  );

  // Before the clock is known the payload's own day is what the server rendered.
  const dataStatus =
    schedule !== null
      ? schedule.dataStatus
      : payload.days.length === 0
        ? "empty"
        : dayHasTimes(getDayRow(payload.days, timetable.date))
          ? "ok"
          : "missing-today";
  if (dataStatus !== "ok") return <TvNoData date={timetable.date} empty={dataStatus === "empty"} />;

  const tomorrow = table.day === "tomorrow";
  const oneTimeColumn = !(table.showBegins && table.showJamaat);
  const note = tomorrow
    ? (schedule?.tomorrowRow?.note ?? null)
    : (getDayRow(payload.days, table.date)?.note ?? null);

  return (
    <section
      role="table"
      aria-label={tomorrow ? "Prayer times for tomorrow" : "Prayer times for today"}
      className={cn(
        "tvx-table",
        tomorrow && "tvx-table-tomorrow",
        oneTimeColumn && "tvx-table-narrow",
        settings.timeFormat === "24h" && "tvx-table-24h",
      )}
    >
      <div role="rowgroup">
        <div role="row" className="tvx-table-head">
          <div role="columnheader" className="tvx-table-day">
            {tomorrow ? (
              <>
                <span className="tv-display tvx-table-day-name">Tomorrow</span>
                <time dateTime={table.date} className="tvx-table-day-date">
                  {formatDateMedium(table.date)}
                </time>
              </>
            ) : (
              <span className="display-sr-only">Prayer</span>
            )}
            {note ? <span className="tvx-table-note">{note}</span> : null}
          </div>
          {table.showBegins ? (
            <div role="columnheader" className="tvx-table-column">
              Begins
            </div>
          ) : null}
          {table.showJamaat ? (
            <div role="columnheader" className="tvx-table-column">
              Jamaat
            </div>
          ) : null}
        </div>
      </div>
      <div role="rowgroup" className="tvx-rows">
        {table.rows.map((row) => (
          <Row
            key={row.key}
            row={row}
            format={settings.timeFormat}
            showBegins={table.showBegins}
            showJamaat={table.showJamaat}
          />
        ))}
      </div>
    </section>
  );
});
