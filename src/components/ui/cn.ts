/** A value accepted by {@link cn}: a class string, a falsy value to skip, a nested list, or a `{ className: condition }` map. */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | readonly ClassValue[]
  | { readonly [className: string]: boolean | null | undefined };

function collect(value: ClassValue, out: string[]): void {
  if (value === null || value === undefined || value === false || value === "") return;
  if (typeof value === "string") {
    out.push(value);
  } else if (typeof value === "number") {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value as readonly ClassValue[]) collect(item, out);
  } else {
    const map = value as { readonly [className: string]: boolean | null | undefined };
    for (const key of Object.keys(map)) {
      if (map[key]) out.push(key);
    }
  }
}

/**
 * Joins class names, skipping falsy values.
 *
 * It does not resolve conflicting Tailwind utilities: when two classes set the
 * same property the winner is decided by the stylesheet, not by argument
 * order. Use a component's props to restyle it and `className` for layout
 * (margin, width, grid placement).
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) collect(value, out);
  // Class strings written across several lines carry runs of whitespace.
  return out.join(" ").replace(/\s+/g, " ").trim();
}
