/**
 * Class lists shared by the pieces of the admin shell. Kept in a plain
 * module so Server and Client Components can both read them.
 */

/**
 * A link or button on the green header band. The focus ring is the light
 * brass of the band, because the usual ring is too dark to see on it.
 */
export const HEADER_ACTION =
  "inline-flex min-h-control items-center gap-2 rounded-md px-3 text-sm font-semibold text-on-brand transition-colors duration-fast hover:bg-brand-hover focus-visible:outline-on-brand-accent";

/** The width of the admin pages: wider than the public site, for the month grid and the import review. */
export const ADMIN_WIDTH = "mx-auto w-full max-w-[88rem] px-gutter";

/** A plain text link inside admin copy. */
export const TEXT_LINK =
  "rounded-xs font-semibold text-brand-fg underline decoration-brand-line underline-offset-4 transition-colors duration-fast hover:decoration-current";
