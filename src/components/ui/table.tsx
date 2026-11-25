import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

/** Props of {@link Table}. */
export interface TableProps extends Omit<ComponentProps<"table">, "summary"> {
  /**
   * Names the table for assistive technology, e.g. "Prayer times for March
   * 2026". Required: the scroll area around the table is focusable so that
   * keyboard users can scroll it, and a focusable region needs a name.
   */
  label: string;
  /** Optional visible caption rendered above the rows. */
  caption?: ReactNode;
  /** Tints every second row. Helps the eye follow a wide timetable row. */
  zebra?: boolean;
  /** Tighter rows, for the monthly timetable and other long lists. */
  dense?: boolean;
  /** Keeps the header row in view while the body scrolls. Needs `maxHeight`. */
  stickyHeader?: boolean;
  /**
   * Keeps the first cell of every row in view while the table scrolls
   * sideways, so the date stays next to its times on a phone.
   */
  stickyFirstColumn?: boolean;
  /** Height limit of the scroll area (any CSS length). Without it the table grows with its rows. */
  maxHeight?: CSSProperties["maxHeight"];
  /** Classes for the scroll area around the table. `className` goes to the `<table>`. */
  wrapperClassName?: string;
}

/**
 * A pinned cell must be opaque or the columns scrolling underneath show
 * through, so its fill repeats whatever its row has: plain, zebra or
 * highlighted. The hairline on its right edge separates it from those columns;
 * it is a pseudo-element because collapsed table borders do not travel with a
 * sticky cell.
 */
const STICKY_FIRST_COLUMN = cn(
  "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-[1]",
  "[&_tr>*:first-child]:after:absolute [&_tr>*:first-child]:after:inset-y-0 [&_tr>*:first-child]:after:right-0",
  "[&_tr>*:first-child]:after:w-px [&_tr>*:first-child]:after:bg-line-strong/40 [&_tr>*:first-child]:after:content-['']",
  "[&_thead_th:first-child]:z-20",
  "[&_tbody>tr>*:first-child]:bg-surface",
  "[&_tbody>tr[data-highlight]>*:first-child]:bg-accent-soft",
);


/**
 * A data table inside its own scroll area, so a wide timetable scrolls
 * sideways on a phone instead of breaking the page.
 *
 * Compose it from {@link TableHead}, {@link TableBody}, {@link TableRow},
 * {@link TableHeaderCell} and {@link TableCell}.
 */
export function Table({
  label,
  caption,
  zebra = false,
  dense = false,
  stickyHeader = false,
  stickyFirstColumn = false,
  maxHeight,
  wrapperClassName,
  className,
  children,
  ...rest
}: TableProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      style={maxHeight === undefined ? undefined : { maxHeight }}
      // On paper nothing scrolls: the height limit (an inline style, hence the `!`) and the clipping come off.
      className={cn("relative w-full overflow-auto rounded-lg border border-line bg-surface print:max-h-none! print:overflow-visible print:border-0", wrapperClassName)}
    >
      <table
        className={cn(
          "w-full border-collapse text-left text-base",
          zebra && "[&_tbody>tr:nth-child(even):not([data-highlight])]:bg-surface-sunken",
          zebra && stickyFirstColumn && "[&_tbody>tr:nth-child(even):not([data-highlight])>*:first-child]:bg-surface-sunken",
          dense && "text-sm [&_td]:py-1.5 [&_th]:py-1.5 [&_td]:px-3 [&_th]:px-3",
          stickyHeader && "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
          stickyFirstColumn && STICKY_FIRST_COLUMN,
          className,
        )}
        {...rest}
      >
        {caption ? <caption className="caption-top px-4 py-3 text-left text-sm text-fg-muted">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

/** The header rows of a table. */
export function TableHead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

/** The body rows of a table. */
export function TableBody({ className, ...rest }: ComponentProps<"tbody">) {
  return <tbody className={cn("[&>tr:last-child>*]:border-b-0", className)} {...rest} />;
}

/** Props of {@link TableRow}. */
export interface TableRowProps extends ComponentProps<"tr"> {
  /** Marks the row that matters now (today in the timetable). Add `aria-current="date"` where that is its meaning. */
  highlight?: boolean;
}

/** A table row. */
export function TableRow({ highlight = false, className, ...rest }: TableRowProps) {
  return <tr data-highlight={highlight ? "" : undefined} className={cn(highlight && "bg-accent-soft print-exact", className)} {...rest} />;
}

/** Props of {@link TableHeaderCell}. */
export interface TableHeaderCellProps extends ComponentProps<"th"> {
  /** Right-aligns the heading over a column of figures. */
  numeric?: boolean;
}

/** A heading cell. Defaults to `scope="col"`; pass `scope="row"` for the first cell of a body row. */
export function TableHeaderCell({ numeric = false, scope = "col", className, ...rest }: TableHeaderCellProps) {
  return (
    <th
      scope={scope}
      className={cn(
        "border-b border-line px-4 py-3 text-sm font-semibold whitespace-nowrap",
        scope === "row" ? "text-fg" : "bg-surface-raised text-fg-muted",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    />
  );
}

/** Props of {@link TableCell}. */
export interface TableCellProps extends ComponentProps<"td"> {
  /** Right-aligns the cell and uses tabular figures, for times, dates and counts. */
  numeric?: boolean;
}

/** A data cell. */
export function TableCell({ numeric = false, className, ...rest }: TableCellProps) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", numeric && "numerals text-right whitespace-nowrap", className)} {...rest} />;
}
