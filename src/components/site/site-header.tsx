import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { loadSettings } from "@/lib/server/data";
import { NEEDS_SCRIPT, NOSCRIPT_FALLBACK, noScriptReveal } from "./no-script";
import { SiteLink } from "./site-link";
import { SiteNav } from "./site-nav";
import { ThemeButton } from "./theme-button";

/** The mosque's name from the settings. Request-time: render it inside `<Suspense>`. */
async function MosqueName() {
  const settings = await loadSettings();
  return <span {...noScriptReveal("name")}>{settings.mosqueName}</span>;
}

/**
 * The header of the public site: the mark and the mosque's name (a link
 * home), the main menu and the theme switch.
 *
 * The name is the only part that needs data. It streams into a placeholder
 * of the same height, so the default name never flashes and nothing moves
 * when the real one arrives; the row is tall enough for a long name that
 * wraps onto two lines. Below the `sm` breakpoint the menu drops onto a row
 * of its own.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface print:hidden">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-2 px-gutter sm:gap-x-4">
        <SiteLink
          href="/"
          className="-mx-1.5 flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-fg sm:min-h-16 sm:gap-3"
        >
          <LogoMark size={32} />
          <span className="line-clamp-2 min-w-0 font-display text-lg leading-tight font-semibold tracking-tight sm:text-xl">
            <Suspense
              fallback={
                <span {...NOSCRIPT_FALLBACK} className="block">
                  <Skeleton className="h-5 w-36 max-w-full" />
                </span>
              }
            >
              <MosqueName />
            </Suspense>
          </span>
        </SiteLink>
        <SiteNav className="order-last w-full sm:order-none sm:w-auto" />
        <span {...NEEDS_SCRIPT} className="-mr-2.5 flex">
          <ThemeButton />
        </span>
      </div>
    </header>
  );
}
