"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { SiteLink } from "./site-link";

/** The pages of the public site, in menu order. */
const ITEMS = [
  { href: "/", label: "Prayer times" },
  { href: "/timetable", label: "Timetable" },
] as const;

/** Whether the page at `pathname` is the one a menu item points to (or sits below it). */
function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Props of {@link SiteNav}. */
export interface SiteNavProps {
  className?: string;
}

/**
 * The main menu of the public site. The current page is marked for screen
 * readers (`aria-current`) and with a brass underline. Each item is a full
 * 44px touch target.
 */
export function SiteNav({ className }: SiteNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex gap-1 max-sm:-mx-3">
        {ITEMS.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <li key={item.href}>
              <SiteLink
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-control items-center rounded-md px-3 text-base font-semibold transition-colors duration-fast hover:text-fg",
                  "after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-xs after:content-['']",
                  current ? "text-fg after:bg-accent" : "text-fg-muted",
                )}
              >
                {item.label}
              </SiteLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
