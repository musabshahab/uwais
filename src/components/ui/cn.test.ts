import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins plain class names in order", () => {
    expect(cn("a", "b c", "d")).toBe("a b c d");
  });

  it("skips every falsy value except the number 0", () => {
    expect(cn("a", null, undefined, false, "", "b")).toBe("a b");
    expect(cn("grid-cols", 0)).toBe("grid-cols 0");
  });

  it("applies conditional maps", () => {
    expect(cn("btn", { active: true, hidden: false, muted: null, flag: undefined })).toBe("btn active");
  });

  it("flattens nested lists", () => {
    expect(cn(["a", ["b", { c: true }], false], "d")).toBe("a b c d");
  });

  it("collapses the whitespace of multi-line class strings", () => {
    expect(cn("  a   b\n   c  ", " d ")).toBe("a b c d");
  });

  it("returns an empty string when nothing applies", () => {
    expect(cn()).toBe("");
    expect(cn(null, false, {}, [])).toBe("");
  });

  it("does not include inherited object keys", () => {
    const proto = { inherited: true };
    const map: Record<string, boolean> = Object.create(proto);
    map.own = true;
    expect(cn(map)).toBe("own");
  });
});
