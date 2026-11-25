"use client";

import { useId } from "react";
import { MegaphoneIcon } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { useActiveAnnouncements } from "@/lib/client";

/** Props of {@link Announcements}. */
export interface AnnouncementsProps {
  className?: string;
}

/**
 * The mosque's current announcements for the website, pinned ones first.
 * Renders nothing when there are none. Must be rendered inside
 * `DisplayProvider`.
 */
export function Announcements({ className }: AnnouncementsProps) {
  const headingId = useId();
  const announcements = useActiveAnnouncements("site");
  if (announcements.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight">
        <MegaphoneIcon className="text-accent-fg" />
        Announcements
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {announcements.map((announcement) => (
          <li
            key={announcement.id}
            className={cn(
              "rounded-lg border bg-surface px-5 py-4 shadow-sm",
              announcement.pinned ? "border-accent-line" : "border-line",
            )}
          >
            <article>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <h3 className="min-w-0 font-sans text-base font-semibold tracking-normal text-fg">{announcement.title}</h3>
                {announcement.pinned ? <Badge tone="accent">Pinned</Badge> : null}
              </div>
              {announcement.body.trim() !== "" ? (
                <p className="mt-1 text-base whitespace-pre-line text-fg-muted">{announcement.body}</p>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
