"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AdminDialog } from "../admin-dialog";
import { deleteAnnouncementAction } from "@/lib/actions/announcements";
import type { ActionFailure } from "@/lib/actions/types";
import type { Announcement } from "@/lib/types";
import { failureMessage, useAdminAction } from "../use-admin-action";

/** Props of {@link DeleteAnnouncementDialog}. */
export interface DeleteAnnouncementDialogProps {
  announcement: Announcement;
  onClose: () => void;
  /** Called once the announcement is gone, with its id and a sentence for the page's status line. */
  onDeleted: (id: number, message: string) => void;
}

/** Asks before an announcement is deleted for good. Mount it only while it is open. */
export function DeleteAnnouncementDialog({ announcement, onClose, onDeleted }: DeleteAnnouncementDialogProps) {
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const run = useAdminAction();

  const confirm = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await run(() => deleteAnnouncementAction(announcement.id));
      // Already gone is the outcome that was asked for.
      if (result.ok || result.code === "not-found") {
        onDeleted(announcement.id, "The announcement was deleted.");
        onClose();
      } else {
        setFailure(result);
      }
    });
  };

  return (
    <AdminDialog
      open
      onClose={onClose}
      dismissible={!pending}
      size="sm"
      title="Delete this announcement?"
      description="It is removed from the website and the TV display straight away. This cannot be undone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={confirm} loading={pending} loadingLabel="Deleting">
            Delete
          </Button>
        </>
      }
    >
      <p className="rounded-md bg-surface-sunken px-3.5 py-3 text-base font-semibold break-words text-fg">
        {announcement.title}
      </p>
      {failure ? (
        <Alert tone="danger" announce className="mt-4">
          {failureMessage(failure)}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
