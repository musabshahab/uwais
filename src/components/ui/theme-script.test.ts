import { describe, expect, it } from "vitest";
import { THEME_PREFERENCES, THEME_STORAGE_KEY, parseThemePreference, themeInitScript } from "./theme-script";

/** Runs the inline script against stand-ins for the two browser globals it touches. */
function run(script: string, storage: { getItem(key: string): string | null }): Record<string, string> {
  const attributes: Record<string, string> = {};
  const fakeDocument = {
    documentElement: {
      setAttribute(name: string, value: string) {
        attributes[name] = value;
      },
    },
  };
  // The script is source text by design (it is inlined into <head>), so executing it is the only faithful test.
  new Function("localStorage", "document", script)(storage, fakeDocument);
  return attributes;
}

const storing = (values: Record<string, string>) => ({
  getItem: (key: string) => (key in values ? values[key] : null),
});

describe("parseThemePreference", () => {
  it("accepts the two overrides", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it.each([null, undefined, "", "system", "Dark", " dark", "auto", 1, true, {}, ["dark"]])("treats %j as no override", (value) => {
    expect(parseThemePreference(value)).toBe("system");
  });

  it("round-trips every offered preference", () => {
    for (const preference of THEME_PREFERENCES) {
      expect(parseThemePreference(preference)).toBe(preference);
    }
  });
});

describe("themeInitScript", () => {
  it.each(["light", "dark"])("applies a stored %s override to <html>", (theme) => {
    expect(run(themeInitScript(), storing({ [THEME_STORAGE_KEY]: theme }))).toEqual({ "data-theme": theme });
  });

  it("leaves <html> alone when nothing is stored, so the system setting applies", () => {
    expect(run(themeInitScript(), storing({}))).toEqual({});
  });

  it.each(["system", "", "blue", "DARK", '"dark"'])("ignores the unexpected stored value %j", (value) => {
    expect(run(themeInitScript(), storing({ [THEME_STORAGE_KEY]: value }))).toEqual({});
  });

  it("survives storage that throws, as it does when cookies are blocked", () => {
    const blocked = {
      getItem(): string | null {
        throw new Error("SecurityError");
      },
    };
    expect(() => run(themeInitScript(), blocked)).not.toThrow();
    expect(run(themeInitScript(), blocked)).toEqual({});
  });

  it("reads the key it is given", () => {
    const storage = storing({ other: "dark", [THEME_STORAGE_KEY]: "light" });
    expect(run(themeInitScript("other"), storage)).toEqual({ "data-theme": "dark" });
  });

  it("escapes the key, so a hostile key cannot break out of the string literal", () => {
    const key = '");document.documentElement.setAttribute("data-hacked","1");("';
    const script = themeInitScript(key);
    expect(run(script, storing({ [key]: "dark" }))).toEqual({ "data-theme": "dark" });
  });

  it("is written for old browsers: no arrow functions, let or const", () => {
    const script = themeInitScript();
    expect(script).not.toMatch(/=>|\blet\b|\bconst\b/);
    expect(script).not.toContain("</script");
  });
});
