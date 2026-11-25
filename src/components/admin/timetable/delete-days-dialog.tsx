"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { deleteDaysAction } from "@/lib/actions/timetable";
import { MAX_DELETE_RANGE_DAYS, type ActionFailure } from "@/lib/actions/types";
import { formatDateRange, plural } from "@/lib/admin/text";
import { isValidDateString } from "@/lib/time";
import type { DateString } from "@/lib/types";
import { AdminDialog } from "../admin-dialog";
import { failureMessage, useAdminAction } from "../use-admin-action";

/** Props of {@link DeleteDaysDialog}. */
export interface DeleteDaysDialogProps {
  /** The range the dialog opens with; empty strings leave the fields blank. */
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
  /** Called once the days are gone, with the range that was emptied and a sentence for the page's status line. */
  onDeleted: (from: DateString, to: DateString, message: string) => void;
}

/**
 * Deletes a stretch of days in two steps. The first asks the server what the
 * range holds and changes nothing; only then, with the answer on screen and
 * a box ticked, does the Delete button work. Changing either date starts over.
 *
 * Mount it only while it is open.
 */
export function DeleteDaysDialog({ initialFrom, initialTo, onClose, onDeleted }: DeleteDaysDialogProps) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  /** The server's description of what would be deleted, once it has been asked. */
  const [question, setQuestion] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const run = useAdminAction();

  const ready = isValidDateString(from) && isValidDateString(to);
  const errors = failure?.fieldErrors ?? {};
  // A problem with one of the two dates is said under that date; saying it again in a box would only be noise.
  const saidUnderField = errors.from !== undefined || errors.to !== undefined;

  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setQuestion(null);
    setAgreed(false);
    setFailure(null);
  };

  const submit = (confirm: boolean) => {
    if (pending || !ready) return;
    startTransition(async () => {
      const result = await run(() => deleteDaysAction({ from: from as DateString, to: to as DateString, confirm }));
      if (result.ok) {
        onDeleted(result.from, result.to, `Deleted ${plural(result.deleted, "day")}: ${formatDateRange(result.from, result.to)}.`);
        onClose();
      } else if (result.code === "confirmation-required") {
        setFailure(null);
        setQuestion(result.error);
      } else {
        setQuestion(null);
        setAgreed(false);
        setFailure(result);
      }
    });
  };

  return (
    <AdminDialog
      open
      onClose={onClose}
      dismissible={!pending}
      title="Delete days"
      description={`Removes every prayer time stored between two dates, up to ${MAX_DELETE_RANGE_DAYS} days at once. For a single day, give the same date twice.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          {question === null ? (
            <Button type="submit" form="delete-days-form" disabled={!ready} loading={pending} loadingLabel="Checking">
              Check these days
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => submit(true)}
              disabled={!agreed}
              loading={pending}
              loadingLabel="Deleting"
            >
              Delete for good
            </Button>
          )}
        </>
      }
    >
      <form
        id="delete-days-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (question === null) submit(false);
        }}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First day" error={errors.from}>
            <Input type="date" value={from} max={to || undefined} onChange={(event) => change(setFrom)(event.target.value)} />
          </FormField>
          <FormField label="Last day" error={errors.to}>
            <Input type="date" value={to} min={from || undefined} onChange={(event) => change(setTo)(event.target.value)} />
          </FormField>
        </div>

        {failure && !saidUnderField ? (
          <Alert tone={failure.code === "not-found" ? "info" : "danger"} announce>
            {failureMessage(failure)}
          </Alert>
        ) : null}

        {question !== null ? (
          <div className="flex flex-col gap-2">
            <Alert tone="danger" title="Nothing has been deleted yet" announce>
              {question}
            </Alert>
            <Checkbox
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              label="Yes, delete these days. I know this cannot be undone."
            />
          </div>
        ) : null}
      </form>
    </AdminDialog>
  );
}
