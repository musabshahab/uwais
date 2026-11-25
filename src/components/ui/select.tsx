import type { ComponentProps } from "react";
import { ChevronDownIcon } from "@/components/brand/icons";
import { cn } from "./cn";
import { controlClasses } from "./control";

/** Props of {@link Select}. */
export interface SelectProps extends ComponentProps<"select"> {
  /** Marks the field as failing validation. `FormField` sets this for you when it has an error. */
  invalid?: boolean;
  /** Classes for the wrapper (width, margin). `className` goes to the `<select>` itself. */
  wrapperClassName?: string;
}

/**
 * A native select with the system's own menu, which is the most usable
 * choice on phones and for assistive technology. Pass `<option>` children.
 */
export function Select({ invalid, className, wrapperClassName, children, ...rest }: SelectProps) {
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <select aria-invalid={invalid || undefined} className={controlClasses("appearance-none py-2 pr-10", className)} {...rest}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted" />
    </span>
  );
}
