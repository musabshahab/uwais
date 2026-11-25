import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Props of {@link VisuallyHidden}. */
export interface VisuallyHiddenProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Defaults to `span`. */
  as?: "span" | "div" | "p" | "h2" | "h3";
}

/**
 * Content for screen readers only: it takes no space and cannot be seen, but
 * is still read out. Use it to name a control or give a table a caption.
 */
export function VisuallyHidden({ as: Tag = "span", className, ...rest }: VisuallyHiddenProps) {
  return <Tag className={cn("sr-only", className)} {...rest} />;
}
