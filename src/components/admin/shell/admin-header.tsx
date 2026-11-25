"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarIcon,
  CloseIcon,
  ClockIcon,
  ExternalLinkIcon,
  MegaphoneIcon,
  MenuIcon,
  SettingsIcon,
  TvIcon,
  UploadIcon,
  type IconComponent,
} from "@/components/brand/icons";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/components/ui/cn";
import { ADMIN_NAV_ITEMS, isCurrentNavItem, type AdminNavId } from "@/lib/admin/nav";
import { TV_PATH } from "@/lib/admin/tv-url";
import { ADMIN_WIDTH, HEADER_ACTION } from "./styles";

const NAV_ICONS: Record<AdminNavId, IconComponent> = {
  overview: ClockIcon,
  import: UploadIcon,
  timetable: CalendarIcon,
  announcements: MegaphoneIcon,
  settings: SettingsIcon,
};

/** Props of {@link AdminHeader}. */
export interface AdminHeaderProps {
  /** The mosque's name, streamed in by the server. */
  mosqueName: ReactNode;
  /** The sign-out form. It is rendered twice: in the band on wide screens and in the menu on narrow ones. */
  signOut: ReactNode;
}

/** The two links that leave the admin area; each opens in a new tab so unsaved work stays put. */
function OutsideLinks({ className, linkClassName }: { className?: string; linkClassName: string }) {
  return (
    <ul className={className}>
      <li>
        <a href="/" target="_blank" rel="noopener" className={linkClassName}>
          <ExternalLinkIcon />
          View site
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>
      <li>
        <a href={TV_PATH} target="_blank" rel="noopener" className={linkClassName}>
          <TvIcon />
          TV display
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>
    </ul>
  );
}

/**
 * The header of the signed-in admin area: a green band with the mosque's
 * name, and the menu.
 *
 * On wide screens the menu is a row of tabs under the band and the links out
 * (view site, TV display, sign out) sit in the band. On a phone everything
 * folds into one panel behind the Menu button; choosing a page closes it, and
 * so does Escape.
 */
export function AdminHeader({ mosqueName, signOut }: AdminHeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="border-b border-line bg-surface print:hidden">
      <div className="bg-brand text-on-brand">
        <div className={cn(ADMIN_WIDTH, "flex min-h-14 items-center gap-3")}>
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="-mx-1.5 flex min-h-control min-w-0 items-center gap-2.5 rounded-md px-1.5 focus-visible:outline-on-brand-accent"
          >
            <LogoMark size={28} tone="mono" />
            <span className="truncate font-display text-lg leading-tight font-semibold tracking-tight">
              {mosqueName}
            </span>
            <span className="rounded-xs border border-on-brand-accent/60 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-on-brand-accent uppercase">
              Admin
            </span>
          </Link>

          <div className="ml-auto hidden items-center gap-1 lg:flex">
            <OutsideLinks className="flex items-center gap-1" linkClassName={HEADER_ACTION} />
            {signOut}
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className={cn(HEADER_ACTION, "-mr-3 ml-auto lg:hidden")}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
            Menu
          </button>
        </div>
      </div>

      <div id={panelId} className={cn(ADMIN_WIDTH, "lg:block", open ? "block" : "hidden")}>
        <nav aria-label="Admin" className="max-lg:py-2">
          <ul className="flex flex-col lg:-mx-3 lg:flex-row lg:gap-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const current = isCurrentNavItem(pathname, item.href);
              const Icon = NAV_ICONS[item.id];
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "relative flex min-h-12 items-center gap-2.5 rounded-md px-3 text-base font-semibold transition-colors duration-fast hover:text-fg",
                      "after:absolute after:content-[''] max-lg:after:inset-y-2.5 max-lg:after:left-0 max-lg:after:w-0.5 lg:after:inset-x-3 lg:after:bottom-0 lg:after:h-0.5",
                      current ? "text-fg after:bg-accent" : "text-fg-muted",
                    )}
                  >
                    <Icon className={current ? "text-accent-fg" : undefined} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="-mx-gutter bg-brand px-gutter py-2 text-on-brand lg:hidden">
          <OutsideLinks className="flex flex-col" linkClassName={cn(HEADER_ACTION, "w-full")} />
          {signOut}
        </div>
      </div>
    </header>
  );
}
