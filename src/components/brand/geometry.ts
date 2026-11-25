/**
 * Geometry of the Uwais mark and lattice.
 *
 * The mark is an eight-fold star cut into eight facets around an octagonal
 * eye; the lattice is the same star repeated on a square grid and tied
 * together with small squares. Both are constructed here, from one set of
 * proportions, so the logo, the background pattern and the generated app
 * icons can never drift apart. This module is pure (no React, no DOM) because
 * the icon generator script imports it too.
 */

/** A point in SVG user space. */
export type Point = readonly [x: number, y: number];

/** Proportions of a faceted star, in SVG user units. */
export interface StarSpec {
  /** Number of points of the star. */
  readonly tips: number;
  /** Radius of the tips. */
  readonly outer: number;
  /** Radius of the notches between two tips. */
  readonly valley: number;
  /** Radius of the open eye in the middle (measured to its vertices). */
  readonly eye: number;
  /** Width of the slit between two neighbouring facets. */
  readonly gap: number;
  /** x and y of the centre. */
  readonly centre: number;
}

/** Side of the square viewBox the mark is drawn in. */
export const MARK_VIEWBOX = 100;

/** The proportions of the Uwais mark. */
export const MARK_SPEC: StarSpec = {
  tips: 8,
  outer: 46,
  valley: 30.5,
  eye: 16,
  gap: 3.4,
  centre: MARK_VIEWBOX / 2,
};

/**
 * The proportions of the compact mark, drawn where the mark is smaller than
 * about 28 px (favicons, inline ornaments).
 *
 * At that size the slits of the full mark are thinner than a pixel, and the
 * standard notches and eye close up into something that reads as a cog. The
 * compact mark is one solid star with deeper notches and a smaller eye, which
 * keeps eight sharp points all the way down to 16 px.
 */
export const MARK_COMPACT_SPEC: StarSpec = {
  tips: 8,
  outer: 48,
  valley: 24,
  eye: 10,
  gap: 0,
  centre: MARK_VIEWBOX / 2,
};

/**
 * Index of the facet drawn in brass in the two-colour mark, counted clockwise
 * from the top. It reads as a clock hand: the hour that is now.
 */
export const MARK_ACCENT_FACET = 1;

/** Side of one repeat of the lattice, in its own user units. */
export const LATTICE_TILE = 96;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Rounds to two decimals so generated path data stays short and stable. */
export function round(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  // Avoid "-0" in path data.
  return rounded === 0 ? 0 : rounded;
}

/** A point at `radius` from the centre; 0 degrees points up and angles grow clockwise. */
export function polar(radius: number, degrees: number, centre: number): Point {
  const angle = toRadians(degrees);
  return [centre + radius * Math.sin(angle), centre - radius * Math.cos(angle)];
}

/** Rotates a point clockwise around the centre. */
export function rotate(point: Point, degrees: number, centre: number): Point {
  const angle = toRadians(degrees);
  const x = point[0] - centre;
  const y = point[1] - centre;
  return [centre + x * Math.cos(angle) - y * Math.sin(angle), centre + x * Math.sin(angle) + y * Math.cos(angle)];
}

/**
 * Intersection of the infinite lines a1-a2 and b1-b2.
 * @throws RangeError when the lines are parallel.
 */
export function intersect(a1: Point, a2: Point, b1: Point, b2: Point): Point {
  const denominator = (a1[0] - a2[0]) * (b1[1] - b2[1]) - (a1[1] - a2[1]) * (b1[0] - b2[0]);
  if (Math.abs(denominator) < 1e-9) {
    throw new RangeError("Lines are parallel and do not intersect");
  }
  const a = a1[0] * a2[1] - a1[1] * a2[0];
  const b = b1[0] * b2[1] - b1[1] * b2[0];
  return [
    (a * (b1[0] - b2[0]) - (a1[0] - a2[0]) * b) / denominator,
    (a * (b1[1] - b2[1]) - (a1[1] - a2[1]) * b) / denominator,
  ];
}

/** The star as one closed outline: tips and notches alternating, starting at the top tip. */
export function starOutline(spec: StarSpec): Point[] {
  const step = 180 / spec.tips;
  return Array.from({ length: spec.tips * 2 }, (_, index) =>
    polar(index % 2 === 0 ? spec.outer : spec.valley, index * step, spec.centre),
  );
}

