/**
 * Generates every icon file of the app from the one geometric definition of
 * the mark in `src/components/brand`, so the favicon, the installed app icon
 * and the logo on the page can never drift apart.
 *
 * Run it with `npm run icons` after changing the mark or the brand colours,
 * and commit what it writes:
 *
 *   public/icons/icon-192.png, icon-512.png            rounded tile, purpose "any"
 *   public/icons/icon-maskable-192.png, -512.png       full bleed, purpose "maskable"
 *   public/icons/icon-monochrome-512.png               silhouette, purpose "monochrome"
 *   public/icons/badge-96.png                          silhouette for notification badges
 *   public/icons/apple-touch-icon.png                  180px, for iOS home screens
 *   src/app/apple-icon.png                             the same file, picked up by Next.js
 *   src/app/icon.svg                                   scalable favicon
 *   src/app/favicon.ico                                16, 32 and 48px, for old browsers
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { encodeIco } from "../src/components/brand/ico";
import { fitsMaskableSafeZone, renderMarkSvg, type MarkSvgOptions } from "../src/components/brand/mark-svg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The light-theme tokens of globals.css: --brand, --on-brand and --on-brand-accent.
const GREEN = "#15493f";
const CREAM = "#f4f7f1";
const BRASS = "#e6bf73";
// Launchers and the notification tray use only the alpha channel of these.
const SILHOUETTE = "#ffffff";

type MarkStyle = Omit<MarkSvgOptions, "size">;

/** The app icon as shown where the platform does not crop it: a rounded tile. */
const TILE: MarkStyle = { background: GREEN, foreground: CREAM, accent: BRASS, cornerRadius: 0.22, scale: 0.74 };

/** Full bleed for launchers that cut their own shape; the mark stays inside the safe circle. */
const MASKABLE: MarkStyle = { background: GREEN, foreground: CREAM, accent: BRASS, scale: 0.66 };

/** iOS rounds the corners itself and shows transparency as black, so: opaque and square. */
const APPLE: MarkStyle = { background: GREEN, foreground: CREAM, accent: BRASS, scale: 0.74 };

/** Themed icons (Android 13+) recolour the silhouette and may mask it like a maskable icon. */
const MONOCHROME: MarkStyle = { foreground: SILHOUETTE, scale: 0.8 };

/** Shown at about 24px in the status bar, where only the compact mark holds up. */
const BADGE: MarkStyle = { foreground: SILHOUETTE, detail: "solid", scale: 0.96 };

/** Browser tabs draw the favicon at 16 to 32px: the compact mark on the tile. */
const FAVICON: MarkStyle = { background: GREEN, foreground: CREAM, accent: BRASS, cornerRadius: 0.22, scale: 0.8, detail: "solid" };

const PNG_ICONS: ReadonlyArray<{ file: string; size: number; style: MarkStyle }> = [
  { file: "public/icons/icon-192.png", size: 192, style: TILE },
  { file: "public/icons/icon-512.png", size: 512, style: TILE },
  { file: "public/icons/icon-maskable-192.png", size: 192, style: MASKABLE },
  { file: "public/icons/icon-maskable-512.png", size: 512, style: MASKABLE },
  { file: "public/icons/icon-monochrome-512.png", size: 512, style: MONOCHROME },
  { file: "public/icons/badge-96.png", size: 96, style: BADGE },
  { file: "public/icons/apple-touch-icon.png", size: 180, style: APPLE },
  { file: "src/app/apple-icon.png", size: 180, style: APPLE },
];

const FAVICON_SIZES = [16, 32, 48] as const;

/** Rasterises the mark at exactly `size` pixels. */
async function renderPng(size: number, style: MarkStyle): Promise<Buffer> {
  // The SVG declares the target size, so librsvg draws at that resolution and nothing is resampled.
  return sharp(Buffer.from(renderMarkSvg({ ...style, size })))
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Writes a file under the repository root, creating its folder if needed, and returns a line for the summary. */
async function write(file: string, data: string | Uint8Array): Promise<string> {
  const target = path.join(ROOT, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.length;
  return `${file} (${bytes} bytes)`;
}

async function main(): Promise<void> {
  for (const style of [MASKABLE, MONOCHROME]) {
    if (!fitsMaskableSafeZone(style.scale ?? 1, style.detail)) {
      throw new RangeError("The mark would be cropped by a launcher mask: lower the scale of the maskable icons");
    }
  }

  const written: string[] = [];
  for (const { file, size, style } of PNG_ICONS) {
    written.push(await write(file, await renderPng(size, style)));
  }

  written.push(await write("src/app/icon.svg", `${renderMarkSvg({ ...FAVICON, size: 32 })}\n`));

  const faviconImages = await Promise.all(FAVICON_SIZES.map(async (size) => ({ size, png: await renderPng(size, FAVICON) })));
  written.push(await write("src/app/favicon.ico", encodeIco(faviconImages)));

  process.stdout.write(`Wrote ${written.length} icon files:\n${written.map((line) => `  ${line}`).join("\n")}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
