import { describe, expect, it } from "vitest";
import { COMPACT_NAME_MAX, REGULAR_NAME_MAX, nameScale } from "./text";

describe("nameScale", () => {
  it("sets short names in the regular size", () => {
    expect(nameScale("Masjid Uwais")).toBe("regular");
    expect(nameScale("x".repeat(REGULAR_NAME_MAX))).toBe("regular");
  });

  it("sets longer names one size down", () => {
    expect(nameScale("Central Jamia Mosque and Islamic Centre")).toBe("compact");
    expect(nameScale("x".repeat(REGULAR_NAME_MAX + 1))).toBe("compact");
    expect(nameScale("x".repeat(COMPACT_NAME_MAX))).toBe("compact");
  });

  it("sets very long names in the dense size", () => {
    expect(nameScale("x".repeat(COMPACT_NAME_MAX + 1))).toBe("dense");
    expect(nameScale("The Central Jamia Mosque, Islamic Centre and Community Hall of Greater Uwais")).toBe(
      "dense",
    );
  });

  it("ignores surrounding spaces", () => {
    expect(nameScale(`   ${"x".repeat(REGULAR_NAME_MAX)}   `)).toBe("regular");
  });
});
