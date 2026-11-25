import { MegaphoneIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { plural } from "@/lib/admin/text";

/** Props of {@link AnnouncementsSummary}. */
export interface AnnouncementsSummaryProps {
  /** Announcements on show today. */
  active: number;
  /** Announcements waiting for their start date. */
  scheduled: number;
}

/** How many announcements are on show right now, with the way to manage them. */
export function AnnouncementsSummary({ active, scheduled }: AnnouncementsSummaryProps) {
  return (
    <Card as="section" aria-labelledby="announcements-summary-title">
      <CardHeader>
        <CardTitle id="announcements-summary-title">Announcements</CardTitle>
      </CardHeader>
      <CardBody className="pt-3">
        <p className="flex items-baseline gap-3">
          <span className="time-numerals text-time-lg font-semibold text-fg">{active}</span>
          <span className="text-base text-fg-muted">
            {active === 1 ? "announcement is" : "announcements are"} on show today
          </span>
        </p>
        <p className="mt-2 text-base text-fg-muted">
          {scheduled > 0
            ? `${plural(scheduled, "more announcement")} ${scheduled === 1 ? "is" : "are"} scheduled to start later.`
            : active === 0
              ? "Use one to tell people about a class, a collection or a change to the times."
              : "Nothing else is scheduled."}
        </p>
      </CardBody>
      <CardFooter>
        <Button href="/admin/announcements" variant="secondary" size="sm" iconStart={<MegaphoneIcon />}>
          Manage announcements
        </Button>
      </CardFooter>
    </Card>
  );
}
