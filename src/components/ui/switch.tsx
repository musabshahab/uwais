import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";

/** Props of {@link Switch}. */
export interface SwitchProps extends Omit<ComponentProps<"input">, "type" | "role" | "children"> {
  /** Visible label. Without it, give the switch an `aria-label`. */
  label?: ReactNode;
  /** A line of help under the label. */
  description?: ReactNode;
}

/**
 * An on/off setting that takes effect as a state (show seconds, pin an
 * announcement). Use a `Checkbox` for agreeing to something or picking rows.
 *
 * It is a real checkbox with `role="switch"`: it submits with forms, works
 * without JavaScript, and Space toggles it. The thumb moves as well as
 * changing colour, so the state never depends on colour alone.
 */
export function Switch({ label, description, className, id, ...rest }: SwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  const control = (
    <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
      <input
        type="checkbox"
        role="switch"
        id={inputId}
        className="peer absolute -top-2 left-0 m-0 h-11 w-12 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...rest}
        // After the spread: the caller's own description is kept, with ours added to it.
        aria-describedby={cn(rest["aria-describedby"], descriptionId) || undefined}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none h-7 w-12 rounded-full border border-line-strong bg-surface-sunken transition-colors duration-base peer-checked:border-primary peer-checked:bg-primary peer-hover:border-fg-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1 size-5 rounded-full bg-fg-muted shadow-xs transition-transform duration-base ease-out peer-checked:translate-x-5 peer-checked:bg-on-primary peer-disabled:opacity-50"
      />
    </span>
  );

  if (!label) {
    return <span className={cn("inline-flex", className)}>{control}</span>;
  }

  return (
    <div className={cn("flex min-h-control items-start justify-between gap-4 py-2", className)}>
      <div className="min-w-0">
        <label htmlFor={inputId} className="block cursor-pointer text-base leading-7 font-medium text-fg">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
