import { describedBy } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { jumuahFieldName, type JumuahRowState } from "@/lib/admin/settings-form";
import type { SetJumuahField, SettingsErrors } from "./fields";

/** Props of {@link JumuahFields}. */
export interface JumuahFieldsProps {
  rows: readonly JumuahRowState[];
  errors: SettingsErrors;
  setJumuah: SetJumuahField;
}

const ORDINALS = ["First", "Second", "Third", "Fourth"];

/** What a row could be called, shown as the placeholder of its name. */
const SUGGESTED_LABELS = ["1st Jumu'ah", "2nd Jumu'ah", "3rd Jumu'ah", "4th Jumu'ah"];

/**
 * The default Jumu'ah times: up to four rows of a name and a time. A row
 * left completely empty is not saved.
 */
export function JumuahFields({ rows, errors, setJumuah }: JumuahFieldsProps) {
  const listError = errors.jumuah;
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Default Jumu&apos;ah times</legend>
      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const labelName = jumuahFieldName(index, "label");
          const timeName = jumuahFieldName(index, "time");
          const labelError = errors[labelName];
          const timeError = errors[timeName];
          const errorId = `${labelName}-error`;
          const ordinal = ORDINALS[index] ?? `Jumu'ah ${index + 1}`;
          return (
            <div key={index} role="group" aria-label={`${ordinal} Jumu'ah`}>
              <div className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={labelName} className="text-sm font-semibold text-fg">
                    {ordinal} Jumu&apos;ah <span className="font-normal text-fg-muted">name</span>
                  </label>
                  <Input
                    id={labelName}
                    name={labelName}
                    value={row.label}
                    onChange={(event) => setJumuah(index, "label", event.target.value)}
                    placeholder={SUGGESTED_LABELS[index]}
                    maxLength={40}
                    invalid={labelError !== undefined}
                    aria-describedby={describedBy(labelError || timeError ? errorId : null)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={timeName} className="text-sm font-semibold text-fg">
                    Time
                  </label>
                  <Input
                    id={timeName}
                    type="time"
                    name={timeName}
                    value={row.time}
                    onChange={(event) => setJumuah(index, "time", event.target.value)}
                    invalid={timeError !== undefined}
                    aria-describedby={describedBy(labelError || timeError ? errorId : null)}
                    className="time-numerals"
                  />
                </div>
              </div>
              {labelError || timeError ? (
                <p id={errorId} className="mt-1.5 text-sm font-medium text-danger-fg">
                  {[labelError, timeError].filter(Boolean).join(" ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {listError ? <p className="mt-2 text-sm font-medium text-danger-fg">{listError}</p> : null}
    </fieldset>
  );
}
