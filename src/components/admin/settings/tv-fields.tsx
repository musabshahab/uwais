import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { SETTINGS_FIELD_NAMES as NAMES } from "@/lib/admin/settings-form";
import type { SettingsFieldsProps } from "./fields";

const THEME_OPTIONS = [
  { value: "night", label: "Night (dark)" },
  { value: "day", label: "Day (light)" },
] as const;

/** How the screens in the mosque look and behave, unless a screen's own address says otherwise. */
export function TvFields({ form, errors, setField }: SettingsFieldsProps) {
  return (
    <>
      <SegmentedControl
        name={NAMES.tvTheme}
        label="Theme"
        showLabel
        options={THEME_OPTIONS}
        value={form.tvTheme}
        onChange={(theme) => setField("tvTheme", theme)}
      />
      <div className="flex flex-col divide-y divide-line">
        <Switch
          name={NAMES.tvShowSeconds}
          checked={form.tvShowSeconds}
          onChange={(event) => setField("tvShowSeconds", event.target.checked)}
          label="Show seconds on the clock"
          description="Handy when people set their watches by it; switch it off for a calmer screen."
          className="py-3"
        />
        <Switch
          name={NAMES.tvShowSunrise}
          checked={form.tvShowSunrise}
          onChange={(event) => setField("tvShowSunrise", event.target.checked)}
          label="Show the sunrise row"
          className="py-3"
        />
      </div>
      <FormField
        label="Jamaat in progress screen (minutes)"
        hint="After each jamaat time the screen asks people to silence their phones for this long. 0 to 60; enter 0 to switch it off."
        error={errors[NAMES.tvJamaatInProgressMinutes]}
      >
        <Input
          name={NAMES.tvJamaatInProgressMinutes}
          value={form.tvJamaatInProgressMinutes}
          onChange={(event) => setField("tvJamaatInProgressMinutes", event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          className="numerals max-w-32"
        />
      </FormField>
      <FormField
        label="Time per announcement (seconds)"
        hint="How long each announcement stays on the screen before the next one. 5 to 120."
        error={errors[NAMES.tvAnnouncementSeconds]}
      >
        <Input
          name={NAMES.tvAnnouncementSeconds}
          value={form.tvAnnouncementSeconds}
          onChange={(event) => setField("tvAnnouncementSeconds", event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          className="numerals max-w-32"
        />
      </FormField>
    </>
  );
}
