import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Props of {@link Arabic}. */
export interface ArabicProps extends Omit<HTMLAttributes<HTMLElement>, "lang" | "dir"> {
  /** Element to render. Defaults to `span`. */
  as?: "span" | "div" | "p";
}

/**
 * Wraps Arabic text. The page language is English, so every piece of Arabic
 * must say so: `lang="ar"` makes screen readers switch voice and lets the
 * browser shape the script, `dir="rtl"` isolates it from the surrounding
 * left-to-right text, and the `arabic` class selects the Arabic typeface.
 *
 * @example <Arabic>{prayer.arabic}</Arabic>
 */
export function Arabic({ as: Tag = "span", className, ...rest }: ArabicProps) {
  return <Tag lang="ar" dir="rtl" className={cn("arabic", className)} {...rest} />;
}
