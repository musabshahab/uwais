/**
 * Creating, changing and deleting announcements, without the Server Action
 * wrapping.
 *
 * The create and update functions take either a plain object or the
 * announcement form as `FormData` (fields `title`, `body`, `startsOn`,
 * `endsOn` and the checkboxes `showOnSite`, `showOnTv`, `pinned`). As in a
 * browser, a checkbox that is not ticked is simply absent from the form and
 * means `false`.
 */

import { z } from "zod";
import {
  announcementInputSchema,
  announcementPatchSchema,
  createAnnouncement,
  deleteAnnouncement,
  rowIdSchema,
  updateAnnouncement,
} from "@/lib/db";
import type { ActionFailure, AnnouncementResult, DeleteAnnouncementResult } from "../types";
import { serverNowMs } from "@/lib/server/clock";
import { isFormData, readFlag, readText } from "./form";
import { failure, validationFailure, type FieldLabels } from "./result";

const ANNOUNCEMENT_LABELS: FieldLabels = {
  title: "Title",
  body: "Text",
  startsOn: "First day",
  endsOn: "Last day",
};

/** The answer for an id that matches no announcement. */
function announcementGone(): ActionFailure {
  return failure(
    "not-found",
    "This announcement no longer exists. It may have been deleted in another window.",
  );
}

/** The announcement form as an object; a plain object is passed through untouched. */
function readAnnouncementInput(payload: unknown): unknown {
  if (!isFormData(payload)) return payload;
  return {
    title: readText(payload, "title") ?? undefined,
    body: readText(payload, "body") ?? undefined,
    startsOn: readText(payload, "startsOn")?.trim(),
    endsOn: readText(payload, "endsOn")?.trim(),
    showOnSite: readFlag(payload, "showOnSite"),
    showOnTv: readFlag(payload, "showOnTv"),
    pinned: readFlag(payload, "pinned"),
  };
}

/**
 * Stores a new announcement. Only the title is required; see
 * `announcementInputSchema` for the defaults and limits.
 * @param payload Untrusted: a `FormData` or a plain object.
 * @param nowMs   Clock, epoch milliseconds.
 * @throws when the database cannot be written.
 */
export async function createAnnouncementFrom(
  payload: unknown,
  nowMs: number = serverNowMs(),
): Promise<AnnouncementResult> {
  const parsed = announcementInputSchema.safeParse(readAnnouncementInput(payload));
  if (!parsed.success) return validationFailure(parsed.error, { labels: ANNOUNCEMENT_LABELS });
  return { ok: true, announcement: await createAnnouncement(parsed.data, nowMs) };
}

/**
 * Changes an announcement. With an object, fields that are left out keep
 * their stored value; a `FormData` is the whole form (see the top of this file).
 * @param id      Untrusted id of the announcement.
 * @param payload Untrusted: a `FormData` or a plain object.
 * @param nowMs   Clock, epoch milliseconds.
 * @throws when the database cannot be written.
 */
export async function updateAnnouncementFrom(
  id: unknown,
  payload: unknown,
  nowMs: number = serverNowMs(),
): Promise<AnnouncementResult> {
  const key = rowIdSchema.safeParse(id);
  if (!key.success) return announcementGone();
  const parsed = announcementPatchSchema.safeParse(readAnnouncementInput(payload));
  if (!parsed.success) return validationFailure(parsed.error, { labels: ANNOUNCEMENT_LABELS });
  try {
    const announcement = await updateAnnouncement(key.data, parsed.data, nowMs);
    return announcement === null ? announcementGone() : { ok: true, announcement };
  } catch (error) {
    // The repository checks the dates again against the stored row: a new
    // last day can be valid on its own and still fall before the stored first day.
    if (error instanceof z.ZodError) {
      return validationFailure(error, { labels: ANNOUNCEMENT_LABELS });
    }
    throw error;
  }
}

/**
 * Deletes an announcement.
 * @param id Untrusted id of the announcement.
 * @throws when the database cannot be written.
 */
export async function deleteAnnouncementById(id: unknown): Promise<DeleteAnnouncementResult> {
  const key = rowIdSchema.safeParse(id);
  if (!key.success) return announcementGone();
  const deleted = await deleteAnnouncement(key.data);
  return deleted ? { ok: true, id: key.data } : announcementGone();
}
