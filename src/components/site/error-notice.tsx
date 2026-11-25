"use client";

import { Button, buttonClasses } from "@/components/ui/button";
import { errorReference } from "@/lib/site/errors";
import { PageNotice } from "./page-notice";
import { SiteLink } from "./site-link";

/** Props of {@link ErrorNotice}: what Next.js gives an error boundary, and where it is shown. */
export interface ErrorNoticeProps {
  /** Whatever was thrown. */
  error: unknown;
  /** Fetches and renders the failed part of the page again. */
  retry: () => void;
  /** True when nothing of the site is around the notice. See `PageNotice`. */
  standalone?: boolean;
}

/**
 * What a visitor sees when a page fails: a plain apology, a button that
 * tries again, and a link back to the prayer times. When the server gave the
 * error a reference it is shown, so staff can find it in the log.
 */
export function ErrorNotice({ error, retry, standalone = false }: ErrorNoticeProps) {
  const reference = errorReference(error);
  return (
    <PageNotice
      standalone={standalone}
      eyebrow="Something went wrong"
      title="This page could not be shown"
      description="Please try again in a moment. If it keeps happening, the mosque office can tell you today's prayer times."
      actions={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <SiteLink href="/" className={buttonClasses({ variant: "secondary" })}>
            Back to prayer times
          </SiteLink>
        </>
      }
      footnote={reference === null ? undefined : `Reference for staff: ${reference}`}
    />
  );
}
