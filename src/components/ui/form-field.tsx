import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { WarningIcon } from "@/components/brand/icons";
import { cn } from "./cn";
import { Label } from "./label";

/** The attributes `FormField` sets on its control. Any input, select or textarea accepts them. */
export interface FieldControlProps {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
}

/**
 * Builds an `aria-describedby` value from the ids that are present.
 * Returns `undefined` when there are none, so the attribute is left out.
 */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const present = ids.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  return present.length > 0 ? present.join(" ") : undefined;
}

/** Normalises the error formats a form produces (one message, a list from zod, nothing) to a list. */
export function errorMessages(error: string | readonly string[] | null | undefined): string[] {
  if (error === null || error === undefined) return [];
  const list = typeof error === "string" ? [error] : error;
  return list.filter((message) => message.trim() !== "");
}

/** Props of {@link FormField}. */
export interface FormFieldProps {
  /** The visible label. Every field has one. */
  label: ReactNode;
  /** Help shown under the label, before the user makes a mistake. */
  hint?: ReactNode;
  /** Validation message(s). A non-empty value marks the control invalid. */
  error?: string | readonly string[] | null;
  /** Sets `required` on the control. */
  required?: boolean;
  /** Appends "(optional)" to the label. */
  optional?: boolean;
  /** Id for the control; generated when omitted. */
  id?: string;
  className?: string;
  /** Exactly one control: `Input`, `Textarea`, `Select`, or anything that accepts {@link FieldControlProps}. */
  children: ReactElement<FieldControlProps>;
}

/**
 * Label, hint, control and error message, wired together.
 *
 * It clones its single child to add `id`, `aria-describedby` (hint and error)
 * and `aria-invalid`, so the control is announced with its label, its help
 * and, when present, what is wrong with it.
 *
 * @example
 * <FormField label="Mosque name" hint="Shown in the header and on the TV." error={errors.mosqueName} required>
 *   <Input name="mosqueName" defaultValue={settings.mosqueName} />
 * </FormField>
 */
export function FormField({ label, hint, error, required, optional, id, className, children }: FormFieldProps) {
  const autoId = useId();
  const controlId = id ?? children.props.id ?? `${autoId}-control`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const messages = errorMessages(error);
  const errorId = messages.length > 0 ? `${controlId}-error` : undefined;

  const control = cloneElement(children, {
    id: controlId,
    required: children.props.required ?? required,
    "aria-describedby": describedBy(children.props["aria-describedby"], hintId, errorId),
    // Only set when there is an error: an explicit `undefined` would erase
    // the control's own invalid state.
    ...(messages.length > 0 ? { "aria-invalid": true } : null),
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId} optional={optional}>
        {label}
      </Label>
      {hint ? (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {control}
      {errorId ? (
        <div id={errorId} className="flex gap-1.5 text-sm font-medium text-danger-fg">
          <WarningIcon className="mt-0.5" size="1.125em" />
          <div>
            {messages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
