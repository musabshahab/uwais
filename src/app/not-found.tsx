import type { Metadata } from "next";
import { buttonClasses } from "@/components/ui/button";
import { PageNotice } from "@/components/site/page-notice";
import { SiteLink } from "@/components/site/site-link";

/** `absolute`: the root layout's title template carries the placeholder name, not the mosque's own. */
export const metadata: Metadata = {
  title: { absolute: "Page not found" },
};

/**
 * Shown for any address the app does not know. Next.js ships this file with
 * every route, so it is a small Server Component with plain links and no
 * data of its own.
 */
export default function NotFound() {
  return (
    <PageNotice
      standalone
      eyebrow="Error 404"
      title="Page not found"
      description="There is nothing at this address. It may have moved, or the link may have been mistyped."
      actions={
        <>
          <SiteLink href="/" className={buttonClasses()}>
            Today&apos;s prayer times
          </SiteLink>
          <SiteLink href="/timetable" className={buttonClasses({ variant: "secondary" })}>
            Monthly timetable
          </SiteLink>
        </>
      }
    />
  );
}
