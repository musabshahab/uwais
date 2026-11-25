"use client";

import { useState, useTransition } from "react";
import { PrayerName } from "@/components/display";
import { TrashIcon } from "@/components/brand/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { saveDayAction } from "@/lib/actions/timetable";
import type { ActionFailure, DayWarning } from "@/lib/actions/types";
import {
  DAY_TIME_GROUPS,
  copyTimesFrom,
  dayFormsEqual,
  dayToForm,
  formToDayInput,
  jumuahError,
  type DayFormState,
} from "@/lib/admin/day-form";
import { afterEditing } from "@/lib/admin/failures";
import { formatList } from "@/lib/admin/text";
import { MAX_DAY_NOTE_LENGTH } from "@/lib/db/schemas";
import { formatDateLong, formatDateMedium, formatTimeText } from "@/lib/time";
import { JUMUAH_LABEL, type DateString, type JumuahSlot, type PrayerDay, type TimeFormat } from "@/lib/types";
import { AdminDialog } from "../admin-dialog";
import { failureMessage, useAdminAction } from "../use-admin-action";
import { TimeField } from "./time-field";

/** Props of {@link DayDialog}. */
export interface DayDialogProps {
  date: DateString;
  /** The stored day, or null when the date has nothing stored. */
  day: PrayerDay | null;
  /** The day before, when it has times to copy. */
  previousDay: PrayerDay | null;
  friday: boolean;
  /** The usual Jumu'ah times from the settings, used when a Friday has none of its own. */
  usualJumuah: readonly JumuahSlot[];
  timeFormat: TimeFormat;
  onClose: () => void;
  /** Called after a save with the day as stored and a sentence for the page's status line. */
  onSaved: (day: PrayerDay, message: string) => void;
  /** Asks the page to open the delete dialog for this day. */
  onRequestDelete: (date: DateString) => void;
}

const JUMUAH_ORDINALS = ["1st", "2nd", "3rd", "4th"];

/**
 * The form for one day of the timetable. It always sends the whole day, so
 * emptying a field clears that time. Times that look wrong (out of order, a
 * jamaat before its prayer begins) are saved and then pointed out, because
 * only the person holding the printed timetable knows what is right.
 *
 * Mount it only while it is open: it starts from the day it is given.
 */
