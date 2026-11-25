import type { ComponentProps } from "react";
import { LogoMark, type LogoTone } from "./logo";

/** Props of {@link Wordmark}. */
export interface WordmarkProps extends Omit<ComponentProps<"span">, "children"> {
  /** The mosque's name, from the site settings. */
  name: string;
  /** Optional second line, e.g. the tagline. */
  tagline?: string;
  /** Colour treatment of the mark. Defaults to `color`. */
  tone?: LogoTone;
}

/**
 * The lockup of the mark and the mosque's name.
 *
 * Everything is sized in `em`, so the whole lockup scales with the font size
 * of its container: `text-xl` in a site header, `tv-text-lg` on the TV. The
 * mark is decorative here because the name beside it is real text.
 */
export function Wordmark({ name, tagline, tone = "color", className, ...rest }: WordmarkProps) {
  return (
    <span className={className ? `wordmark ${className}` : "wordmark"} {...rest}>
      <LogoMark className="wordmark-mark" size="1.9em" tone={tone} detail="facets" />
      <span className="wordmark-text">
        <span className="wordmark-name">{name}</span>
        {tagline ? <span className="wordmark-tagline">{tagline}</span> : null}
      </span>
    </span>
  );
}
