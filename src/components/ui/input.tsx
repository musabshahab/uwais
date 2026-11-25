import type { ComponentProps } from "react";
import { controlClasses } from "./control";

/** Input types whose value is made of figures and should use tabular numerals. */
const NUMERIC_TYPES = new Set(["time", "date", "datetime-local", "month", "week", "number"]);

/** Props of {@link Input}. */
export interface InputProps extends ComponentProps<"input"> {
  /** Marks the field as failing validation. `FormField` sets this for you when it has an error. */
  invalid?: boolean;
}

/**
 * A single-line text field, 44px tall. Wrap it in `FormField` to give it a
 * label, a hint and an error message.
 */
export function Input({ invalid, className, type = "text", ...rest }: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={controlClasses("py-2 read-only:bg-surface-sunken", NUMERIC_TYPES.has(type) && "numerals", className)}
      {...rest}
    />
  );
}
