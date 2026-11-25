import { CloseIcon } from "@/components/brand/icons";
import { cn } from "@/components/ui/cn";
import { controlClasses } from "@/components/ui/control";

/** Props of {@link TimeField}. */
export interface TimeFieldProps {
  id: string;
  /** The visible label, e.g. `Begins`. */
  label: string;
  /** The whole name for assistive technology and the clear button, e.g. `Fajr begins`. */
  fullLabel: string;
  /** `HH:mm`, or empty for "no time". */
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/**
 * A time of day with its own Clear button. Browsers differ in whether a time
 * input can be emptied at all, and "no time" is a real answer here, so the
 * button is always offered when the field holds a value.
 */
export function TimeField({ id, label, fullLabel, value, onChange, error }: TimeFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm text-fg-muted">
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{fullLabel}</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type="time"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          // The browser's own picker button would sit under the Clear button; the field itself still opens the picker on touch.
          className={controlClasses("time-numerals py-2 pr-11 pl-3 [&::-webkit-calendar-picker-indicator]:hidden")}
        />
        <button
          type="button"
          aria-label={`Clear ${fullLabel}`}
          title="Clear"
          onClick={() => onChange("")}
          className={cn(
            "absolute inset-y-0 right-0 grid w-11 place-items-center rounded-md text-fg-muted transition-colors duration-fast hover:text-fg",
            value === "" && "invisible",
          )}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
