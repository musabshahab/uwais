import { useId, type ComponentProps, type ReactNode } from "react";
import { CheckIcon } from "@/components/brand/icons";
import { cn } from "./cn";

/** Props of {@link Checkbox}. */
export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "children"> {
  /** Visible label. Without it, give the checkbox an `aria-label`. */
  label?: ReactNode;
  /** A line of help under the label. */
  description?: ReactNode;
}

/**
 * A checkbox. With `label` it renders the whole clickable row (at least 44px
 * tall); without it, just the box with a 44px touch target.
 *
 * The real `<input>` is kept (invisible, on top of the drawn box), so it
 * works in forms without JavaScript and keeps native keyboard behaviour.
 */
export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  const box = (
    <span className="relative inline-grid size-6 shrink-0 place-items-center">
      <input
        type="checkbox"
        id={inputId}
        className="peer absolute -top-2.5 -left-2.5 m-0 size-11 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...rest}
        // After the spread: the caller's own description is kept, with ours added to it.
        aria-describedby={cn(rest["aria-describedby"], descriptionId) || undefined}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none size-6 rounded-xs border-[1.5px] border-line-strong bg-surface-raised transition-colors duration-fast peer-checked:border-primary peer-checked:bg-primary peer-indeterminate:border-primary peer-indeterminate:bg-primary peer-hover:border-fg-muted peer-checked:peer-hover:border-primary-hover peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50 peer-aria-invalid:border-danger"
      />
      <CheckIcon size={16} strokeWidth={2.75} className="pointer-events-none absolute text-on-primary opacity-0 peer-checked:opacity-100" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-0.5 w-3 rounded-full bg-on-primary opacity-0 peer-indeterminate:opacity-100"
      />
    </span>
  );

  if (!label) {
    return <span className={cn("inline-flex", className)}>{box}</span>;
  }

  return (
    <div className={cn("flex min-h-control items-start gap-3 py-2.5", className)}>
      {box}
      <div className="min-w-0">
        <label htmlFor={inputId} className="block cursor-pointer text-base leading-6 font-medium text-fg">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
