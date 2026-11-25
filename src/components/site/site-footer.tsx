import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/components/ui/cn";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme";
import { loadSettings } from "@/lib/server/data";
import { ContactDetails } from "./contact-details";
import { InstallSlot } from "./install-slot";
import { NEEDS_SCRIPT, NOSCRIPT_FALLBACK } from "./no-script";
import { SiteLink } from "./site-link";

/** A footer link to a page of the app: a full 44px touch target. */
const PAGE_LINK = cn(
  "inline-flex min-h-control items-center",
  "underline decoration-line-strong underline-offset-4 transition-colors duration-fast hover:text-fg hover:decoration-fg",
);

/**
 * The mosque's contact details from the settings. Only the fields the block
 * shows are passed on to the browser. Request-time: render inside `<Suspense>`.
 */
async function FooterContact() {
  const { mosqueName, tagline, address, phone, email, mapUrl, donateUrl } = await loadSettings();
  return <ContactDetails settings={{ mosqueName, tagline, address, phone, email, mapUrl, donateUrl }} />;
}

/** Stands in for {@link FooterContact} while the settings load: a name and two lines. */
function FooterContactSkeleton() {
  return (
    <div {...NOSCRIPT_FALLBACK} className="min-w-0">
      <div className="flex items-center gap-3">
        <LogoMark size={32} />
        <Skeleton className="h-6 w-44" />
      </div>
      <SkeletonText lines={2} className="mt-4 max-w-80" />
    </div>
  );
}

/**
 * The footer of the public site: the mosque's contact details, the site's
 * pages, the colour theme, and discreet links to the TV display and the
 * admin area. Works with no settings filled in. Not printed.
 */
export function SiteFooter() {
  return (
    <footer className="mt-section border-t border-line bg-surface text-fg-muted print:hidden">
      <div className="mx-auto max-w-page px-gutter py-10 sm:py-12">
        <InstallSlot />
        <div className="grid gap-x-16 gap-y-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <Suspense fallback={<FooterContactSkeleton />}>
            <FooterContact />
          </Suspense>
          <div className="flex flex-col gap-6">
            <nav aria-label="Footer">
              <ul className="grid grid-cols-2 gap-x-8 md:-mt-2.5">
                <li>
                  <SiteLink href="/" className={PAGE_LINK}>
                    Prayer times
                  </SiteLink>
                </li>
                <li>
                  <SiteLink href="/tv" className={PAGE_LINK}>
                    TV display
                  </SiteLink>
                </li>
                <li>
                  <SiteLink href="/timetable" className={PAGE_LINK}>
                    Timetable
                  </SiteLink>
                </li>
                <li>
                  <SiteLink href="/admin" className={PAGE_LINK}>
                    Admin
                  </SiteLink>
                </li>
              </ul>
            </nav>
            <div {...NEEDS_SCRIPT}>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
