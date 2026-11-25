import { useId } from "react";
import { LATTICE_TILE, MARK_VIEWBOX, latticeTilePath, markSolidPath } from "./geometry";

const TILE_PATH = latticeTilePath();
const STAR_PATH = markSolidPath();

const TONE_COLOR = {
  accent: "var(--accent)",
  brand: "var(--brand-fg)",
  ink: "var(--fg)",
} as const;

/** Which theme colour the lattice is drawn in. */
export type LatticeTone = keyof typeof TONE_COLOR;

/** Where the lattice dissolves: towards the bottom, the top, outwards from the centre, or nowhere. */
export type LatticeFade = "none" | "down" | "up" | "edges";

/** Props of {@link Lattice}. */
export interface LatticeProps {
  /** Side of one repeat in pixels (or any CSS length understood by SVG). Defaults to 96. */
  tile?: number;
  /** Line width in pixels. Defaults to 1. */
  strokeWidth?: number;
  /** Defaults to `accent`. */
  tone?: LatticeTone;
  /** 0 to 1. Keep it low: the lattice is a texture, not a picture. Defaults to 0.16. */
  opacity?: number;
  /** Defaults to `none`. */
  fade?: LatticeFade;
  className?: string;
}

/**
 * The eight-fold lattice as a background layer.
 *
 * Put it first inside a `position: relative` container; it fills the
 * container, sits behind the content and ignores the pointer. It is a single
 * small SVG pattern, so it costs nothing to repeat over a 4K screen, and it
 * uses no CSS that old TV browsers lack.
 */
export function Lattice({ tile = LATTICE_TILE, strokeWidth = 1, tone = "accent", opacity = 0.16, fade = "none", className }: LatticeProps) {
  const id = useId();
  const patternId = `${id}-lattice`;
  const gradientId = `${id}-fade`;
  const maskId = `${id}-mask`;
  const scale = tile / LATTICE_TILE;

  return (
    <svg
      className={className ? `lattice ${className}` : "lattice"}
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      style={{ color: TONE_COLOR[tone] }}
    >
      <defs>
        <pattern id={patternId} width={LATTICE_TILE} height={LATTICE_TILE} patternUnits="userSpaceOnUse" patternTransform={`scale(${scale})`}>
          <path d={TILE_PATH} fill="none" stroke="currentColor" strokeWidth={strokeWidth / scale} strokeLinejoin="round" />
        </pattern>
        {fade === "edges" ? (
          <radialGradient id={gradientId} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        ) : fade !== "none" ? (
          <linearGradient id={gradientId} x1="0" x2="0" y1={fade === "down" ? "0" : "1"} y2={fade === "down" ? "1" : "0"}>
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        ) : null}
        {fade !== "none" ? (
          <mask id={maskId} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill={`url(#${gradientId})`} />
          </mask>
        ) : null}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} opacity={opacity} mask={fade !== "none" ? `url(#${maskId})` : undefined} />
    </svg>
  );
}

/** Props of {@link OrnamentRule}. */
export interface OrnamentRuleProps {
  className?: string;
}

/**
 * A horizontal rule broken by a small star, after the rosettes that mark
 * verse endings in manuscripts. Use it between major sections, sparingly.
 */
export function OrnamentRule({ className }: OrnamentRuleProps) {
  return (
    <div className={className ? `ornament-rule ${className}` : "ornament-rule"} role="separator">
      <svg viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`} width="0.9em" height="0.9em" aria-hidden="true" focusable="false">
        <path fill="currentColor" fillRule="evenodd" d={STAR_PATH} />
      </svg>
    </div>
  );
}
