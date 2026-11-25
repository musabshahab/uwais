import { describe, expect, it } from "vitest";
import { isTimeZoneFallback } from "./status";

describe("isTimeZoneFallback", () => {
  it("is false when the screen uses the mosque's zone", () => {
    expect(isTimeZoneFallback("Europe/London", "Europe/London")).toBe(false);
    expect(isTimeZoneFallback("UTC", "UTC")).toBe(false);
  });

  it("is true when the screen fell back to UTC", () => {
    expect(isTimeZoneFallback("UTC", "Europe/London")).toBe(true);
    expect(isTimeZoneFallback("UTC", "Asia/Karachi")).toBe(true);
  });

  it("is false for the same zone under its older name", () => {
    expect(isTimeZoneFallback("Europe/Kiev", "Europe/Kyiv")).toBe(false);
    expect(isTimeZoneFallback("Asia/Calcutta", "Asia/Kolkata")).toBe(false);
  });
});
