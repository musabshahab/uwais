"use client";

import { CalendarIcon } from "@/components/brand/icons";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useDisplay } from "@/lib/client";
import { formatDateLong } from "@/lib/time";
import { SiteLink } from "../site-link";

/** Props of {@link NoTimetable}. */
export interface NoTimetableProps {
  className?: string;
}

/**
 * Takes the place of the prayer times when the page has none to show for
 * today or the weeks ahead: either nothing has been published yet, or the
 * published timetable does not reach this period. Says which, and points
 * staff to the admin area. Must be rendered inside `DisplayProvider`.
 */
export function NoTimetable({ className }: NoTimetableProps) {
  const { payload } = useDisplay();
  const { firstDate, lastDate } = payload.coverage;
  const published = firstDate !== null && lastDate !== null;

  return (
    <Card as="section" className={className}>
      <EmptyState
        icon={<CalendarIcon />}
        title={published ? "No prayer times for the coming weeks" : "Prayer times have not been published yet"}
        description={
          published
            ? `The published timetable runs from ${formatDateLong(firstDate)} to ${formatDateLong(lastDate)}. Please check with the mosque for current times.`
            : "The mosque has not added its timetable yet. Please check back soon."
        }
        actions={
          <>
            {published ? (
              <SiteLink href="/timetable" className={buttonClasses({ variant: "primary" })}>
                See the timetable
              </SiteLink>
            ) : null}
            <SiteLink href="/admin" className={buttonClasses({ variant: published ? "secondary" : "primary" })}>
              Staff: add the timetable
            </SiteLink>
          </>
        }
      />
    </Card>
  );
}
