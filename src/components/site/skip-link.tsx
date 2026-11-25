/** The id of the element the skip link jumps to: the page's `<main>`. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * The first focusable thing on every public page: lets keyboard and screen
 * reader users jump past the header straight to the content. Invisible until
 * it receives focus.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:inline-flex focus-visible:min-h-control focus-visible:items-center focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:font-semibold focus-visible:text-on-primary focus-visible:shadow-md print:hidden"
    >
      Skip to main content
    </a>
  );
}
