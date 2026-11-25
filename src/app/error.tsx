"use client";

import { ErrorNotice } from "@/components/site/error-notice";

/**
 * The error boundary of the whole app, below the root layout. It catches
 * what no nearer boundary does, including a failure of the public site's
 * own header or footer, so it stands alone rather than inside the site frame.
 * It names the document itself: the page's own title may be what failed.
 */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <title>Something went wrong</title>
      <ErrorNotice standalone error={error} retry={retry} />
    </>
  );
}
