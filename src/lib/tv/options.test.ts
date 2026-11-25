import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/types";
import {
  DEFAULT_TV_QUERY_OPTIONS,
  MAX_INSET_PERCENT,
  parseTvOptions,
  parseTvQueryString,
  resolveTvOptions,
} from "./options";

describe("parseTvOptions", () => {
  it("gives the defaults for an address without a query string", () => {
    expect(parseTvOptions({})).toEqual(DEFAULT_TV_QUERY_OPTIONS);
    expect(parseTvOptions(null)).toEqual(DEFAULT_TV_QUERY_OPTIONS);
    expect(parseTvOptions(undefined)).toEqual(DEFAULT_TV_QUERY_OPTIONS);
  });

  it("reads every option", () => {
    expect(parseTvOptions({ theme: "day", inset: "5", rotate: "90", seconds: "0" })).toEqual({
      theme: "day",
      inset: 5,
      rotate: 90,
      seconds: false,
    });
    expect(parseTvOptions({ theme: "night", inset: "2.5", rotate: "270", seconds: "1" })).toEqual({
      theme: "night",
      inset: 2.5,
      rotate: 270,
      seconds: true,
    });
  });

  it("is forgiving about case and surrounding spaces", () => {
    expect(parseTvOptions({ theme: " Day ", seconds: "TRUE", rotate: " 180 " })).toEqual({
      theme: "day",
      inset: 0,
      rotate: 180,
      seconds: true,
    });
  });

  it("takes the first value when a name is repeated", () => {
    expect(parseTvOptions({ theme: ["day", "night"], rotate: ["90", "180"] })).toMatchObject({
      theme: "day",
      rotate: 90,
    });
    expect(parseTvOptions({ theme: [] })).toEqual(DEFAULT_TV_QUERY_OPTIONS);
  });

  it.each(["dusk", "", "  ", "1", "night;day"])("ignores the unknown theme %j", (theme) => {
    expect(parseTvOptions({ theme }).theme).toBeNull();
  });

  it.each([
    ["0", 0],
    ["10", 10],
    ["3", 3],
    ["0.5", 0.5],
    ["11", MAX_INSET_PERCENT],
    ["500", MAX_INSET_PERCENT],
  ])("reads the inset %j as %d percent", (inset, expected) => {
    expect(parseTvOptions({ inset }).inset).toBe(expected);
  });

  it.each(["-1", "5%", "abc", "1e1", "0x5", "NaN", "Infinity", "5,5", ".5", "+5"])(
    "treats the malformed inset %j as none",
    (inset) => {
      expect(parseTvOptions({ inset }).inset).toBe(0);
    },
  );

  it.each([
    ["0", 0],
    ["90", 90],
    ["180", 180],
    ["270", 270],
    ["90.0", 90],
  ])("reads the rotation %j", (rotate, expected) => {
    expect(parseTvOptions({ rotate }).rotate).toBe(expected);
  });

  it.each(["45", "360", "-90", "left", "90deg", "1e2", ""])(
    "falls back to no rotation for %j",
    (rotate) => {
      expect(parseTvOptions({ rotate }).rotate).toBe(0);
    },
  );

  it.each([
    ["1", true],
    ["true", true],
    ["on", true],
    ["yes", true],
    ["0", false],
    ["false", false],
    ["off", false],
    ["no", false],
  ])("reads seconds=%s", (seconds, expected) => {
    expect(parseTvOptions({ seconds }).seconds).toBe(expected);
  });

  it.each(["2", "maybe", ""])("leaves seconds to the settings for %j", (seconds) => {
    expect(parseTvOptions({ seconds }).seconds).toBeNull();
  });

  it("ignores names it does not know", () => {
    expect(parseTvOptions({ utm_source: "newsletter", Theme: "day" })).toEqual(
      DEFAULT_TV_QUERY_OPTIONS,
    );
  });
});

describe("parseTvQueryString", () => {
  it("gives the defaults for an address without a query string", () => {
    expect(parseTvQueryString("")).toEqual(DEFAULT_TV_QUERY_OPTIONS);
    expect(parseTvQueryString("?")).toEqual(DEFAULT_TV_QUERY_OPTIONS);
  });

  it("reads the options with or without the question mark", () => {
    const expected = { theme: "day", inset: 2.5, rotate: 270, seconds: false };
    expect(parseTvQueryString("?theme=day&inset=2.5&rotate=270&seconds=0")).toEqual(expected);
    expect(parseTvQueryString("theme=day&inset=2.5&rotate=270&seconds=0")).toEqual(expected);
  });

  it("decodes values and takes the first of a repeated name, like the page does", () => {
    expect(parseTvQueryString("?theme=%20Day%20&rotate=90&rotate=180&utm_source=x")).toEqual({
      theme: "day",
      inset: 0,
      rotate: 90,
      seconds: null,
    });
  });

  it("falls back to the defaults for values it cannot read", () => {
    expect(parseTvQueryString("?theme=dusk&inset=-1&rotate=45&seconds=maybe&__proto__=1")).toEqual(
      DEFAULT_TV_QUERY_OPTIONS,
    );
  });
});

describe("resolveTvOptions", () => {
  const tv = DEFAULT_SETTINGS.tv;

  it("follows the settings when the address asks for nothing", () => {
    expect(resolveTvOptions(DEFAULT_TV_QUERY_OPTIONS, tv)).toEqual({
      theme: tv.theme,
      showSeconds: tv.showSeconds,
      insetFraction: 0,
      rotate: 0,
      sideways: false,
    });
    expect(
      resolveTvOptions(DEFAULT_TV_QUERY_OPTIONS, { theme: "day", showSeconds: false }),
    ).toMatchObject({ theme: "day", showSeconds: false });
  });

  it("lets the address override the theme and the seconds", () => {
    const query = { ...DEFAULT_TV_QUERY_OPTIONS, theme: "day" as const, seconds: false };
    expect(resolveTvOptions(query, { theme: "night", showSeconds: true })).toMatchObject({
      theme: "day",
      showSeconds: false,
    });
  });

  it("turns the inset into a fraction of the screen", () => {
    expect(resolveTvOptions({ ...DEFAULT_TV_QUERY_OPTIONS, inset: 5 }, tv).insetFraction).toBe(
      0.05,
    );
    expect(resolveTvOptions({ ...DEFAULT_TV_QUERY_OPTIONS, inset: 10 }, tv).insetFraction).toBe(
      0.1,
    );
  });

  it.each([
    [0, false],
    [90, true],
    [180, false],
    [270, true],
  ] as const)("knows whether a rotation of %d degrees is sideways", (rotate, sideways) => {
    const resolved = resolveTvOptions({ ...DEFAULT_TV_QUERY_OPTIONS, rotate }, tv);
    expect(resolved.rotate).toBe(rotate);
    expect(resolved.sideways).toBe(sideways);
  });
});
