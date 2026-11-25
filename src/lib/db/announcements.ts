/**
 * The announcements repository. Announcements are short notices shown on the
 * public site, the TV display, or both, optionally limited to a range of days.
 */

import type { Row } from "@libsql/client";
import type { Announcement } from "@/lib/types";
import { executeWrite, getDb, withWriteTransaction } from "./client";
import {
  readDate,
  readFlag,
  readInteger,
  readRequiredText,
  toTimestamp,
  type Executor,
} from "./rows";
import {
  activeAnnouncementsQuerySchema,
  announcementInputSchema,
  announcementPatchSchema,
  rowIdSchema,
  type ActiveAnnouncementsQuery,
  type AnnouncementFields,
  type AnnouncementInput,
  type AnnouncementPatch,
} from "./schemas";

const SELECT_ANNOUNCEMENTS =
  "SELECT id, title, body, starts_on, ends_on, show_on_site, show_on_tv, pinned, " +
  "created_at, updated_at FROM announcements";

/** Pinned first, then newest; the id breaks ties between rows created in the same millisecond. */
const DISPLAY_ORDER = "ORDER BY pinned DESC, created_at DESC, id DESC";

/** Maps an `announcements` row to the shared type. */
function toAnnouncement(row: Row): Announcement {
  return {
    id: readInteger(row.id),
    title: readRequiredText(row.title),
    body: readRequiredText(row.body),
    startsOn: readDate(row.starts_on),
    endsOn: readDate(row.ends_on),
    showOnSite: readFlag(row.show_on_site),
    showOnTv: readFlag(row.show_on_tv),
    pinned: readFlag(row.pinned),
    createdAt: readRequiredText(row.created_at),
    updatedAt: readRequiredText(row.updated_at),
  };
}

/** The announcement with the given id, or null. */
async function findAnnouncement(executor: Executor, id: number): Promise<Announcement | null> {
  const result = await executor.execute({
    sql: `${SELECT_ANNOUNCEMENTS} WHERE id = ?`,
    args: [id],
  });
  return result.rows.length === 0 ? null : toAnnouncement(result.rows[0]);
}

/** Every announcement, including hidden and expired ones: pinned first, then newest. */
export async function listAnnouncements(): Promise<Announcement[]> {
  const db = await getDb();
  const result = await db.execute(`${SELECT_ANNOUNCEMENTS} ${DISPLAY_ORDER}`);
  return result.rows.map(toAnnouncement);
}

/**
 * The announcements to show on a screen at some point between `from` and
 * `to`: those whose own date range overlaps that window (an open start or end
 * counts as unlimited) and that are enabled for the audience. Pinned first,
 * then newest.
 *
 * `audience` is `site`, `tv` or `any` (the default: enabled for at least one
 * of the two). An announcement switched off for both is a draft and is never
 * returned, so drafts cannot leak into a public payload.
 *
 * @throws ZodError when a date is invalid or the window is reversed.
 */
export async function listActiveAnnouncements(
  query: ActiveAnnouncementsQuery,
): Promise<Announcement[]> {
  const { from, to, audience } = activeAnnouncementsQuerySchema.parse(query);
  const visible =
    audience === "site"
      ? "show_on_site = 1"
      : audience === "tv"
        ? "show_on_tv = 1"
        : "(show_on_site = 1 OR show_on_tv = 1)";
  const db = await getDb();
  const result = await db.execute({
    sql:
      `${SELECT_ANNOUNCEMENTS} WHERE ${visible} ` +
      "AND (starts_on IS NULL OR starts_on <= ?) AND (ends_on IS NULL OR ends_on >= ?) " +
      DISPLAY_ORDER,
    args: [to, from],
  });
  return result.rows.map(toAnnouncement);
}

/**
 * Stores a new announcement and returns it.
 * @param nowMs Clock for the timestamps, epoch milliseconds.
 * @throws ZodError when the input is invalid (title 1 to 120 characters, body
 *         up to 600, last day not before the first).
 */
export async function createAnnouncement(
  input: AnnouncementInput,
  nowMs: number = Date.now(),
): Promise<Announcement> {
  const fields: AnnouncementFields = announcementInputSchema.parse(input);
  const timestamp = toTimestamp(nowMs);
  const result = await executeWrite({
    sql:
      "INSERT INTO announcements (title, body, starts_on, ends_on, show_on_site, show_on_tv, " +
      "pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    args: [
      fields.title,
      fields.body,
      fields.startsOn,
      fields.endsOn,
      fields.showOnSite ? 1 : 0,
      fields.showOnTv ? 1 : 0,
      fields.pinned ? 1 : 0,
      timestamp,
      timestamp,
    ],
  });
  return {
    id: readInteger(result.rows[0].id),
    ...fields,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Changes the given fields of an announcement and returns the updated row, or
 * null when no announcement has that id. Fields left out keep their value.
 *
 * @param nowMs Clock for `updatedAt`, epoch milliseconds.
 * @throws ZodError when a field is invalid, or when the change would leave
 *         the last day before the first.
 */
export async function updateAnnouncement(
  id: number,
  patch: AnnouncementPatch,
  nowMs: number = Date.now(),
): Promise<Announcement | null> {
  const key = rowIdSchema.parse(id);
  const changes = announcementPatchSchema.parse(patch);
  const updatedAt = toTimestamp(nowMs);
  // Read and write in one transaction: the date order depends on the stored
  // row whenever the patch changes only one of the two dates.
  return withWriteTransaction(async (transaction) => {
    const current = await findAnnouncement(transaction, key);
    if (current === null) return null;
    const fields: AnnouncementFields = announcementInputSchema.parse({
      title: changes.title ?? current.title,
      body: changes.body ?? current.body,
      startsOn: changes.startsOn === undefined ? current.startsOn : changes.startsOn,
      endsOn: changes.endsOn === undefined ? current.endsOn : changes.endsOn,
      showOnSite: changes.showOnSite ?? current.showOnSite,
      showOnTv: changes.showOnTv ?? current.showOnTv,
      pinned: changes.pinned ?? current.pinned,
    });
    await transaction.execute({
      sql:
        "UPDATE announcements SET title = ?, body = ?, starts_on = ?, ends_on = ?, " +
        "show_on_site = ?, show_on_tv = ?, pinned = ?, updated_at = ? WHERE id = ?",
      args: [
        fields.title,
        fields.body,
        fields.startsOn,
        fields.endsOn,
        fields.showOnSite ? 1 : 0,
        fields.showOnTv ? 1 : 0,
        fields.pinned ? 1 : 0,
        updatedAt,
        key,
      ],
    });
    return { ...current, ...fields, updatedAt };
  });
}

/**
 * Deletes an announcement.
 * @returns True when a row was deleted, false when the id did not exist.
 */
export async function deleteAnnouncement(id: number): Promise<boolean> {
  const key = rowIdSchema.parse(id);
  const result = await executeWrite({
    sql: "DELETE FROM announcements WHERE id = ?",
    args: [key],
  });
  return result.rowsAffected > 0;
}
