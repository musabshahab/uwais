/**
 * Class names the monthly timetable page shares with the placeholder shown
 * while its data loads, so the two have the same size. A plain module.
 */

/** The page-width frame. On paper it fills the sheet, which is A4 landscape. */
export const TIMETABLE_FRAME = "print-landscape mx-auto max-w-page px-gutter pt-6 sm:pt-10 print:max-w-none print:p-0";

/** The page heading: the month. */
export const TIMETABLE_HEADING = "font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl";

/** `Prayer timetable`, above the month. */
export const TIMETABLE_OVERLINE = "block font-sans text-xs font-semibold tracking-[0.14em] text-accent-fg uppercase";

/** The Hijri months, under the month. */
export const TIMETABLE_SUBHEADING = "mt-1 text-fg-muted";

/** The gap between the heading and the month navigation. */
export const TIMETABLE_NAV = "mt-6 sm:mt-8";

/** The frame of the table: it scrolls inside itself below `lg`. */
export const TIMETABLE_TABLE = "mt-4";
