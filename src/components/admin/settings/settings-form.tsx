"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { saveSettingsAction } from "@/lib/actions/settings";
import type { ActionFailure, SaveSettingsState } from "@/lib/actions/types";
import { afterEditing } from "@/lib/admin/failures";
import { UNREACHABLE_FAILURE, isSignedOut, loginHref } from "@/lib/admin/session";
import {
  SETTINGS_FIELD_NAMES,
  jumuahFieldName,
  sectionsWithErrors,
  settingsFormsEqual,
  settingsToForm,
  type HijriPreview,
  type SettingsFormState,
} from "@/lib/admin/settings-form";
import { formatList } from "@/lib/admin/text";
import type { SiteSettings } from "@/lib/types";
import { failureMessage } from "../use-admin-action";
import { useLeaveGuard } from "../use-leave-guard";
import { DetailsFields } from "./details-fields";
import type { SetJumuahField, SetSettingsField, SettingsErrors } from "./fields";
import { JumuahFields } from "./jumuah-fields";
import { SettingsSection } from "./settings-section";
import { TimeFields } from "./time-fields";
import { TvFields } from "./tv-fields";

/** Props of {@link SettingsForm}. */
export interface SettingsFormProps {
  /** The settings as stored when the page was rendered. */
  settings: SiteSettings;
  /** Every timezone on offer, built on the server with the stored one among them. */
  timeZones: readonly string[];
  /** Today's Hijri date under each adjustment. */
  hijriPreviews: readonly HijriPreview[];
  /** Today's date in the mosque's timezone, written out. */
  todayLabel: string;
}

const NO_ERRORS: SettingsErrors = {};

/**
 * The settings form: four sections and one Save button.
 *
 * Every input is controlled and the form is sent as `FormData`, so nothing
 * typed is lost when a save is refused; the messages appear next to the
 * fields they belong to. The bar at the bottom always says where things
 * stand: unsaved changes, saving, saved, or what stopped the save.
 */
export function SettingsForm({ settings, timeZones, hijriPreviews, todayLabel }: SettingsFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState<SettingsFormState>(() => settingsToForm(settings));
  const [form, setForm] = useState<SettingsFormState>(saved);
  /** The last refused save, less the fields that have been edited since. */
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const errors = failure?.fieldErrors ?? NO_ERRORS;

  const [state, save, pending] = useActionState(
    async (previous: SaveSettingsState, formData: FormData): Promise<SaveSettingsState> => {
      let result: SaveSettingsState;
      try {
        result = await saveSettingsAction(previous, formData);
      } catch {
        result = UNREACHABLE_FAILURE;
      }
      if (result === null) return null;
      if (result.ok) {
        // The stored values come back tidied (trimmed, rows closed up): show those.
        const stored = settingsToForm(result.settings);
        setSaved(stored);
        setForm(stored);
        setFailure(null);
      } else {
        setFailure(result);
        if (isSignedOut(result)) router.push(loginHref(window.location.pathname, { expired: true }));
      }
      return result;
    },
    null,
  );

  /**
   * Sends the form as it stands. It is submitted from here and not through
   * the form's `action`, because React resets a form after its action and a
   * reset list (the timezone) then shows its first entry while the state
   * still holds the chosen one: the next save would store the wrong zone.
   */
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => save(data));
  };

  const dirty = !settingsFormsEqual(form, saved);
  useLeaveGuard(dirty);

  // After a refused save, take the user to the first field that needs attention.
  useEffect(() => {
    if (state === null || state.ok) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const setField: SetSettingsField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFailure((current) => afterEditing(current, (name) => name === SETTINGS_FIELD_NAMES[key]));
  };
  const setJumuah: SetJumuahField = (row, part, value) => {
    setForm((current) => ({
      ...current,
      jumuah: current.jumuah.map((slot, index) => (index === row ? { ...slot, [part]: value } : slot)),
    }));
    setFailure((current) => afterEditing(current, (name) => name === jumuahFieldName(row, part) || name === "jumuah"));
  };
  const discard = () => {
    setForm(saved);
    setFailure(null);
  };

  const sections = sectionsWithErrors(errors);
  const justSaved = state?.ok === true && !dirty;

  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      {failure ? (
        <Alert tone="danger" title="The settings were not saved" announce className="mb-8">
          {failureMessage(failure)}
          {sections.length > 0 ? ` Look in: ${formatList(sections)}.` : null}
        </Alert>
      ) : null}

      <SettingsSection
        id="details"
        title="Mosque details"
        description="The name and contact details shown on the website, the TV display and the printed timetable."
      >
        <DetailsFields form={form} errors={errors} setField={setField} />
      </SettingsSection>

      <SettingsSection
        id="time"
        title="Time and calendar"
        description="Which clock the prayer times are on, how they are written, and how the Hijri date is worked out."
      >
        <TimeFields
          form={form}
          errors={errors}
          setField={setField}
          timeZones={timeZones}
          hijriPreviews={hijriPreviews}
          todayLabel={todayLabel}
        />
      </SettingsSection>

      <SettingsSection
        id="jumuah"
        title="Jumu'ah"
        description="The usual Jumu'ah times, shown every Friday unless that Friday has its own times in the timetable. Leave a row empty if you do not need it."
      >
        <JumuahFields rows={form.jumuah} errors={errors} setJumuah={setJumuah} />
      </SettingsSection>

      <SettingsSection
        id="tv"
        title="TV display"
        description="How the screens in the mosque look. A single screen can still differ: see the TV display card on the overview."
      >
        <TvFields form={form} errors={errors} setField={setField} />
      </SettingsSection>

      <div className="sticky bottom-0 z-10 -mx-gutter mt-2 border-t border-line bg-surface-raised px-gutter py-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Status tone={failure ? "danger" : justSaved ? "success" : dirty ? "warning" : "neutral"} className="min-h-6">
            {pending
              ? "Saving the settings"
              : failure
                ? failure.fieldErrors
                  ? "Not saved. Check the marked fields."
                  : "Not saved."
                : justSaved
                  ? "Saved. The website and the TV display now use these settings."
                  : dirty
                    ? "You have changes that are not saved yet."
                    : null}
          </Status>
          <div className="ml-auto flex gap-3">
            <Button variant="ghost" onClick={discard} disabled={!dirty || pending}>
              Discard changes
            </Button>
            <Button type="submit" loading={pending} loadingLabel="Saving">
              Save settings
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
