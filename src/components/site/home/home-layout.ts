/**
 * The class names that give the blocks of the home page their size. The live
 * blocks (Client Components) and the placeholder shown while the data loads
 * (part of the prerendered shell) both use them, so the placeholder has the
 * size of the real thing by construction and nothing moves when it arrives.
 * A plain module: it can be imported from the server and from the browser.
 */

/** The page-width grid of the home page. */
export const HOME_GRID =
  "mx-auto grid max-w-page gap-2 px-gutter pt-2 sm:gap-8 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_22rem] max-sm:[@media(min-height:720px)]:gap-5 max-sm:[@media(min-height:720px)]:pt-5";

/** The stack of secondary blocks beside (on a phone, below) the prayer times. */
export const HOME_ASIDE = "flex min-w-0 flex-col gap-5 sm:gap-6";

/** A small spaced-out label above a figure or a block. */
export const OVERLINE = "text-xs font-semibold tracking-[0.14em] uppercase";

/* The next-prayer panel. */

/** The panel itself: deep green, in both themes. It spans the grid from `lg` up. */
export const HERO_PANEL = "relative min-w-0 rounded-xl bg-brand text-on-brand shadow-md print-exact lg:col-span-2";

/** The times card in the grid. */
export const TIMES_CARD = "min-w-0 self-start overflow-hidden";

/**
 * The panel's content. Tight on a phone, where every pixel above the times
 * counts; roomier on phones tall enough to afford it and from `sm` up. From
 * `xl` up, where a long event name and both figures fit on one line, the
 * figures sit beside the name.
 */
export const HERO_BODY =
  "relative grid gap-x-12 gap-y-3 px-4 py-3 sm:gap-y-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end max-sm:[@media(min-height:720px)]:py-4";

/** The date line: one line on a phone, the full date from `sm` up. */
export const HERO_DATE_LINE = "flex gap-x-2.5 overflow-hidden text-xs whitespace-nowrap sm:gap-x-3 sm:text-base";

/** The `Next prayer` overline; only announced, not shown, on a phone. */
export const HERO_HEADING = `text-on-brand-accent max-sm:sr-only sm:mt-6 ${OVERLINE}`;

/** The line that names the next event. */
export const HERO_NAME_LINE = "mt-2 flex items-baseline justify-between gap-4 sm:mt-1 sm:justify-start";

/** The name of the next event. */
export const HERO_NAME =
  "block font-display text-xl leading-tight font-semibold tracking-tight min-[360px]:text-2xl sm:text-4xl";

/** The row holding the time and the countdown. */
export const HERO_FIGURES =
  "flex min-h-14 items-end justify-between gap-4 min-[360px]:gap-6 sm:min-h-18 sm:gap-10 sm:border-t sm:border-on-brand/20 sm:pt-4 xl:justify-end xl:border-0 xl:pt-0";

/** The label above a figure. */
export const HERO_FIGURE_LABEL = `text-on-brand/80 ${OVERLINE}`;

/** The gap between a figure and its label. */
export const HERO_FIGURE_VALUE = "mt-0.5 sm:mt-1";

/* A size down below 360px, where `12:59 PM` and a ten-hour countdown would not share the line. */
const HERO_FIGURE = "time-numerals text-time-lg max-[359.9px]:text-3xl max-[359.9px]:leading-none";

/*
 * Beside the name (from `xl`) the two figures are packed to the right, so a
 * figure that changed width would push the other one sideways. Each is
 * given the width of its longest value: `12:59 PM` and `12:34:56`.
 */

/** The time of the next event. */
export const HERO_TIME = `${HERO_FIGURE} xl:inline-block xl:min-w-[3.6em]`;

/** The countdown to it. */
export const HERO_COUNTDOWN = `${HERO_FIGURE} text-on-brand-accent xl:inline-block xl:min-w-[4.05em]`;

/*
 * The times card. The whole point of the page is that the next prayer and
 * all six rows are visible without scrolling, so below `sm` everything is
 * tight by default (which is what fits a 320 x 640 screen) and relaxes on
 * phones tall enough to afford it.
 */

/** The card's header: previous day, the day on show, next day. */
export const TIMES_HEADER =
  "flex items-center gap-1 px-2 py-1 sm:px-4 sm:pt-4 sm:pb-3 max-sm:[@media(min-height:720px)]:py-2";

/** `Today`, `Tomorrow`, `In 5 days`. */
export const TIMES_TITLE = "font-display text-lg leading-tight font-semibold tracking-tight sm:text-xl";

/** The date under the title. */
export const TIMES_DATE = "text-sm text-fg-muted";

/** A column heading of the times table. */
export const TIMES_COLUMN_HEADING = "pb-1 text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase sm:pb-2";

/** A row of the times table. */
export const TIMES_ROW = "border-t border-line";

/** The vertical padding of the cells of a row. */
export const TIMES_ROW_PADDING = "py-1 sm:py-3 max-sm:[@media(min-height:720px)]:py-2.5";

/* The three columns: gutters narrow below 360px, where a 12-hour time and a prayer name barely share a row. */
export const TIMES_NAME_COLUMN = "pr-1 pl-3 text-left align-middle font-normal min-[360px]:pr-2 min-[360px]:pl-4 sm:pl-6";
export const TIMES_BEGINS_COLUMN = "px-1.5 text-right align-middle min-[360px]:px-2";
export const TIMES_JAMAAT_COLUMN = "pr-3 pl-1.5 text-right align-middle min-[360px]:pr-4 min-[360px]:pl-2 sm:pr-6";

/** A time in the table. */
export const TIMES_TIME = "time-numerals text-lg min-[360px]:text-time";

/** The sunrise time: a size down on a phone, where its row is a single line. */
export const TIMES_SUNRISE_TIME = "time-numerals text-lg min-[360px]:text-xl sm:text-time";

/** The classes of the name cell of a row: the wrapper, the English name and the line with the Arabic name. */
export function timesNameClasses(sunrise: boolean): { stack: string; name: string; detail: string; arabic: string } {
  // Two lines on a phone (one for sunrise, which never carries a label), one line from `sm` up.
  return sunrise
    ? {
        stack: "flex items-baseline gap-1.5 min-[360px]:gap-2 sm:items-center sm:gap-3",
        name: "font-display text-sm leading-[1.15] font-semibold min-[360px]:text-base",
        detail: "flex items-center gap-2",
        arabic: "text-xs leading-none min-[360px]:text-sm",
      }
    : {
        stack: "flex flex-col sm:flex-row sm:items-center sm:gap-3",
        name: "font-display text-lg leading-[1.15] font-semibold sm:text-xl",
        detail: "flex h-5 items-center gap-2 sm:h-6",
        arabic: "text-sm leading-none sm:text-lg",
      };
}

/**
 * The place of the `Now` and `Next` labels in a row. It is as wide as a
 * label whether or not the row has one, so the columns of the table do not
 * move when the labels appear or pass from one row to the next.
 */
export const TIMES_STATUS_SLOT = "inline-flex min-w-11";

/** The card's footer: back to today, and the link to the full timetable. */
export const TIMES_FOOTER = "flex items-center justify-between gap-2 border-t border-line px-2 py-2 sm:px-4";
