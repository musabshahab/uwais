"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncementAction, updateAnnouncementAction } from "@/lib/actions/announcements";
import type { ActionFailure } from "@/lib/actions/types";
import {
  EMPTY_ANNOUNCEMENT_FORM,
  announcementFormsEqual,
  announcementToForm,
  formStatus,
  formToAnnouncementInput,
  type AnnouncementFormState,
} from "@/lib/admin/announcements";
import { afterEditing } from "@/lib/admin/failures";
import { MAX_ANNOUNCEMENT_BODY_LENGTH, MAX_ANNOUNCEMENT_TITLE_LENGTH } from "@/lib/db/schemas";
import type { Announcement, DateString } from "@/lib/types";
import { AdminDialog } from "../admin-dialog";
import { failureMessage, useAdminAction } from "../use-admin-action";
import { AnnouncementPreview } from "./announcement-preview";

/** Props of {@link AnnouncementDialog}. */
export interface AnnouncementDialogProps {
  /** The announcement to change, or null to write a new one. */
  announcement: Announcement | null;
  /** Today on the mosque's wall clock, for the status in the preview. */
  today: DateString;
  onClose: () => void;
  /** Called once the announcement is stored, with it and a sentence for the page's status line. */
  onSaved: (announcement: Announcement, message: string) => void;
}

/** The two fields a message about the order of the days can sit under. */
const SCHEDULE_FIELDS = ["startsOn", "endsOn"] as const;

/** "12 of 120 characters", announced only when the limit is close. */
function Counter({ length, max }: { length: number; max: number }) {
  const left = max - length;
  return (
    <span className="numerals" aria-live={left <= 20 ? "polite" : "off"}>
      {length} of {max} characters
    </span>
  );
}

/**
 * The form for writing or changing an announcement, with a preview that
 * follows it. Mount it only while it is open: it starts from the
 * announcement it is given.
 */
export function AnnouncementDialog({ announcement, today, onClose, onSaved }: AnnouncementDialogProps) {
  const initial = announcement === null ? EMPTY_ANNOUNCEMENT_FORM : announcementToForm(announcement);
  const [form, setForm] = useState<AnnouncementFormState>(initial);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const run = useAdminAction();

  const errors = failure?.fieldErrors ?? {};
  const dirty = !announcementFormsEqual(form, initial);
  const set = <Key extends keyof AnnouncementFormState>(key: Key, value: AnnouncementFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    // A message about the order of the two days is settled by changing either of them.
    const settled: readonly string[] = key === "startsOn" || key === "endsOn" ? SCHEDULE_FIELDS : [key];
    setFailure((current) => afterEditing(current, (name) => settled.includes(name)));
  };

  const save = () => {
    if (pending) return;
    startTransition(async () => {
      const input = formToAnnouncementInput(form);
      const result = await run(() =>
        announcement === null ? createAnnouncementAction(input) : updateAnnouncementAction(announcement.id, input),
      );
      if (result.ok) {
        onSaved(result.announcement, announcement === null ? "The announcement was added." : "The announcement was updated.");
        onClose();
      } else {
        setFailure(result);
      }
    });
  };

  return (
    <AdminDialog
      open
      onClose={onClose}
      // A stray click outside must not throw away what has been typed.
      dismissible={!dirty && !pending}
      size="lg"
      title={announcement === null ? "New announcement" : "Edit announcement"}
      description="Shown on the website, the TV display, or both, between the days you choose."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="announcement-form" loading={pending} loadingLabel="Saving">
            {announcement === null ? "Add announcement" : "Save changes"}
          </Button>
        </>
      }
    >
      <form
        id="announcement-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="flex flex-col gap-5"
      >
        {failure ? (
          <Alert tone="danger" title="The announcement was not saved" announce>
            {failureMessage(failure)}
          </Alert>
        ) : null}

        <FormField
          label="Title"
          required
          hint={<Counter length={form.title.length} max={MAX_ANNOUNCEMENT_TITLE_LENGTH} />}
          error={errors.title}
        >
          <Input
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={MAX_ANNOUNCEMENT_TITLE_LENGTH}
          />
        </FormField>

        <FormField
          label="Text"
          optional
          hint={<Counter length={form.body.length} max={MAX_ANNOUNCEMENT_BODY_LENGTH} />}
          error={errors.body}
        >
          <Textarea
            value={form.body}
            onChange={(event) => set("body", event.target.value)}
            maxLength={MAX_ANNOUNCEMENT_BODY_LENGTH}
            rows={4}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="First day" optional hint="Leave empty to show it straight away." error={errors.startsOn}>
            <Input
              type="date"
              value={form.startsOn}
              onChange={(event) => set("startsOn", event.target.value)}
              max={form.endsOn || undefined}
            />
          </FormField>
          <FormField label="Last day" optional hint="Leave empty to keep it until you remove it." error={errors.endsOn}>
            <Input
              type="date"
              value={form.endsOn}
              onChange={(event) => set("endsOn", event.target.value)}
              min={form.startsOn || undefined}
            />
          </FormField>
        </div>

        <fieldset className="min-w-0">
          <legend className="text-sm font-semibold text-fg">Where to show it</legend>
          <div className="mt-1 flex flex-col">
            <Checkbox
              checked={form.showOnSite}
              onChange={(event) => set("showOnSite", event.target.checked)}
              label="On the website"
            />
            <Checkbox
              checked={form.showOnTv}
              onChange={(event) => set("showOnTv", event.target.checked)}
              label="On the TV display"
            />
            <Checkbox
              checked={form.pinned}
              onChange={(event) => set("pinned", event.target.checked)}
              label="Pin to the top"
              description="Pinned announcements are shown before the others."
            />
          </div>
        </fieldset>

        <AnnouncementPreview {...form} status={formStatus(form, today)} />
      </form>
    </AdminDialog>
  );
}
