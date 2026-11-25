"use client";

import { ErrorNotice } from "@/components/site/error-notice";
import { fontVariables } from "@/fonts";
import "./globals.css";

/**
 * The last resort: shown when the root layout itself fails. It replaces the
 * whole document, so it brings its own `<html>` and `<body>`, the global
 * styles and the fonts. It follows the device's colour scheme, because the
 * visitor's saved theme is applied by the layout that just failed.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <title>Something went wrong</title>
        <ErrorNotice standalone error={error} retry={retry} />
      </body>
    </html>
  );
}
