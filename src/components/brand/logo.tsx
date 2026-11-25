import type { ComponentProps } from "react";
import { MARK_ACCENT_FACET, MARK_VIEWBOX, markFacetPaths, markSlicePath, markSolidPath } from "./geometry";

const FACET_PATHS = markFacetPaths();
const SOLID_PATH = markSolidPath();
const ACCENT_SLICE_PATH = markSlicePath(MARK_ACCENT_FACET);

/** Below this pixel size the slits between facets are thinner than a pixel, so the compact star is drawn instead. */
const SOLID_BELOW_PX = 28;

/** `color` uses the theme's mark colour with one brass facet; `mono` draws everything in the current text colour. */
export type LogoTone = "color" | "mono";

/** `facets` draws the full mark of eight separate facets, `solid` the compact one-piece star; `auto` picks by pixel size. */
export type LogoDetail = "auto" | "facets" | "solid";

/** Props of {@link LogoMark}. */
export interface LogoMarkProps extends Omit<ComponentProps<"svg">, "children" | "viewBox" | "width" | "height"> {
  /** Width and height: a number of pixels or any CSS length such as `1.5em`. Defaults to 32. */
  size?: number | string;
  /** Defaults to `color`. */
  tone?: LogoTone;
  /** Defaults to `auto`. */
  detail?: LogoDetail;
  /** Accessible name. Omit it when the mark sits next to the mosque name, and it is hidden from assistive technology. */
  title?: string;
}

/**
 * The Uwais mark: an eight-fold star of eight facets around an open eye.
 *
 * It needs no stylesheet to render correctly (colours fall back to the text
 * colour), so it is safe on the TV page in old browsers.
 */
export function LogoMark({ size = 32, tone = "color", detail = "auto", title, style, ...rest }: LogoMarkProps) {
  const solid = detail === "solid" || (detail === "auto" && typeof size === "number" && size < SOLID_BELOW_PX);
  const star = tone === "color" ? "var(--mark, currentColor)" : "currentColor";
  const accent = tone === "color" ? "var(--accent, currentColor)" : star;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ flex: "none", ...style }}
      {...rest}
    >
      {solid ? (
        <>
          <path fill={star} fillRule="evenodd" d={SOLID_PATH} />
          {tone === "color" ? <path fill={accent} d={ACCENT_SLICE_PATH} /> : null}
        </>
      ) : (
        FACET_PATHS.map((d, index) => <path key={d} fill={index === MARK_ACCENT_FACET ? accent : star} d={d} />)
      )}
    </svg>
  );
}