export function DayDialog({ date, day, previousDay, friday, usualJumuah, timeFormat, onClose, onSaved, onRequestDelete }: DayDialogProps) {
  const [baseline, setBaseline] = useState<DayFormState>(() => dayToForm(day));
  const [form, setForm] = useState<DayFormState>(baseline);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [warnings, setWarnings] = useState<readonly DayWarning[] | null>(null);
  const [pending, startTransition] = useTransition();
  const run = useAdminAction();

  const dirty = !dayFormsEqual(form, baseline);
  const errors = failure?.fieldErrors ?? {};
  const jumuahMessage = jumuahError(failure?.fieldErrors);
  const stored = day !== null;

  /** Changes the form and drops the messages about the fields that were just changed. */
  const edit = (change: (current: DayFormState) => DayFormState, edited: (field: string) => boolean) => {
    setForm(change);
    setFailure((current) => afterEditing(current, edited));
  };
  const setTime = (field: keyof DayFormState["times"], value: string) =>
    edit(
      (current) => ({ ...current, times: { ...current.times, [field]: value } }),
      (name) => name === field,
    );
  const setJumuah = (slot: number, value: string) =>
    edit(
      (current) => ({ ...current, jumuah: current.jumuah.map((time, index) => (index === slot ? value : time)) }),
      (name) => name === "jumuah" || name.startsWith("jumuah."),
    );

  const save = () => {
    if (pending) return;
    if (!dirty && stored) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await run(() => saveDayAction(formToDayInput(date, form, friday)));
      if (!result.ok) {
        setFailure(result);
        return;
      }
      setFailure(null);
      const savedForm = dayToForm(result.day);
      setBaseline(savedForm);
      setForm(savedForm);
      onSaved(result.day, `Saved ${formatDateLong(date)}.`);
      if (result.warnings.length > 0) setWarnings(result.warnings);
      else onClose();
    });
  };

  return (
    <AdminDialog
      open
      onClose={onClose}
      // A stray click outside must not throw away what has been typed.
      dismissible={!dirty && !pending}
      size="lg"
      title={formatDateLong(date)}
      description={
        stored
          ? "Correct the times and save. Clear a field to remove that time."
          : "Nothing is stored for this day yet. Enter its times and save."
      }
      footer={
        <>
          {stored ? (
            <Button
              variant="ghost"
              iconStart={<TrashIcon />}
              onClick={() => onRequestDelete(date)}
              disabled={pending}
              className="mr-auto"
            >
              Delete this day
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {warnings !== null && !dirty ? "Close" : "Cancel"}
          </Button>
          <Button type="submit" form="day-form" loading={pending} loadingLabel="Saving">
            Save day
          </Button>
        </>
      }
    >
      <form
        id="day-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="flex flex-col gap-6"
      >
        {failure ? (
          <Alert tone="danger" title="This day was not saved" announce>
            {failureMessage(failure)}
          </Alert>
        ) : null}
        {warnings !== null && !failure ? (
          <Alert tone="warning" title="Saved. Please check these times" announce>
            <ul className="list-disc pl-5">
              {warnings.map((warning) => (
                <li key={`${warning.code}-${warning.field}`}>{warning.message}</li>
              ))}
            </ul>
            <p className="mt-1.5">If they are right, close this window. If not, correct them and save again.</p>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={previousDay === null || pending}
            onClick={() => {
              if (previousDay === null) return;
              edit(
                (current) => copyTimesFrom(current, previousDay),
                (name) => name !== "note",
              );
            }}
          >
            Copy from previous day
          </Button>
          <p className="text-sm text-fg-muted">
            {previousDay === null
              ? "The day before has no times to copy."
              : `Fills in the times of ${formatDateMedium(previousDay.date)}, ready to adjust.`}
          </p>
        </div>

        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {DAY_TIME_GROUPS.map((group) => (
            <fieldset key={group.key} className="min-w-0">
              <legend className="mb-1.5 text-base font-semibold text-fg">
                <PrayerName name={group.name} arabic={group.arabic} arabicClassName="text-fg-muted" />
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {group.columns.map((column) => (
                  <TimeField
                    key={column.field}
                    id={`day-${column.field}`}
                    label={column.label}
                    fullLabel={column.fullLabel}
                    value={form.times[column.field]}
                    onChange={(value) => setTime(column.field, value)}
                    error={errors[column.field]}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {friday ? (
          <fieldset className="min-w-0 rounded-lg border border-line bg-surface px-4 py-4">
            <legend className="px-1.5 text-base font-semibold text-fg">
              <PrayerName name={JUMUAH_LABEL.name} arabic={JUMUAH_LABEL.arabic} arabicClassName="text-fg-muted" />
            </legend>
            <p className="mb-3 text-sm text-fg-muted">
              {usualJumuah.length > 0
                ? `Leave these empty to use the usual ${usualJumuah.length === 1 ? "time" : "times"} from the settings: ${formatList(usualJumuah.map((slot) => formatTimeText(slot.time, timeFormat)))}.`
                : "No usual Jumu'ah times are set in the settings, so enter the times for this Friday here."}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {form.jumuah.map((time, index) => (
                <TimeField
                  key={index}
                  id={`day-jumuah-${index}`}
                  label={JUMUAH_ORDINALS[index] ?? String(index + 1)}
                  fullLabel={`${JUMUAH_ORDINALS[index] ?? index + 1} Jumu'ah`}
                  value={time}
                  onChange={(value) => setJumuah(index, value)}
                />
              ))}
            </div>
            {jumuahMessage ? <p className="mt-2 text-sm font-medium text-danger-fg">{jumuahMessage}</p> : null}
          </fieldset>
        ) : null}

        <FormField
          label="Note"
          optional
          hint={
            <>
              Shown with the day, for example &ldquo;Clocks go back&rdquo;.{" "}
              <span className="numerals">
                {form.note.length} of {MAX_DAY_NOTE_LENGTH} characters
              </span>
            </>
          }
          error={errors.note}
        >
          <Input
            value={form.note}
            onChange={(event) => {
              const note = event.target.value;
              edit(
                (current) => ({ ...current, note }),
                (name) => name === "note",
              );
            }}
            maxLength={MAX_DAY_NOTE_LENGTH}
          />
        </FormField>
      </form>
    </AdminDialog>
  );
}