/** The eye: a regular polygon whose vertices face the notches of the star. */
export function eyeOutline(spec: StarSpec): Point[] {
  const step = 360 / spec.tips;
  return Array.from({ length: spec.tips }, (_, index) => polar(spec.eye, step / 2 + index * step, spec.centre));
}

/**
 * The star as separate facets, one per tip, clockwise from the top.
 *
 * Each facet is the slice of the star between two notches, shortened by the
 * eye and narrowed by half the gap on either side, which leaves a slit of
 * exactly `gap` between neighbours.
 */
export function starFacets(spec: StarSpec): Point[][] {
  const step = 360 / spec.tips;
  const half = step / 2;
  const { centre } = spec;
  const origin: Point = [centre, centre];

  const tip = polar(spec.outer, 0, centre);
  const valleyLeft = polar(spec.valley, -half, centre);
  const valleyRight = polar(spec.valley, half, centre);
  const eyeLeft = polar(spec.eye, -half, centre);
  const eyeRight = polar(spec.eye, half, centre);

  // The slit edges: the radial line through a notch, moved sideways into the facet.
  const slitEdge = (degrees: number, direction: 1 | -1): [Point, Point] => {
    const angle = toRadians(degrees);
    const dx = (Math.cos(angle) * direction * spec.gap) / 2;
    const dy = (Math.sin(angle) * direction * spec.gap) / 2;
    const far = polar(spec.outer, degrees, centre);
    return [
      [origin[0] + dx, origin[1] + dy],
      [far[0] + dx, far[1] + dy],
    ];
  };
  const left = slitEdge(-half, 1);
  const right = slitEdge(half, -1);

  const upright: Point[] = [
    intersect(eyeLeft, eyeRight, left[0], left[1]),
    intersect(tip, valleyLeft, left[0], left[1]),
    tip,
    intersect(tip, valleyRight, right[0], right[1]),
    intersect(eyeLeft, eyeRight, right[0], right[1]),
  ];

  return Array.from({ length: spec.tips }, (_, index) => upright.map((point) => rotate(point, index * step, centre)));
}

/** SVG path data for a polygon. */
export function toPath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${round(point[0])} ${round(point[1])}`).join("")}Z`;
}

/** Path data for every facet of the mark, clockwise from the top. */
export function markFacetPaths(spec: StarSpec = MARK_SPEC): string[] {
  return starFacets(spec).map(toPath);
}

/**
 * Path data for one whole slice of the star (a facet without its slits).
 * Laid over the solid star to colour a single point.
 */
export function markSlicePath(index: number, spec: StarSpec = MARK_COMPACT_SPEC): string {
  const facets = starFacets({ ...spec, gap: 0 });
  const facet = facets[((index % facets.length) + facets.length) % facets.length];
  return toPath(facet);
}

/**
 * Path data for the compact mark: one solid star with its eye punched out
 * (render with `fill-rule="evenodd"`). Used at small sizes, where the slits
 * between facets would blur into grey.
 */
export function markSolidPath(spec: StarSpec = MARK_COMPACT_SPEC): string {
  return `${toPath(starOutline(spec))}${toPath(eyeOutline(spec))}`;
}

/**
 * Path data for one repeat of the lattice: the star outline with its eye in
 * the middle of the tile and, on each corner, a quarter of the square that
 * links the diagonal tips of four neighbouring stars.
 *
 * The star keeps the proportions of the mark and is scaled so its upright
 * tips touch the tile edges, which is what joins the repeats into one net.
 */
export function latticeTilePath(tile: number = LATTICE_TILE, spec: StarSpec = MARK_SPEC): string {
  const half = tile / 2;
  const scale = half / spec.outer;
  const star: StarSpec = {
    tips: spec.tips,
    outer: half,
    valley: spec.valley * scale,
    eye: spec.eye * scale,
    gap: 0,
    centre: half,
  };

  // Distance from a tile corner to the nearest diagonal star tip, along each axis.
  const reach = half - half * Math.sin(toRadians(45));
  const corners: Point[] = [
    [0, 0],
    [tile, 0],
    [tile, tile],
    [0, tile],
  ];
  const squares = corners.map(([x, y]) =>
    toPath([
      [x - reach, y - reach],
      [x + reach, y - reach],
      [x + reach, y + reach],
      [x - reach, y + reach],
    ]),
  );

  return [toPath(starOutline(star)), toPath(eyeOutline(star)), ...squares].join("");
}
