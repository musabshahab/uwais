import { cn } from "./cn";

/**
 * Looks shared by text inputs, text areas and selects, so every field has
 * the same height, border and focus treatment.
 *
 * The outline of a control is `line-strong` because a field's boundary is
 * the only thing that shows where to tap, and WCAG asks for 3:1 there.
 */
const CONTROL =
  "block w-full min-h-control rounded-md border border-line-strong bg-surface-raised px-3.5 text-base text-fg shadow-xs transition-colors duration-fast placeholder:text-fg-subtle hover:border-fg-muted focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger disabled:bg-surface-sunken disabled:text-fg-subtle disabled:shadow-none disabled:hover:border-line-strong";

/** Class list of a form control; extra classes are appended. */
export function controlClasses(...extra: Parameters<typeof cn>): string {
  return cn(CONTROL, ...extra);
}
