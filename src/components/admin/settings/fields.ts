import type { JumuahRowState, SettingsFormState } from "@/lib/admin/settings-form";

/** Field errors of the last save, keyed by form field name. */
export type SettingsErrors = Readonly<Record<string, string>>;

/** Sets one scalar part of the form. */
export type SetSettingsField = <Key extends Exclude<keyof SettingsFormState, "jumuah">>(
  key: Key,
  value: SettingsFormState[Key],
) => void;

/** Sets one part of one Jumu'ah row. */
export type SetJumuahField = (row: number, part: keyof JumuahRowState, value: string) => void;

/** What every group of settings fields is given. */
export interface SettingsFieldsProps {
  form: SettingsFormState;
  errors: SettingsErrors;
  setField: SetSettingsField;
}
