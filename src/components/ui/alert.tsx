import type { ComponentProps, ReactNode } from "react";
import { CheckIcon, InfoIcon, WarningIcon, type IconComponent } from "@/components/brand/icons";
import { cn } from "./cn";

/** What kind of message this is. */
export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, { box: string; accent: string; icon: IconComponent }> = {
  info: { box: "border-info-line bg-info-soft", accent: "text-info-fg", icon: InfoIcon },
  success: { box: "border-success-line bg-success-soft", accent: "text-success-fg", icon: CheckIcon },
  warning: { box: "border-warning-line bg-warning-soft", accent: "text-warning-fg", icon: WarningIcon },
  danger: { box: "border-danger-line bg-danger-soft", accent: "text-danger-fg", icon: WarningIcon },
};

/** Props of {@link Alert}. */
export interface AlertProps extends Omit<ComponentProps<"div">, "title" | "role"> {
  /** Defaults to `info`. */
  tone?: AlertTone;
  /** A short summary in bold. */
  title?: ReactNode;
  /** Buttons or links shown under the message. */
  actions?: ReactNode;
  /**
   * Set this when the alert appears in response to something the user did
   * (a failed import), so screen readers announce it: errors and warnings
   * interrupt, the rest wait their turn. Leave it off for messages that are
   * part of the page from the start.
   */
  announce?: boolean;
}

/**
 * A message block inside the page flow. For a brief confirmation after an
 * action use `Status` instead.
 */
export function Alert({ tone = "info", title, actions, announce = false, className, children, ...rest }: AlertProps) {
  const { box, accent, icon: Icon } = TONES[tone];
  const role = announce ? (tone === "danger" || tone === "warning" ? "alert" : "status") : undefined;

  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border px-4 py-3.5 text-fg", box, className)} {...rest}>
      <Icon className={cn("mt-0.5", accent)} size="1.375em" />
      <div className="min-w-0 flex-1">
        {title ? <p className={cn("font-semibold", accent)}>{title}</p> : null}
        {children ? <div className={cn("text-base", title ? "mt-0.5" : undefined)}>{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
