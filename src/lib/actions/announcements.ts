"use server";

/**
 * Creating, changing and deleting announcements. The create and update
 * actions take a plain object or the announcement form as `FormData` (fields
 * `title`, `body`, `startsOn`, `endsOn`, and the checkboxes `showOnSite`,
 * `showOnTv` and `pinned`, where an unticked box means `false`).
 */

import type { AnnouncementInput, AnnouncementPatch } from "@/lib/db/schemas";
import {
  createAnnouncementFrom,
  deleteAnnouncementById,
  updateAnnouncementFrom,
} from "./core/announcements";
import { denyUnlessAdmin, runMutation } from "./guard";
import type { AnnouncementResult, DeleteAnnouncementResult } from "./types";

/**
 * Stores a new announcement and returns it. Only the title is required.
 * Invalid fields come back in `fieldErrors`.
 */
export async function createAnnouncementAction(
  input: AnnouncementInput | FormData,
): Promise<AnnouncementResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runMutation("createAnnouncement", () => createAnnouncementFrom(input));
}

/**
 * Changes an announcement and returns it as stored. With an object, fields
 * that are left out keep their value. Answers `not-found` when the
 * announcement has been deleted in the meantime.
 *
 * @param id    Id of the announcement; bind it for use as a form action.
 * @param input The fields to change, or the whole announcement form.
 */
export async function updateAnnouncementAction(
  id: number,
  input: AnnouncementPatch | FormData,
): Promise<AnnouncementResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runMutation("updateAnnouncement", () => updateAnnouncementFrom(id, input));
}

/** Deletes an announcement. Answers `not-found` when it is already gone. */
export async function deleteAnnouncementAction(id: number): Promise<DeleteAnnouncementResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  return runMutation("deleteAnnouncement", () => deleteAnnouncementById(id));
}
