import type { ComponentProps } from "react";
import { controlClasses } from "./control";

/** Props of {@link Textarea}. */
export interface TextareaProps extends ComponentProps<"textarea"> {
  /** Marks the field as failing validation. `FormField` sets this for you when it has an error. */
  invalid?: boolean;
}

/** A multi-line text field that the user can resize vertically. */
export function Textarea({ invalid, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={controlClasses("resize-y py-2.5 leading-normal read-only:bg-surface-sunken", className)}
      {...rest}
    />
  );
}
