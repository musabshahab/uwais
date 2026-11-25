import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ANNOUNCEMENT_STATUS_LABELS, type AnnouncementStatus } from "@/lib/admin/announcements";

const STATUS_TONES: Record<AnnouncementStatus, BadgeTone> = {
  active: "success",
  scheduled: "info",
  hidden: "warning",
  ended: "neutral",
};

/** The status of an announcement as a small coloured label. */
export function AnnouncementStatusBadge({ status }: { status: AnnouncementStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{ANNOUNCEMENT_STATUS_LABELS[status]}</Badge>;
}
