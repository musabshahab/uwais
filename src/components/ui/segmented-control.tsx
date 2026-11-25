import type { ReactNode } from "react";
import { cn } from "./cn";

/** One choice of a {@link SegmentedControl}. */
export interface SegmentedOption<Value extends string> {
  value: Value;
  label: ReactNode;
  /** Optional icon before the label. */
  icon?: ReactNode;
  disabled?: boolean;
}

/** Props of {@link SegmentedControl}. */
export interface SegmentedControlProps<Value extends string> {
  /** Form field name; also groups the radios, so it must be unique on the page. */
  name: string;
  /** Names the group for screen readers ("Time format"). Hidden visually unless `showLabel` is set. */
  label: string;
  /** Two to four short options. For more, use a `Select`. */
  options: ReadonlyArray<SegmentedOption<Value>>;
  /** Controlled value. Use together with `onChange`. */
  value?: Value;
  /** Initial value when uncontrolled (the usual case inside a form). */
  defaultValue?: Value;
  /** Called with the newly chosen value. Only available from Client Components. */
  onChange?: (value: Value) => void;
  /** Shows the label above the control instead of hiding it. */
  showLabel?: boolean;
  /** Stretch the options across the full width. */
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * A single choice between a few options, shown side by side: 12h / 24h,
 * Night / Day, System / Light / Dark.
 *
 * Underneath it is a group of radio buttons, so arrow keys move the
 * selection, it submits with a form, and it works before JavaScript loads.
 *
 * @example
 * <SegmentedControl name="timeFormat" label="Time format" defaultValue={settings.timeFormat}
 *   options={[{ value: "12h", label: "12-hour" }, { value: "24h", label: "24-hour" }]} />
 */
export function SegmentedControl<Value extends string>({
  name,
  label,
  options,
  value,
  defaultValue,
  onChange,
  showLabel = false,
  fullWidth = false,
  disabled = false,
  className,
}: SegmentedControlProps<Value>) {
  const controlled = value !== undefined;

  return (
    <fieldset disabled={disabled} className={cn("min-w-0", fullWidth ? "block" : "inline-block", className)}>
      <legend className={showLabel ? "mb-1.5 text-sm font-semibold text-fg" : "sr-only"}>{label}</legend>
      <div className={cn("gap-1 rounded-md border border-line bg-surface-sunken p-1", fullWidth ? "flex" : "inline-flex")}>
        {options.map((option) => (
          <label key={option.value} className={cn("relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']", fullWidth && "flex-1")}>
            <input
              type="radio"
              name={name}
              value={option.value}
              disabled={option.disabled}
              className="peer sr-only"
              {...(controlled
                ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
                : { defaultChecked: defaultValue === option.value, onChange: onChange ? () => onChange(option.value) : undefined })}
            />
            <span className="flex min-h-9 items-center justify-center gap-2 rounded-sm px-3.5 text-sm font-semibold whitespace-nowrap text-fg-muted transition-colors duration-fast select-none peer-checked:bg-surface-raised peer-checked:text-fg peer-checked:shadow-sm peer-hover:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
              {option.icon}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
