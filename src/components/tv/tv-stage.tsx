import { useId, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";
import { LATTICE_TILE, latticeTilePath } from "@/components/brand/geometry";
import { cn } from "@/components/ui/cn";
import type { TvRotation } from "@/lib/tv/options";
import type { TvTheme } from "@/lib/types";

/** Props of {@link TvStage}. */
export interface TvStageProps {
  /** Colours of the screen. Defaults to `night`. */
  theme?: TvTheme;
  /** Clockwise rotation of the picture, for a screen mounted sideways or upside down. */
  rotate?: TvRotation;
  /** Extra margin on every side as a fraction of the screen, 0 to 0.1. */
  insetFraction?: number;
  /** Show the mouse cursor (somebody is using the pointer). */
  cursorVisible?: boolean;
  /** Extra classes for the stage. */
  className?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  onMouseMove?: MouseEventHandler<HTMLElement>;
  children: ReactNode;
}

/** Props of {@link TvFrame}. */
export interface TvFrameProps {
  /** Hide the frame from assistive technology (a loading placeholder). */
  hidden?: boolean;
  children: ReactNode;
}

/**
 * The lattice is drawn in a square of this many units and scaled to cover
 * the screen, so one repeat is the same share of a 720p and a 4K picture, in
 * landscape and in portrait.
 */
const BACKDROP_UNITS = 1600;

const TILE_PATH = latticeTilePath();

/**
 * The eight-fold lattice behind the TV page. The shared `Lattice` component
 * sizes its repeat in pixels, which would look half as large on a 4K screen;
 * this one is drawn in a `viewBox`, so it scales with the picture.
 */
function TvBackdrop() {
  const patternId = `${useId()}-lattice`;
  return (
    <svg
      className="tvx-backdrop"
      viewBox={`0 0 ${BACKDROP_UNITS} ${BACKDROP_UNITS}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={patternId}
          width={LATTICE_TILE}
          height={LATTICE_TILE}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={TILE_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </pattern>
      </defs>
      <rect width={BACKDROP_UNITS} height={BACKDROP_UNITS} fill={`url(#${patternId})`} />
    </svg>
  );
}

/**
 * The full-screen root of every TV screen (the display, its loading
 * placeholder and its error screen): theme, rotation, overscan margin and
 * the lattice backdrop. Everything inside is sized in `--tv-u` units, which
 * the stage scales down by the extra margin.
 *
 * Works in Server and Client Components.
 */
export function TvStage({
  theme = "night",
  rotate = 0,
  insetFraction = 0,
  cursorVisible = false,
  className,
  onClick,
  onMouseMove,
  children,
}: TvStageProps) {
  // A custom property, which the CSSProperties type does not know.
  const style = { "--tvx-inset": String(insetFraction) } as CSSProperties;
  const sideways = rotate === 90 || rotate === 270;
  return (
    <main
      className={cn(
        "tv-stage tvx-stage",
        `tvx-rotate-${rotate}`,
        sideways ? "tvx-sideways" : "tvx-upright",
        cursorVisible && "tvx-stage-pointer",
        className,
      )}
      data-tv-theme={theme}
      style={style}
      onClick={onClick}
      onMouseMove={onMouseMove}
    >
      <TvBackdrop />
      {children}
    </main>
  );
}

/**
 * The area of the stage that holds content: inside the overscan margin, laid
 * out as the side column, the timetable and the footer band (side by side in
 * landscape, stacked in portrait). It drifts by a few pixels over minutes so
 * that nothing rests on the same pixels all day.
 */
export function TvFrame({ hidden = false, children }: TvFrameProps) {
  return (
    <div className="tvx-frame tv-drift" aria-hidden={hidden ? true : undefined}>
      {children}
    </div>
  );
}
