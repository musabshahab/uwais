import { describe, expect, it } from "vitest";
import {
  LATTICE_TILE,
  MARK_ACCENT_FACET,
  MARK_COMPACT_SPEC,
  MARK_SPEC,
  MARK_VIEWBOX,
  eyeOutline,
  intersect,
  latticeTilePath,
  markFacetPaths,
  markSlicePath,
  markSolidPath,
  polar,
  rotate,
  round,
  starFacets,
  starOutline,
  toPath,
  type Point,
} from "./geometry";

const CENTRE = MARK_VIEWBOX / 2;

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const radius = (point: Point): number => distance(point, [CENTRE, CENTRE]);

/** Every number that appears in a string of path data. */
const numbersIn = (path: string): number[] => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Shortest distance from `point` to the infinite line through `a` and `b`. */
function distanceToLine(point: Point, a: Point, b: Point): number {
  const cross = (b[0] - a[0]) * (a[1] - point[1]) - (a[0] - point[0]) * (b[1] - a[1]);
  return Math.abs(cross) / distance(a, b);
}

describe("round", () => {
  it("keeps two decimals", () => {
    expect(round(1.005)).toBe(1);
    expect(round(12.3456)).toBe(12.35);
    expect(round(-7.891)).toBe(-7.89);
  });

  it("never returns negative zero, which would print as -0 in path data", () => {
    expect(Object.is(round(-0.0001), 0)).toBe(true);
    expect(Object.is(round(-0), 0)).toBe(true);
  });
});

describe("polar", () => {
  it("measures angles clockwise from the top", () => {
    const [topX, topY] = polar(10, 0, 50);
    expect(topX).toBeCloseTo(50);
    expect(topY).toBeCloseTo(40);

    const [rightX, rightY] = polar(10, 90, 50);
    expect(rightX).toBeCloseTo(60);
    expect(rightY).toBeCloseTo(50);

    const [bottomX, bottomY] = polar(10, 180, 50);
    expect(bottomX).toBeCloseTo(50);
    expect(bottomY).toBeCloseTo(60);
  });

  it("returns the centre for a zero radius", () => {
    expect(polar(0, 123, 50)).toEqual([50, 50]);
  });
});

describe("rotate", () => {
  it("turns a point clockwise around the centre", () => {
    const [x, y] = rotate([50, 40], 90, 50);
    expect(x).toBeCloseTo(60);
    expect(y).toBeCloseTo(50);
  });

  it("is the identity after a full turn", () => {
    const [x, y] = rotate([12.5, 80], 360, 50);
    expect(x).toBeCloseTo(12.5);
    expect(y).toBeCloseTo(80);
  });
});

describe("intersect", () => {
  it("finds where two lines cross, even beyond the given segments", () => {
    const [x, y] = intersect([0, 0], [1, 1], [0, 10], [1, 9]);
    expect(x).toBeCloseTo(5);
    expect(y).toBeCloseTo(5);
  });

  it("throws for parallel lines", () => {
    expect(() => intersect([0, 0], [1, 0], [0, 1], [1, 1])).toThrow(RangeError);
  });

  it("throws for the same line given twice", () => {
    expect(() => intersect([0, 0], [2, 2], [1, 1], [3, 3])).toThrow(RangeError);
  });
});

describe("starOutline", () => {
  const outline = starOutline(MARK_SPEC);

  it("alternates tips and notches, starting at the top tip", () => {
    expect(outline).toHaveLength(MARK_SPEC.tips * 2);
    expect(outline[0][0]).toBeCloseTo(CENTRE);
    expect(outline[0][1]).toBeCloseTo(CENTRE - MARK_SPEC.outer);
    outline.forEach((point, index) => {
      expect(radius(point)).toBeCloseTo(index % 2 === 0 ? MARK_SPEC.outer : MARK_SPEC.valley);
    });
  });

  it("stays inside the viewBox", () => {
    for (const [x, y] of outline) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(MARK_VIEWBOX);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(MARK_VIEWBOX);
    }
  });
});

