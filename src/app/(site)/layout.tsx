import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NoScriptStyles, SITE_FRAME } from "@/components/site/no-script";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/site/skip-link";
import { loadSettings } from "@/lib/server/data";
import { siteMetadata } from "@/lib/site/metadata";

/**
 * Titles and link previews carry the mosque's real name from the settings.
 * The settings are read at request time, so this metadata streams in with
 * the pages' own request-time content.
 */
export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata(await loadSettings());
}

/**
 * The frame of the public site: skip link, header, the page, footer.
 *
 * The layout itself is synchronous and is prerendered as the static shell.
 * The two places that need the settings (the mosque's name in the header,
 * the contact details in the footer) are async components inside their own
 * `<Suspense>` boundaries, each with a placeholder of the final size.
 */
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div {...SITE_FRAME} className="flex min-h-dvh flex-col print:block print:min-h-0">
      <NoScriptStyles />
      <SkipLink />
      <SiteHeader />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="w-full flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
