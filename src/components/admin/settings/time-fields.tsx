import { cn } from "@/components/ui/cn";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { SETTINGS_FIELD_NAMES as NAMES, type HijriPreview } from "@/lib/admin/settings-form";
import type { SettingsFieldsProps } from "./fields";
import { TimeZoneField } from "./time-zone-field";

const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour (5:07 PM)" },
  { value: "24h", label: "24-hour (17:07)" },
] as const;

/** Props of {@link TimeFields}. */
export interface TimeFieldsProps extends SettingsFieldsProps {
  /** Every timezone on offer, built on the server. */
  timeZones: readonly string[];
  /** Today's Hijri date under each adjustment, worked out on the server. */
  hijriPreviews: readonly HijriPreview[];
  /** Today's date in the mosque's timezone, written out. */
  todayLabel: string;
}

/** The clock and the calendar: timezone, 12 or 24 hours, and the Hijri date. */
export function TimeFields({ form, errors, setField, timeZones, hijriPreviews, todayLabel }: TimeFieldsProps) {
  const adjustmentError = errors[NAMES.hijriAdjustment];
  return (
    <>
      <TimeZoneField
        name={NAMES.timezone}
        zones={timeZones}
        value={form.timezone}
        onChange={(zone) => setField("timezone", zone)}
        error={errors[NAMES.timezone]}
      />

      <SegmentedControl
        name={NAMES.timeFormat}
        label="How times are written"
        showLabel
        options={TIME_FORMAT_OPTIONS}
        value={form.timeFormat}
        onChange={(format) => setField("timeFormat", format)}
      />

      <fieldset className="min-w-0" aria-describedby="hijri-adjustment-hint">
        <legend className="text-sm font-semibold text-fg">Hijri date</legend>
        <p id="hijri-adjustment-hint" className="mt-1.5 text-sm text-fg-muted">
          The Hijri date is calculated, so it can be a day or two away from the local moon sighting. Pick the line
          that shows the right date for today, {todayLabel}.
        </p>
        <div className="mt-3 flex flex-col overflow-hidden rounded-md border border-line-strong bg-surface-raised">
          {hijriPreviews.map((preview) => {
            const checked = form.hijriAdjustment === preview.value;
            return (
              <label
                key={preview.value}
                className={cn(
                  "relative flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 border-line px-3.5 py-2.5 not-last:border-b",
                  "has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-ring",
                  checked && "bg-brand-soft",
                )}
              >
                <input
                  type="radio"
                  name={NAMES.hijriAdjustment}
                  value={preview.value}
                  checked={checked}
                  onChange={() => setField("hijriAdjustment", preview.value)}
                  className="size-5 shrink-0 accent-primary outline-none"
                />
                <span className="numerals flex-1 text-base font-semibold text-fg">{preview.hijri}</span>
                <span className="text-sm text-fg-muted">{preview.label}</span>
              </label>
            );
          })}
        </div>
        {adjustmentError ? <p className="mt-1.5 text-sm font-medium text-danger-fg">{adjustmentError}</p> : null}
      </fieldset>

      <Switch
        name={NAMES.hijriRollAtMaghrib}
        checked={form.hijriRollAtMaghrib}
        onChange={(event) => setField("hijriRollAtMaghrib", event.target.checked)}
        label="Change the Hijri date at Maghrib"
        description="The Islamic day begins at sunset. Switch this on and the Hijri date moves on at Maghrib each evening; switch it off and it changes at midnight."
      />
    </>
  );
}