describe("eyeOutline", () => {
  it("is a regular polygon whose vertices face the notches", () => {
    const eye = eyeOutline(MARK_SPEC);
    const notches = starOutline(MARK_SPEC).filter((_, index) => index % 2 === 1);
    expect(eye).toHaveLength(MARK_SPEC.tips);
    eye.forEach((vertex, index) => {
      expect(radius(vertex)).toBeCloseTo(MARK_SPEC.eye);
      // Same direction from the centre as the notch, just closer in.
      const scale = MARK_SPEC.valley / MARK_SPEC.eye;
      expect(CENTRE + (vertex[0] - CENTRE) * scale).toBeCloseTo(notches[index][0]);
      expect(CENTRE + (vertex[1] - CENTRE) * scale).toBeCloseTo(notches[index][1]);
    });
  });
});

describe("starFacets", () => {
  const facets = starFacets(MARK_SPEC);

  it("makes one five-sided facet per tip", () => {
    expect(facets).toHaveLength(MARK_SPEC.tips);
    for (const facet of facets) expect(facet).toHaveLength(5);
  });

  it("puts the first facet upright, with its tip at the top of the star", () => {
    const tip = facets[0][2];
    expect(tip[0]).toBeCloseTo(CENTRE);
    expect(tip[1]).toBeCloseTo(CENTRE - MARK_SPEC.outer);
  });

  it("makes every facet a rotation of the first", () => {
    const step = 360 / MARK_SPEC.tips;
    facets.forEach((facet, index) => {
      facet.forEach((point, corner) => {
        const expected = rotate(facets[0][corner], index * step, CENTRE);
        expect(point[0]).toBeCloseTo(expected[0]);
        expect(point[1]).toBeCloseTo(expected[1]);
      });
    });
  });

  it("is mirror-symmetric about its own axis", () => {
    const [innerLeft, outerLeft, , outerRight, innerRight] = facets[0];
    expect(innerLeft[0] + innerRight[0]).toBeCloseTo(MARK_VIEWBOX);
    expect(innerLeft[1]).toBeCloseTo(innerRight[1]);
    expect(outerLeft[0] + outerRight[0]).toBeCloseTo(MARK_VIEWBOX);
    expect(outerLeft[1]).toBeCloseTo(outerRight[1]);
  });

  it("leaves a slit of exactly `gap` between neighbouring facets", () => {
    // The right edge of facet 0 and the left edge of facet 1 are parallel;
    // the slit is the distance between those two lines.
    const [, , , outerRight, innerRight] = facets[0];
    const [innerLeft, outerLeft] = facets[1];
    expect(distanceToLine(innerLeft, innerRight, outerRight)).toBeCloseTo(MARK_SPEC.gap);
    expect(distanceToLine(outerLeft, innerRight, outerRight)).toBeCloseTo(MARK_SPEC.gap);
  });

  it("closes the slits completely when the gap is zero", () => {
    const closed = starFacets({ ...MARK_SPEC, gap: 0 });
    expect(distance(closed[0][3], closed[1][1])).toBeCloseTo(0);
    expect(distance(closed[0][4], closed[1][0])).toBeCloseTo(0);
    // With no slit the outer corners are the notches of the star itself.
    expect(radius(closed[0][3])).toBeCloseTo(MARK_SPEC.valley);
    expect(radius(closed[0][4])).toBeCloseTo(MARK_SPEC.eye);
  });

  it("keeps every corner between the eye and the tips", () => {
    // The inner edge is a chord of the eye, so its ends sit just inside the eye radius.
    const innermost = MARK_SPEC.eye * Math.cos(Math.PI / MARK_SPEC.tips);
    for (const facet of facets) {
      for (const point of facet) {
        expect(radius(point)).toBeGreaterThanOrEqual(innermost - 1e-9);
        expect(radius(point)).toBeLessThanOrEqual(MARK_SPEC.outer + 1e-9);
      }
    }
  });
});

describe("toPath", () => {
  it("writes a closed polygon with rounded coordinates", () => {
    expect(
      toPath([
        [0, 0],
        [10.004, 0],
        [10, 9.996],
      ]),
    ).toBe("M0 0L10 0L10 10Z");
  });

  it("returns an empty string for no points", () => {
    expect(toPath([])).toBe("");
  });
});

