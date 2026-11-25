import { describeAudience, describeSchedule, type AnnouncementStatus } from "@/lib/admin/announcements";
import { isValidDateString } from "@/lib/time";
import { AnnouncementStatusBadge } from "./status-badge";

/** Props of {@link AnnouncementPreview}. */
export interface AnnouncementPreviewProps {
  title: string;
  body: string;
  /** `YYYY-MM-DD`, or empty for "no limit". */
  startsOn: string;
  endsOn: string;
  showOnSite: boolean;
  showOnTv: boolean;
  pinned: boolean;
  /** The status these values give today. */
  status: AnnouncementStatus;
}

/**
 * The announcement as it will read, with where and when it will be shown.
 * It follows the form as it is typed, so the outcome is clear before saving.
 */
export function AnnouncementPreview({ title, body, startsOn, endsOn, showOnSite, showOnTv, pinned, status }: AnnouncementPreviewProps) {
  const schedule = describeSchedule({
    startsOn: isValidDateString(startsOn) ? startsOn : null,
    endsOn: isValidDateString(endsOn) ? endsOn : null,
  });
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-4">
      <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Preview</p>
      <div className="mt-2 border-l-2 border-accent pl-3.5">
        <p className="font-display text-lg leading-snug font-semibold break-words text-fg">
          {title.trim() === "" ? <span className="text-fg-subtle">Your title appears here</span> : title}
        </p>
        {body.trim() !== "" ? (
          <p className="mt-1 text-base break-words whitespace-pre-line text-fg-muted">{body}</p>
        ) : null}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
        <AnnouncementStatusBadge status={status} />
        <span>{describeAudience({ showOnSite, showOnTv })}</span>
        <span aria-hidden="true">·</span>
        <span>{schedule}</span>
        {pinned ? (
          <>
            <span aria-hidden="true">·</span>
            <span>Pinned to the top</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
