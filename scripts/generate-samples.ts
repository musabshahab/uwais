/**
 * Writes the sample timetables and the blank templates:
 *
 *   samples/timetable-<year>.csv, .xlsx          a realistic year for London, for this year and the next
 *   public/templates/timetable-template.xlsx     blank template for next year, with instructions
 *   public/templates/timetable-template.csv      the same as plain CSV
 *
 * Run it with `npm run samples` (sample timetables), `npm run templates`
 * (templates) or `npx tsx scripts/generate-samples.ts` (both), and commit
 * what it writes. The templates are for NEXT year, so run it again each year.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTemplateCsv, buildTemplateXlsx, toCsv, toXlsx } from "../src/lib/import/export";
import { yearOf } from "../src/lib/time/dates";
import { zonedNow } from "../src/lib/time/tz";
import { LONDON, generateSampleDays } from "./sample-timetable";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES_DIR = path.join(ROOT, "samples");
const TEMPLATES_DIR = path.join(ROOT, "public", "templates");

/** Writes a file and says so. */
async function write(directory: string, name: string, content: string | Uint8Array): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), content);
  process.stdout.write(`wrote ${path.relative(ROOT, path.join(directory, name))}\n`);
}

/** Writes a sample year as CSV and as Excel. */
async function writeSamples(year: number): Promise<void> {
  const days = generateSampleDays(year, LONDON);
  await write(SAMPLES_DIR, `timetable-${year}.csv`, toCsv(days));
  await write(SAMPLES_DIR, `timetable-${year}.xlsx`, await toXlsx(days, { title: `Timetable ${year}` }));
}

/** Writes the blank templates for a year. */
async function writeTemplates(year: number): Promise<void> {
  await write(TEMPLATES_DIR, "timetable-template.xlsx", await buildTemplateXlsx({ year }));
  await write(TEMPLATES_DIR, "timetable-template.csv", buildTemplateCsv({ year }));
}

/** Writes what the first command-line argument asks for: `samples`, `templates`, or both when it is missing. */
async function main(): Promise<void> {
  const what = process.argv[2] ?? "all";
  if (!["all", "samples", "templates"].includes(what)) {
    throw new Error(`Unknown argument "${what}". Use "samples", "templates" or nothing for both.`);
  }
  // "This year" as the sample mosque sees it, not as the build machine does.
  const thisYear = yearOf(zonedNow(LONDON.timezone, Date.now()).date);
  if (what !== "templates") {
    await writeSamples(thisYear);
    await writeSamples(thisYear + 1);
  }
  if (what !== "samples") await writeTemplates(thisYear + 1);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
