"use client";

import { ErrorNotice } from "@/components/site/error-notice";

/**
 * The error boundary of the public pages. It replaces only the page, so the
 * site's header and footer, and with them the way to every other page, stay.
 */
export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorNotice error={error} retry={retry} />;
}
