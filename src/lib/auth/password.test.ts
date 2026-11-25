import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, constantTimeEqual, verifyPassword } from "./password";

const PASSWORD = "correct horse battery";

describe("verifyPassword", () => {
  it("accepts the exact password", () => {
    expect(verifyPassword(PASSWORD, PASSWORD)).toBe(true);
  });

  it.each([
    "",
    "correct horse batter",
    "correct horse battery ",
    " correct horse battery",
    "Correct horse battery",
    "correct horse battery\n",
    "x".repeat(PASSWORD.length),
  ])("rejects %j", (candidate) => {
    expect(verifyPassword(candidate, PASSWORD)).toBe(false);
  });

  it.each([undefined, null, 12345678, true, ["correct horse battery"], { password: PASSWORD }])(
    "rejects a value that is not a string (%j)",
    (candidate) => {
      expect(verifyPassword(candidate, PASSWORD)).toBe(false);
    },
  );

  it("never accepts an empty expected password", () => {
    expect(verifyPassword("", "")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });

  it("refuses over-long input without comparing it", () => {
    const longest = "p".repeat(MAX_PASSWORD_LENGTH);
    expect(verifyPassword(longest, longest)).toBe(true);
    const tooLong = `${longest}p`;
    expect(verifyPassword(tooLong, tooLong)).toBe(false);
  });

  it("treats differently composed forms of the same character as equal", () => {
    expect(verifyPassword("café-au-lait", "café-au-lait")).toBe(true);
    expect(verifyPassword("cafe-au-lait", "café-au-lait")).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("compares strings of any lengths without throwing", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "a".repeat(10_000))).toBe(false);
  });
});
