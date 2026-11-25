"use client";

import { useState } from "react";
import { MegaphoneIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import {
  applyLocalAnnouncements,
  describeAudience,
  describeSchedule,
  listByStatus,
  type LocalAnnouncementChanges,
} from "@/lib/admin/announcements";
import { plural } from "@/lib/admin/text";
import type { Announcement, DateString } from "@/lib/types";
import { AnnouncementDialog } from "./announcement-dialog";
import { DeleteAnnouncementDialog } from "./delete-announcement-dialog";
import { AnnouncementStatusBadge } from "./status-badge";

/** Props of {@link AnnouncementsManager}. */
export interface AnnouncementsManagerProps {
  /** Every stored announcement, in the order visitors see them. */
  announcements: readonly Announcement[];
  /** Today on the mosque's wall clock; decides each announcement's status. */
  today: DateString;
}

const NO_CHANGES: LocalAnnouncementChanges = new Map();

/** Which dialog is open, if any. */
type OpenDialog = { kind: "edit"; announcement: Announcement | null } | { kind: "delete"; announcement: Announcement };

/**
 * The list of announcements with the dialogs that add, change and delete
 * them. The list comes from the server and is refreshed by every action;
 * until the refreshed list arrives, a beat after the action answers, what
 * was just saved or deleted here is laid over it.
 */
export function AnnouncementsManager({ announcements: stored, today }: AnnouncementsManagerProps) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // A fresh list from the server already holds everything that was changed here.
  const [changes, setChanges] = useState<LocalAnnouncementChanges>(NO_CHANGES);
  const [seenStored, setSeenStored] = useState(stored);
  if (seenStored !== stored) {
    setSeenStored(stored);
    setChanges(NO_CHANGES);
  }
  const announcements = applyLocalAnnouncements(stored, changes);
  const items = listByStatus(announcements, today);
  const active = items.filter((item) => item.status === "active").length;

  const open = (next: OpenDialog) => {
    setMessage(null);
    setDialog(next);
  };
  const close = () => setDialog(null);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-base text-fg-muted">
            {announcements.length === 0
              ? "No announcements yet."
              : `${plural(announcements.length, "announcement")}, ${active} on show today.`}
          </p>
          <Status tone="success">{message}</Status>
        </div>
        <Button iconStart={<PlusIcon />} onClick={() => open({ kind: "edit", announcement: null })}>
          New announcement
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState
            icon={<MegaphoneIcon />}
            title="Nothing to announce yet"
            description="Tell people about a class, a collection, a visiting speaker or a change to the prayer times. Each announcement can run between two dates and appear on the website, the TV display, or both."
            actions={
              <Button variant="secondary" iconStart={<PlusIcon />} onClick={() => open({ kind: "edit", announcement: null })}>
                Write the first one
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ announcement, status }) => (
            <li
              key={announcement.id}
              className="flex flex-col gap-4 rounded-lg border border-line bg-surface px-5 py-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:px-6"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <AnnouncementStatusBadge status={status} />
                  {announcement.pinned ? <Badge tone="accent">Pinned</Badge> : null}
                </p>
                <h2 className="mt-2 text-lg leading-snug break-words text-fg">{announcement.title}</h2>
                {announcement.body !== "" ? (
                  <p className="mt-1 line-clamp-3 max-w-prose text-base break-words whitespace-pre-line text-fg-muted">
                    {announcement.body}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-fg-muted">
                  {describeAudience(announcement)} · {describeSchedule(announcement)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  iconStart={<PencilIcon />}
                  onClick={() => open({ kind: "edit", announcement })}
                >
                  Edit<span className="sr-only">: {announcement.title}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconStart={<TrashIcon />}
                  onClick={() => open({ kind: "delete", announcement })}
                >
                  Delete<span className="sr-only">: {announcement.title}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "edit" ? (
        <AnnouncementDialog
          // A different announcement is a different form.
          key={dialog.announcement?.id ?? "new"}
          announcement={dialog.announcement}
          today={today}
          onClose={close}
          onSaved={(announcement, text) => {
            setChanges((current) => new Map(current).set(announcement.id, announcement));
            setMessage(text);
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteAnnouncementDialog
          announcement={dialog.announcement}
          onClose={close}
          onDeleted={(id, text) => {
            setChanges((current) => new Map(current).set(id, null));
            setMessage(text);
          }}
        />
      ) : null}
    </>
  );
}
