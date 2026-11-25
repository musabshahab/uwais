"use client";

import { WarningIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";

/** Props of {@link AdminErrorNotice}: what Next.js hands an error boundary. */
export interface AdminErrorNoticeProps {
  /** Whatever was thrown. */
  error: unknown;
  /** Fetches and renders the failed part again. */
  retry: () => void;
  /** Where the secondary link goes. Defaults to the overview. */
  homeHref?: string;
  /** Label of the secondary link. */
  homeLabel?: string;
}

/** The server's reference for an error, when it gave one; staff can find it in the log. */
function errorReference(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest !== "" ? digest : null;
}

/**
 * What an admin sees when a page fails to load: a plain statement that
 * nothing was changed, a button that tries again and a way back. React has
 * already reported the cause to the console for whoever looks after the site.
 */
export function AdminErrorNotice({ error, retry, homeHref = "/admin", homeLabel = "Back to the overview" }: AdminErrorNoticeProps) {
  const reference = errorReference(error);
  return (
    <div role="alert" className="mx-auto flex max-w-prose flex-col items-center px-4 py-16 text-center">
      <span
        aria-hidden="true"
        className="mb-5 grid size-14 place-items-center bg-danger-soft text-danger-fg [clip-path:polygon(29.3%_0,70.7%_0,100%_29.3%,100%_70.7%,70.7%_100%,29.3%_100%,0_70.7%,0_29.3%)]"
      >
        <WarningIcon size={24} />
      </span>
      <h1 className="text-2xl text-fg">This page could not be loaded</h1>
      <p className="mt-2 text-base text-fg-muted">
        Something went wrong while fetching it. Nothing has been changed or lost. Please try again; if it keeps
        happening, tell the person who looks after the website.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button href={homeHref} variant="secondary">
          {homeLabel}
        </Button>
      </div>
      {reference ? <p className="numerals mt-6 text-sm text-fg-subtle">Reference: {reference}</p> : null}
    </div>
  );
}
