/**
 * Self-hosted typefaces.
 *
 * The font files come from the `@fontsource-variable/*` npm packages and are
 * loaded with `next/font/local`, so a build never talks to a font CDN and the
 * installed app has every face available offline.
 *
 * Each family is split the way the foundries subset it. The `unicode-range`
 * declarations let the browser skip a file until the page actually contains a
 * character from it: English pages download ~80 kB of Latin, the Latin
 * Extended files only arrive for transliterated names such as "Jumuʿah" or
 * "Ramaḍān", and the Arabic face is fetched where Arabic text is shown.
 *
 * `next/font` reads these calls at build time without running the module:
 * every loader must be called at module scope, assigned to a `const`, and
 * given literal options. That is why the unicode ranges are repeated inline
 * instead of being shared constants. The ranges are the ones Google Fonts
 * uses for its `latin`, `latin-ext` and `arabic` subsets.
 */
import localFont from "next/font/local";

/** UI face: Source Sans 3, a humanist sans whose figures are tabular by default. */
const sans = localFont({
  src: "../../node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  variable: "--font-source-sans",
  adjustFontFallback: "Arial",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

const sansExt = localFont({
  src: "../../node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-ext-wght-normal.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  variable: "--font-source-sans-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});

/** Display face: Literata, used for names, headings and every time numeral. */
const display = localFont({
  src: "../../node_modules/@fontsource-variable/literata/files/literata-latin-wght-normal.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  variable: "--font-literata",
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

const displayExt = localFont({
  src: "../../node_modules/@fontsource-variable/literata/files/literata-latin-ext-wght-normal.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  variable: "--font-literata-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});

/** Arabic face: Reem Kufi, for the Arabic prayer names shown beside the English ones. */
const arabic = localFont({
  src: "../../node_modules/@fontsource-variable/reem-kufi/files/reem-kufi-arabic-wght-normal.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-reem-kufi",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC" }],
});

/**
 * Class names that define the `--font-*` custom properties consumed by
 * `globals.css`. Put this on `<html>` once, in the root layout.
 */
export const fontVariables = [
  sans.variable,
  sansExt.variable,
  display.variable,
  displayExt.variable,
  arabic.variable,
].join(" ");
