import type { ReactNode } from "react";
import { CheckIcon, InfoIcon, WarningIcon, type IconComponent } from "@/components/brand/icons";
import { cn } from "./cn";

/** Meaning of the message. `danger` interrupts the screen reader; the others wait for a pause. */
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<StatusTone, { text: string; icon: IconComponent | null }> = {
  neutral: { text: "text-fg-muted", icon: null },
  success: { text: "text-success-fg", icon: CheckIcon },
  warning: { text: "text-warning-fg", icon: WarningIcon },
  danger: { text: "text-danger-fg", icon: WarningIcon },
  info: { text: "text-info-fg", icon: InfoIcon },
};

/** Props of {@link Status}. */
export interface StatusProps {
  /** Defaults to `neutral`. */
  tone?: StatusTone;
  /** The message. Render the component always and pass `null` when there is nothing to say. */
  children?: ReactNode;
  className?: string;
}

/**
 * An inline live region for the result of an action: "Saved", "Imported 31
 * days", "Could not reach the server".
 *
 * Keep it mounted and change its children. Screen readers only announce
 * changes inside a live region that already existed, so a region that is
 * added together with its message is often missed.
 *
 * @example <Status tone={state.ok ? "success" : "danger"}>{state.message}</Status>
 */
export function Status({ tone = "neutral", children, className }: StatusProps) {
  const { text, icon: Icon } = TONES[tone];
  const hasMessage = children !== null && children !== undefined && children !== false && children !== "";

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(hasMessage && "flex items-start gap-1.5 text-sm font-medium", hasMessage && text, className)}
    >
      {hasMessage ? (
        <>
          {Icon ? <Icon className="mt-0.5" size="1.125em" /> : null}
          <span>{children}</span>
        </>
      ) : null}
    </div>
  );
}
