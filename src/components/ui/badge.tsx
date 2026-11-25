import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Meaning of a badge. `accent` is for "now" and "next"; status tones mean what they say. */
export type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

/** `soft` is a tint with readable text (default); `solid` is a full fill for the one badge that must stand out. */
export type BadgeVariant = "soft" | "solid";

const SOFT: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-sunken text-fg-muted",
  brand: "border-brand-line bg-brand-soft text-brand-fg",
  accent: "border-accent-line bg-accent-soft text-accent-fg",
  success: "border-success-line bg-success-soft text-success-fg",
  warning: "border-warning-line bg-warning-soft text-warning-fg",
  danger: "border-danger-line bg-danger-soft text-danger-fg",
  info: "border-info-line bg-info-soft text-info-fg",
};

const SOLID: Record<BadgeTone, string> = {
  neutral: "border-transparent bg-fg text-canvas",
  brand: "border-transparent bg-brand text-on-brand",
  accent: "border-transparent bg-accent text-on-accent",
  success: "border-transparent bg-success text-on-success",
  warning: "border-transparent bg-warning text-on-warning",
  danger: "border-transparent bg-danger text-on-danger",
  info: "border-transparent bg-info text-on-info",
};

/** Props of {@link Badge}. */
export interface BadgeProps extends ComponentProps<"span"> {
  /** Defaults to `neutral`. */
  tone?: BadgeTone;
  /** Defaults to `soft`. */
  variant?: BadgeVariant;
}

/**
 * A short status label ("Next", "Pinned", "3 errors"). Keep it to a word or
 * two; the tone must repeat what the text already says, never replace it.
 */
export function Badge({ tone = "neutral", variant = "soft", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        variant === "solid" ? SOLID[tone] : SOFT[tone],
        className,
      )}
      {...rest}
    />
  );
}
