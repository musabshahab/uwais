import { describe, expect, it } from "vitest";
import { cleanFileName, isFormData, readFile, readFlag, readNumber, readText, readTrimmed } from "./form";

/** A form with the given text fields, in order; a name may repeat. */
function formOf(...entries: readonly (readonly [string, string])[]): FormData {
  const formData = new FormData();
  for (const [name, value] of entries) formData.append(name, value);
  return formData;
}

describe("isFormData", () => {
  it("accepts a FormData and refuses everything else", () => {
    expect(isFormData(new FormData())).toBe(true);
    for (const value of [null, undefined, "file=x", 7, {}, [], new Map(), { get: () => null }]) {
      expect(isFormData(value)).toBe(false);
    }
  });
});

describe("readText", () => {
  it("returns the text as sent, untrimmed", () => {
    expect(readText(formOf(["title", "  Eid  "]), "title")).toBe("  Eid  ");
  });

  it("returns null for an absent field and for a file", () => {
    const formData = new FormData();
    formData.set("upload", new File(["x"], "x.csv"));
    expect(readText(formData, "title")).toBeNull();
    expect(readText(formData, "upload")).toBeNull();
  });

  it("uses the last value when a name repeats, as a hidden fallback input needs", () => {
    expect(readText(formOf(["pinned", "false"], ["pinned", "on"]), "pinned")).toBe("on");
  });
});

describe("readTrimmed", () => {
  it("trims, and reads an absent field as empty", () => {
    expect(readTrimmed(formOf(["year", " 2027 "]), "year")).toBe("2027");
    expect(readTrimmed(new FormData(), "year")).toBe("");
  });
});

describe("readFlag", () => {
  it.each(["true", "on", "1", "yes", "TRUE", " On "])("reads %j as switched on", (value) => {
    expect(readFlag(formOf(["flag", value]), "flag")).toBe(true);
  });

  it.each(["false", "off", "0", "no", "", "maybe"])("reads %j as switched off", (value) => {
    expect(readFlag(formOf(["flag", value]), "flag")).toBe(false);
  });

  it("reads an absent field as switched off, like an unticked checkbox", () => {
    expect(readFlag(new FormData(), "flag")).toBe(false);
  });

  it("lets the last value decide when a hidden fallback precedes the checkbox", () => {
    expect(readFlag(formOf(["flag", "false"], ["flag", "on"]), "flag")).toBe(true);
    expect(readFlag(formOf(["flag", "on"], ["flag", "false"]), "flag")).toBe(false);
  });
});

describe("readNumber", () => {
  it.each([
    ["12", 12],
    [" -1 ", -1],
    ["+2", 2],
    ["7.5", 7.5],
    ["0", 0],
  ])("reads %j as %d", (text, value) => {
    expect(readNumber(formOf(["n", text]), "n")).toStrictEqual({ kind: "number", value });
  });

  it("tells a blank field from one that is not a number", () => {
    expect(readNumber(formOf(["n", "  "]), "n")).toStrictEqual({ kind: "blank" });
    expect(readNumber(new FormData(), "n")).toStrictEqual({ kind: "blank" });
    for (const text of ["ten", "1e3", "0x10", "1,5", "12 min", "Infinity", "NaN", "--1", "1."]) {
      expect(readNumber(formOf(["n", text]), "n")).toStrictEqual({ kind: "invalid" });
    }
  });
});

describe("readFile", () => {
  it("returns the uploaded file", async () => {
    const formData = new FormData();
    formData.set("file", new File(["a,b"], "times.csv"));
    const file = readFile(formData, "file");
    expect(file?.name).toBe("times.csv");
    expect(file?.size).toBe(3);
    expect(new TextDecoder().decode(await file?.arrayBuffer())).toBe("a,b");
  });

  it("returns null when the field is text or absent", () => {
    expect(readFile(formOf(["file", "times.csv"]), "file")).toBeNull();
    expect(readFile(new FormData(), "file")).toBeNull();
  });
});

describe("cleanFileName", () => {
  it("drops any folder a browser or a script put in front", () => {
    expect(cleanFileName("C:\\fakepath\\March 2027.xlsx")).toBe("March 2027.xlsx");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("  times.csv  ")).toBe("times.csv");
  });

  it("bounds the length and can come out empty", () => {
    expect(cleanFileName("a".repeat(300))).toHaveLength(255);
    expect(cleanFileName("x".repeat(10), 4)).toBe("xxxx");
    expect(cleanFileName("folder/")).toBe("");
  });
});
