/**
 * Reading `FormData` safely. Everything a browser sends is untrusted: a field
 * can be missing, repeated, or a file where text was expected. These helpers
 * turn that into plain values without ever throwing.
 */

/** An uploaded file as far as the actions need it. */
export interface UploadedFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Text values that switch a flag on. A ticked checkbox without a `value` sends `on`. */
const TRUE_VALUES: readonly string[] = ["true", "on", "1", "yes"];

/**
 * Whether a value is a `FormData`. Checked by shape rather than by class:
 * an action can be called with anything, and the class of a decoded request
 * body is not necessarily the global one.
 */
export function isFormData(value: unknown): value is FormData {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { get?: unknown; getAll?: unknown; keys?: unknown };
  return (
    typeof candidate.get === "function" &&
    typeof candidate.getAll === "function" &&
    typeof candidate.keys === "function"
  );
}

/**
 * The text of a field, or null when the field is absent or is a file. When
 * the name occurs several times the last value is used, which is how a
 * hidden fallback input placed before the real control behaves in a browser.
 */
export function readText(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  const last = values.length === 0 ? null : values[values.length - 1];
  return typeof last === "string" ? last : null;
}

/** A field's text with surrounding whitespace removed; "" when absent. */
export function readTrimmed(formData: FormData, name: string): string {
  return (readText(formData, name) ?? "").trim();
}

/** A checkbox or flag field: true for `true`, `on`, `1` and `yes`; false for anything else or when absent. */
export function readFlag(formData: FormData, name: string): boolean {
  return TRUE_VALUES.includes(readTrimmed(formData, name).toLowerCase());
}

/** A number typed into a field. */
export type NumberField =
  | { kind: "number"; value: number }
  /** The field is absent or blank. */
  | { kind: "blank" }
  /** The field holds something that is not a number. */
  | { kind: "invalid" };

/** Reads a numeric field. Only plain decimal numbers count (`12`, `-1`, `7.5`). */
export function readNumber(formData: FormData, name: string): NumberField {
  const text = readTrimmed(formData, name);
  if (text === "") return { kind: "blank" };
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return { kind: "invalid" };
  return { kind: "number", value: Number(text) };
}

/** The file uploaded in a field, or null when the field is absent or is text. */
export function readFile(formData: FormData, name: string): UploadedFile | null {
  const value: unknown = formData.get(name);
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { name?: unknown; size?: unknown; arrayBuffer?: unknown };
  const isFile =
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.arrayBuffer === "function";
  return isFile ? (value as UploadedFile) : null;
}

/** Keeps the last path segment of a browser-supplied file name and bounds its length. */
export function cleanFileName(name: string, maxLength: number = 255): string {
  const segments = name.split(/[\\/]/);
  return segments[segments.length - 1].trim().slice(0, maxLength);
}
