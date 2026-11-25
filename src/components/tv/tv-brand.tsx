"use client";

import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/components/ui/cn";
import { useDisplay } from "@/lib/client";
import { nameScale } from "@/lib/tv/text";

/**
 * The mosque's mark and name at the top of the TV display. The name comes
 * from the live settings, so a correction in the admin area reaches the wall
 * without a reload. A long name is set smaller and may run to two lines.
 *
 * Must be rendered inside `DisplayProvider`.
 */
export function TvBrand() {
  const { settings } = useDisplay();
  const name = settings.mosqueName;
  return (
    <header className="tvx-brand">
      {/* Sized in em, so the stylesheet scales the mark with the TV unit. */}
      <LogoMark size="1em" detail="facets" className="tvx-brand-mark" />
      <h1 className={cn("tv-display tvx-brand-name", `tvx-brand-name-${nameScale(name)}`)}>
        {name}
      </h1>
    </header>
  );
}
