import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SETTINGS_FIELD_NAMES as NAMES } from "@/lib/admin/settings-form";
import type { SettingsFieldsProps } from "./fields";

/** Longest short name the settings accept: what fits under an app icon. */
const SHORT_NAME_LENGTH = 12;

/** The mosque's name and how to reach it. */
export function DetailsFields({ form, errors, setField }: SettingsFieldsProps) {
  return (
    <>
      <FormField label="Mosque name" required error={errors[NAMES.mosqueName]}>
        <Input
          name={NAMES.mosqueName}
          value={form.mosqueName}
          onChange={(event) => setField("mosqueName", event.target.value)}
          maxLength={80}
          autoComplete="organization"
        />
      </FormField>
      <FormField
        label="Short name"
        required
        hint={`Up to ${SHORT_NAME_LENGTH} characters. It appears under the app icon when someone adds the website to their phone's home screen.`}
        error={errors[NAMES.shortName]}
      >
        <Input
          name={NAMES.shortName}
          value={form.shortName}
          onChange={(event) => setField("shortName", event.target.value)}
          maxLength={SHORT_NAME_LENGTH}
          className="max-w-56"
        />
      </FormField>
      <FormField label="Tagline" optional hint="A short line shown under the name." error={errors[NAMES.tagline]}>
        <Input
          name={NAMES.tagline}
          value={form.tagline}
          onChange={(event) => setField("tagline", event.target.value)}
          maxLength={140}
        />
      </FormField>
      <FormField label="Address" optional error={errors[NAMES.address]}>
        <Textarea
          name={NAMES.address}
          value={form.address}
          onChange={(event) => setField("address", event.target.value)}
          rows={3}
          maxLength={200}
          autoComplete="street-address"
        />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Phone number" optional error={errors[NAMES.phone]}>
          <Input
            type="tel"
            name={NAMES.phone}
            value={form.phone}
            onChange={(event) => setField("phone", event.target.value)}
            autoComplete="tel"
          />
        </FormField>
        <FormField label="Email address" optional error={errors[NAMES.email]}>
          <Input
            type="email"
            name={NAMES.email}
            value={form.email}
            onChange={(event) => setField("email", event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </FormField>
      </div>
      <FormField
        label="Map link"
        optional
        hint="A link to the mosque on a map, for directions. Copy it from the address bar of the map."
        error={errors[NAMES.mapUrl]}
      >
        <Input
          type="url"
          name={NAMES.mapUrl}
          value={form.mapUrl}
          onChange={(event) => setField("mapUrl", event.target.value)}
          placeholder="https://"
          autoCapitalize="none"
          spellCheck={false}
        />
      </FormField>
      <FormField
        label="Donation link"
        optional
        hint="Where the Donate button on the website leads. Leave it empty to hide the button."
        error={errors[NAMES.donateUrl]}
      >
        <Input
          type="url"
          name={NAMES.donateUrl}
          value={form.donateUrl}
          onChange={(event) => setField("donateUrl", event.target.value)}
          placeholder="https://"
          autoCapitalize="none"
          spellCheck={false}
        />
      </FormField>
    </>
  );
}
