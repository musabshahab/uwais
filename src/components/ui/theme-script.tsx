/**
 * The explicit light/dark override, without a flash.
 *
 * The site follows the system colour scheme. A visitor can override it; the
 * choice is kept in localStorage and applied as `data-theme` on `<html>` by a
 * tiny script that runs while the HTML is parsed, before anything is painted.
 * Nothing here reads cookies, so the root layout stays fully static.
 */

/** localStorage key holding the visitor's override. */
export const THEME_STORAGE_KEY = "uwais-theme";

/** The theme choices offered to visitors. `system` means "no override". */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

/** A visitor's theme choice. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Reads a stored value defensively: anything unexpected means `system`. */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Source of the inline script. It is written for old browsers on purpose
 * (`var`, no arrow functions) and swallows storage errors, which private
 * browsing modes and blocked cookies can throw.
 */
export function themeInitScript(storageKey: string = THEME_STORAGE_KEY): string {
  const key = JSON.stringify(storageKey);
  return `(function(){try{var t=localStorage.getItem(${key});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;
}

/**
 * Applies the stored theme before first paint. Render it once inside
 * `<head>` in the root layout, and put `suppressHydrationWarning` on
 * `<html>` because the script changes an attribute React did not render.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />;
}
