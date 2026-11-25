import { describe, expect, it } from "vitest";
import { parseTvOptions } from "@/lib/tv/options";
import {
  DEFAULT_TV_ADDRESS_OPTIONS,
  TV_ROTATIONS,
  clampInset,
  tvAddress,
  tvAddressForTyping,
  tvPath,
  tvQueryString,
  type TvAddressOptions,
} from "./tv-url";

describe("tvPath", () => {
  it("is the plain address when the screen follows the settings", () => {
    expect(tvPath()).toBe("/tv");
    expect(tvQueryString(DEFAULT_TV_ADDRESS_OPTIONS)).toBe("");
  });

  it("carries only the options that were chosen", () => {
    expect(tvPath({ ...DEFAULT_TV_ADDRESS_OPTIONS, theme: "day" })).toBe("/tv?theme=day");
    expect(tvPath({ ...DEFAULT_TV_ADDRESS_OPTIONS, seconds: "off" })).toBe("/tv?seconds=0");
    expect(tvPath({ ...DEFAULT_TV_ADDRESS_OPTIONS, seconds: "on" })).toBe("/tv?seconds=1");
    expect(tvPath({ ...DEFAULT_TV_ADDRESS_OPTIONS, rotate: 90 })).toBe("/tv?rotate=90");
    expect(tvPath({ ...DEFAULT_TV_ADDRESS_OPTIONS, inset: 4 })).toBe("/tv?inset=4");
  });

  it("combines options in a fixed order", () => {
    expect(tvPath({ theme: "night", seconds: "off", rotate: 270, inset: 3 })).toBe(
      "/tv?theme=night&seconds=0&rotate=270&inset=3",
    );
  });
});

describe("clampInset", () => {
  it("keeps the inset a whole number inside the allowed range", () => {
    expect(clampInset(-3)).toBe(0);
    expect(clampInset(2.6)).toBe(3);
    expect(clampInset(25)).toBe(10);
    expect(clampInset(Number.NaN)).toBe(0);
  });
});

describe("tvAddress", () => {
  it("joins the origin and the path without doubling the slash", () => {
    expect(tvAddress("https://masjid.example")).toBe("https://masjid.example/tv");
    expect(tvAddress("https://masjid.example/", { ...DEFAULT_TV_ADDRESS_OPTIONS, theme: "day" })).toBe(
      "https://masjid.example/tv?theme=day",
    );
  });

  it("falls back to the path while the origin is unknown", () => {
    expect(tvAddress(null)).toBe("/tv");
  });

  it("drops https for typing and keeps http", () => {
    expect(tvAddressForTyping("https://masjid.example")).toBe("masjid.example/tv");
    expect(tvAddressForTyping("http://192.168.1.20:3000")).toBe("http://192.168.1.20:3000/tv");
  });
});

describe("agreement with the TV page", () => {
  it("builds addresses the TV page reads back as the same options", () => {
    const choices: TvAddressOptions[] = [
      DEFAULT_TV_ADDRESS_OPTIONS,
      { theme: "day", seconds: "on", rotate: 90, inset: 5 },
      { theme: "night", seconds: "off", rotate: 180, inset: 10 },
      { theme: "settings", seconds: "settings", rotate: 270, inset: 0 },
    ];
    for (const choice of choices) {
      const query = new URLSearchParams(tvQueryString(choice));
      const read = parseTvOptions(Object.fromEntries(query.entries()));
      expect(read.theme).toBe(choice.theme === "settings" ? null : choice.theme);
      expect(read.seconds).toBe(choice.seconds === "settings" ? null : choice.seconds === "on");
      expect(read.rotate).toBe(choice.rotate);
      expect(read.inset).toBe(choice.inset);
    }
  });

  it("offers exactly the rotations the TV page accepts", () => {
    for (const rotation of TV_ROTATIONS) {
      expect(parseTvOptions({ rotate: String(rotation) }).rotate).toBe(rotation);
    }
  });
});
