"use client";

import { useState } from "react";
import { PencilIcon, TrashIcon, UploadIcon } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import {
  applyLocalChanges,
  hasAnyTime,
  summariseMonth,
  timetableHref,
  withDeletedDays,
  withSavedDay,
  type LocalDayChanges,
  type MonthRow,
} from "@/lib/admin/month";
import { plural } from "@/lib/admin/text";
import { formatMonthYear, isFriday, type MonthString } from "@/lib/time";
import type { DateString, JumuahSlot, PrayerDay, TimeFormat } from "@/lib/types";
import { DayCards } from "./day-cards";
import { DayDialog } from "./day-dialog";
import { DeleteDaysDialog } from "./delete-days-dialog";
import { ExportLinks } from "./export-links";
import { MonthTable } from "./month-table";
import { MonthToolbar } from "./month-toolbar";

/** Props of {@link TimetableEditor}. */
export interface TimetableEditorProps {
  month: MonthString;
  currentMonth: MonthString;
  /** One row per calendar day of `month`, as stored now. */
  rows: readonly MonthRow[];
  /** The last day of the month before, for "Copy from previous day" on the 1st. */
  dayBeforeMonth: PrayerDay | null;
  /** The months offered in the month list. */
  monthChoices: readonly MonthString[];
  /** The day the address asked to edit (`?edit=`), if any. */
  editDate: DateString | null;
  /** Today on the mosque's wall clock, when it falls in this month. */
  today: DateString | null;
  timeFormat: TimeFormat;
  /** The usual Jumu'ah times from the settings. */
  usualJumuah: readonly JumuahSlot[];
}

const NO_CHANGES: LocalDayChanges = new Map();

/** Which dialog is open, if any. */
type OpenDialog = { kind: "day"; date: DateString } | { kind: "delete"; from: string; to: string };

/**
 * One month of the timetable with everything that changes it: the form for
 * a day and the dialog that deletes a stretch of days. The rows come from
 * the server and are refreshed by every action; until the refreshed rows
 * arrive, a beat after the action answers, what was just saved or deleted
 * here is laid over them, so the grid never shows a stale day.
 */
export function TimetableEditor({ month, currentMonth, rows: storedRows, dayBeforeMonth, monthChoices, editDate, today, timeFormat, usualJumuah }: TimetableEditorProps) {
  const [dialog, setDialog] = useState<OpenDialog | null>(editDate === null ? null : { kind: "day", date: editDate });
  const [marked, setMarked] = useState<DateString | null>(editDate);
  const [message, setMessage] = useState<string | null>(null);

  // A link to another day of this month arrives as a new `editDate` while the page stays alive: follow it.
  const [seenEditDate, setSeenEditDate] = useState(editDate);
  if (seenEditDate !== editDate) {
    setSeenEditDate(editDate);
    if (editDate !== null) {
      setDialog({ kind: "day", date: editDate });
      setMarked(editDate);
    }
  }

  // Fresh rows from the server already hold everything that was changed here.
  const [changes, setChanges] = useState<LocalDayChanges>(NO_CHANGES);
  const [seenRows, setSeenRows] = useState(storedRows);
  if (seenRows !== storedRows) {
    setSeenRows(storedRows);
    setChanges(NO_CHANGES);
  }
  const rows = applyLocalChanges(storedRows, changes);

  const summary = summariseMonth(rows);
  const editing = dialog?.kind === "day" ? rows.find((row) => row.date === dialog.date) : undefined;

  const openDay = (date: DateString) => {
    setMessage(null);
    setDialog({ kind: "day", date });
  };
  const close = () => {
    setDialog(null);
    // The address stops asking for a day once its form has been dealt with, so a reload does not reopen it.
    if (editDate !== null) window.history.replaceState(null, "", timetableHref(month));
  };
  const previousDayOf = (date: DateString): PrayerDay | null => {
    const index = rows.findIndex((row) => row.date === date);
    const previous = index > 0 ? rows[index - 1].day : dayBeforeMonth;
    return previous !== null && hasAnyTime(previous) ? previous : null;
  };

  const monthName = formatMonthYear(month);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <MonthToolbar month={month} currentMonth={currentMonth} choices={monthChoices} />
        <div className="flex flex-wrap gap-2">
          {today !== null ? (
            <Button variant="secondary" iconStart={<PencilIcon />} onClick={() => openDay(today)}>
              Edit today
            </Button>
          ) : null}
          <Button
            variant="secondary"
            iconStart={<TrashIcon />}
            onClick={() => {
              setMessage(null);
              setDialog({ kind: "delete", from: "", to: "" });
            }}
          >
            Delete days
          </Button>
        </div>
      </div>

      <div className="mb-4 flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1">
        <p className="flex flex-wrap items-center gap-2 text-base text-fg-muted">
          {summary.missing === 0 ? (
            `Every day of ${monthName} has prayer times.`
          ) : (
            <>
              <Badge tone="warning">{summary.missing} missing</Badge>
              {summary.missing === summary.total
                ? `No prayer times are stored for ${monthName}.`
                : `${plural(summary.missing, "day")} of ${monthName} ${summary.missing === 1 ? "has" : "have"} no prayer times.`}
            </>
          )}
        </p>
        <Status tone="success">{message}</Status>
      </div>

      {summary.missing === summary.total ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-5 py-4">
          <p className="max-w-prose text-base text-fg">
            The quickest way to fill a whole month is to import a file. You can also add days one at a time with the
            Add buttons below.
          </p>
          <Button href="/admin/import" variant="secondary" iconStart={<UploadIcon />}>
            Import a timetable
          </Button>
        </div>
      ) : null}

      <MonthTable rows={rows} timeFormat={timeFormat} marked={marked} onEdit={openDay} label={`Prayer times for ${monthName}`} />
      <DayCards rows={rows} timeFormat={timeFormat} marked={marked} onEdit={openDay} />

      <ExportLinks month={month} />

      {dialog?.kind === "day" && editing !== undefined ? (
        <DayDialog
          // A different day is a different form.
          key={editing.date}
          date={editing.date}
          day={editing.day}
          previousDay={previousDayOf(editing.date)}
          friday={isFriday(editing.date)}
          usualJumuah={usualJumuah}
          timeFormat={timeFormat}
          onClose={close}
          onSaved={(day, text) => {
            setChanges((current) => withSavedDay(current, day));
            setMarked(day.date);
            setMessage(text);
          }}
          onRequestDelete={(date) => setDialog({ kind: "delete", from: date, to: date })}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteDaysDialog
          initialFrom={dialog.from}
          initialTo={dialog.to}
          onClose={close}
          onDeleted={(from, to, text) => {
            setChanges((current) => withDeletedDays(current, from, to));
            setMarked(null);
            setMessage(text);
          }}
        />
      ) : null}
    </>
  );
}
