import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Props of {@link Label}. */
export interface LabelProps extends ComponentProps<"label"> {
  /** Appends "(optional)". Mark the few optional fields instead of starring every required one. */
  optional?: boolean;
}

/** The visible name of a form control. Always pair it with the control through `htmlFor`. */
export function Label({ optional = false, className, children, ...rest }: LabelProps) {
  return (
    <label className={cn("block text-sm font-semibold text-fg", className)} {...rest}>
      {children}
      {optional ? <span className="ml-1.5 font-normal text-fg-muted">(optional)</span> : null}
    </label>
  );
}