describe("mark paths", () => {
  it("gives one closed path per facet", () => {
    const paths = markFacetPaths();
    expect(paths).toHaveLength(MARK_SPEC.tips);
    for (const path of paths) expect(path).toMatch(/^M[-\d. ]+(L[-\d. ]+){4}Z$/);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("highlights a facet that exists", () => {
    expect(MARK_ACCENT_FACET).toBeGreaterThanOrEqual(0);
    expect(MARK_ACCENT_FACET).toBeLessThan(MARK_SPEC.tips);
  });

  it("draws the compact mark as a star with its eye as a second subpath", () => {
    const path = markSolidPath();
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/Z/g)).toHaveLength(2);
    expect(path.startsWith(toPath(starOutline(MARK_COMPACT_SPEC)))).toBe(true);
  });

  it("gives the compact mark deeper notches and a smaller eye than the full mark", () => {
    expect(MARK_COMPACT_SPEC.tips).toBe(MARK_SPEC.tips);
    expect(MARK_COMPACT_SPEC.valley / MARK_COMPACT_SPEC.outer).toBeLessThan(MARK_SPEC.valley / MARK_SPEC.outer);
    expect(MARK_COMPACT_SPEC.eye).toBeLessThan(MARK_SPEC.eye);
    expect(MARK_COMPACT_SPEC.outer).toBeLessThanOrEqual(MARK_VIEWBOX / 2);
  });

  it("wraps the slice index, so any integer selects a point of the star", () => {
    expect(markSlicePath(MARK_SPEC.tips + 1)).toBe(markSlicePath(1));
    expect(markSlicePath(-1)).toBe(markSlicePath(MARK_SPEC.tips - 1));
  });

  it("cuts slices that meet the outline of the solid star they are laid over", () => {
    const slice = starFacets({ ...MARK_COMPACT_SPEC, gap: 0 })[MARK_ACCENT_FACET];
    expect(markSlicePath(MARK_ACCENT_FACET)).toBe(toPath(slice));
    expect(radius(slice[2])).toBeCloseTo(MARK_COMPACT_SPEC.outer);
    expect(radius(slice[1])).toBeCloseTo(MARK_COMPACT_SPEC.valley);
  });

  it("stays inside the viewBox", () => {
    for (const path of [...markFacetPaths(), markSolidPath(), markSlicePath(0)]) {
      for (const value of numbersIn(path)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(MARK_VIEWBOX);
      }
    }
  });
});

describe("latticeTilePath", () => {
  it("draws a star, its eye and a linking square on each corner", () => {
    const path = latticeTilePath();
    expect(path.match(/M/g)).toHaveLength(6);
    expect(path.match(/Z/g)).toHaveLength(6);
  });

  it("touches all four edges of the tile so that the repeats join", () => {
    const values = numbersIn(latticeTilePath());
    const xs = values.filter((_, index) => index % 2 === 0);
    const ys = values.filter((_, index) => index % 2 === 1);
    const half = LATTICE_TILE / 2;
    expect(xs).toContain(half);
    expect(ys).toContain(0);
    expect(ys).toContain(LATTICE_TILE);
    expect(xs).toContain(0);
    expect(xs).toContain(LATTICE_TILE);
  });

  it("links the diagonal tips: the corner squares reach exactly to them", () => {
    const tile = 200;
    const half = tile / 2;
    const reach = half - half * Math.sin(Math.PI / 4);
    const diagonalTip = polar(half, 45, half);
    // The square on the top-right corner has a vertex on the diagonal tip.
    expect(diagonalTip[0]).toBeCloseTo(tile - reach);
    expect(diagonalTip[1]).toBeCloseTo(reach);
    expect(latticeTilePath(tile)).toContain(`${round(tile - reach)} ${round(reach)}`);
  });

  it("scales with the tile", () => {
    const small = numbersIn(latticeTilePath(48));
    const large = numbersIn(latticeTilePath(96));
    expect(small).toHaveLength(large.length);
    small.forEach((value, index) => expect(value * 2).toBeCloseTo(large[index], 1));
  });
});
