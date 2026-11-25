/**
 * Renders the Uwais mark as a standalone SVG document string.
 *
 * React is not involved: the app-icon generator (`scripts/generate-icons.ts`)
 * rasterises these strings with sharp, and `src/app/icon.svg` is one of them
 * written to disk.
 */
import {
  MARK_ACCENT_FACET,
  MARK_COMPACT_SPEC,
  MARK_SPEC,
  MARK_VIEWBOX,
  markFacetPaths,
  markSlicePath,
  markSolidPath,
  round,
} from "./geometry";

/**
 * Radius, as a fraction of the icon's side, inside which a maskable icon must
 * keep everything that matters. Launchers may crop anything outside it.
 * https://www.w3.org/TR/appmanifest/#icon-masks
 */
export const MASKABLE_SAFE_RADIUS = 0.4;

/** `facets` is the full mark of eight separate facets; `solid` is the compact one-piece star for small sizes. */
export type MarkDetail = "facets" | "solid";

/** Options for {@link renderMarkSvg}. */
export interface MarkSvgOptions {
  /** Width and height of the SVG in pixels. */
  readonly size: number;
  /** Fill of the star. */
  readonly foreground: string;
  /** Fill of the highlighted facet; omit for a single-colour mark. */
  readonly accent?: string;
  /** Fill of the square behind the mark; omit for a transparent background. */
  readonly background?: string;
  /** Side of the mark's own box as a fraction of the icon (0 to 1). Defaults to 1. */
  readonly scale?: number;
  /** Corner radius of the background as a fraction of the icon's side (0 to 0.5). Defaults to 0. */
  readonly cornerRadius?: number;
  /** Defaults to `facets`. */
  readonly detail?: MarkDetail;
}

/**
 * How far the tips of the mark reach from the centre of the icon, as a
 * fraction of the icon's side, when the mark is drawn at `scale`.
 */
export function markReach(scale: number, detail: MarkDetail = "facets"): number {
  const spec = detail === "solid" ? MARK_COMPACT_SPEC : MARK_SPEC;
  return (spec.outer / MARK_VIEWBOX) * scale;
}

/** True when a mark drawn at `scale` stays inside the maskable safe zone. */
export function fitsMaskableSafeZone(scale: number, detail: MarkDetail = "facets"): boolean {
  return markReach(scale, detail) <= MASKABLE_SAFE_RADIUS;
}

/**
 * Builds the SVG markup for the mark.
 * @throws RangeError when `size`, `scale` or `cornerRadius` is out of range.
 */
export function renderMarkSvg(options: MarkSvgOptions): string {
  const { size, foreground, accent, background, scale = 1, cornerRadius = 0, detail = "facets" } = options;
  if (!(size > 0)) throw new RangeError("size must be a positive number");
  if (!(scale > 0 && scale <= 1)) throw new RangeError("scale must be greater than 0 and at most 1");
  if (!(cornerRadius >= 0 && cornerRadius <= 0.5)) throw new RangeError("cornerRadius must be between 0 and 0.5");

  const offset = round((MARK_VIEWBOX * (1 - scale)) / 2);
  const transform = scale === 1 ? "" : ` transform="translate(${offset} ${offset}) scale(${round(scale * 1000) / 1000})"`;

  const shapes: string[] = [];
  if (detail === "solid") {
    shapes.push(`<path fill="${foreground}" fill-rule="evenodd" d="${markSolidPath()}"/>`);
    if (accent) shapes.push(`<path fill="${accent}" d="${markSlicePath(MARK_ACCENT_FACET)}"/>`);
  } else {
    markFacetPaths().forEach((d, index) => {
      const fill = accent && index === MARK_ACCENT_FACET ? accent : foreground;
      shapes.push(`<path fill="${fill}" d="${d}"/>`);
    });
  }

  const backdrop = background
    ? `<rect width="${MARK_VIEWBOX}" height="${MARK_VIEWBOX}" rx="${round(cornerRadius * MARK_VIEWBOX)}" fill="${background}"/>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}">` +
    backdrop +
    `<g${transform}>${shapes.join("")}</g>` +
    `</svg>`
  );
}
