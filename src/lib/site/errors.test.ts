import { describe, expect, it } from "vitest";
import { errorReference } from "./errors";

describe("errorReference", () => {
  it("is the digest Next.js attaches to a server error", () => {
    expect(errorReference(Object.assign(new Error("boom"), { digest: "1234567890" }))).toBe("1234567890");
    expect(errorReference({ digest: " abc " })).toBe("abc");
  });

  it("is null when there is no usable digest", () => {
    expect(errorReference(new Error("boom"))).toBeNull();
    expect(errorReference({ digest: "" })).toBeNull();
    expect(errorReference({ digest: 42 })).toBeNull();
  });

  it("copes with anything that can be thrown", () => {
    expect(errorReference(null)).toBeNull();
    expect(errorReference(undefined)).toBeNull();
    expect(errorReference("boom")).toBeNull();
    expect(errorReference(404)).toBeNull();
  });
});
