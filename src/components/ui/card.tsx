import type { ComponentProps, HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * `surface` is the default card. `raised` floats above it (menus, the
 * next-prayer panel), `sunken` recedes (wells, secondary groups) and
 * `outline` has no fill.
 */
export type CardVariant = "surface" | "raised" | "sunken" | "outline";

const VARIANTS: Record<CardVariant, string> = {
  surface: "border border-line bg-surface shadow-sm",
  raised: "border border-line bg-surface-raised shadow-md",
  sunken: "bg-surface-sunken",
  outline: "border border-line",
};

/** Props of {@link Card}. */
export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Use `section` or `article` when the card has a heading of its own. Defaults to `div`. */
  as?: "div" | "section" | "article" | "li";
  /** Defaults to `surface`. */
  variant?: CardVariant;
}

/**
 * A grouped block of content. Compose it from {@link CardHeader},
 * {@link CardBody} and {@link CardFooter}; they carry the padding.
 */
export function Card({ as: Tag = "div", variant = "surface", className, ...rest }: CardProps) {
  return <Tag className={cn("relative rounded-lg text-fg", VARIANTS[variant], className)} {...rest} />;
}

/** Top of a card: put a {@link CardTitle} (and {@link CardDescription}) first, actions last. */
export function CardHeader({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-6", className)} {...rest} />;
}

/** Props of {@link CardTitle}. */
export interface CardTitleProps extends ComponentProps<"h2"> {
  /** Heading level, chosen to fit the page outline. Defaults to `h2`. */
  as?: "h2" | "h3" | "h4";
}

/** The heading of a card, set in the display serif. */
export function CardTitle({ as: Tag = "h2", className, ...rest }: CardTitleProps) {
  return <Tag className={cn("font-display text-xl font-semibold tracking-tight text-fg", className)} {...rest} />;
}

/** One or two lines under the card title. */
export function CardDescription({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("mt-1 text-sm text-fg-muted", className)} {...rest} />;
}

/** The main content area of a card. */
export function CardBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...rest} />;
}

/** Bottom of a card, separated by a hairline: actions or a summary. */
export function CardFooter({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 sm:px-6", className)} {...rest} />;
}
