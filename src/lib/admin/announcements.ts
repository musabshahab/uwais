/**
 * Announcements as the admin list presents them: where each one stands
 * today, when it runs, where it is shown, and the editing form's state.
 */

import type { AnnouncementInput } from "@/lib/db/schemas";
import { isValidDateString } from "@/lib/time";
import type { Announcement, DateString } from "@/lib/types";
import { formatDateFull } from "./text";

/**
 * Where an announcement stands on a given day.
 *
 * - `ended`: its last day has passed.
 * - `hidden`: it is switched off for both the website and the TV.
 * - `scheduled`: its first day is still to come.
 * - `active`: it is being shown today.
 */
export type AnnouncementStatus = "active" | "scheduled" | "ended" | "hidden";

/** The parts of an announcement its status depends on. */
export type AnnouncementTiming = Pick<Announcement, "startsOn" | "endsOn" | "showOnSite" | "showOnTv">;

/**
 * The status of an announcement on `today` (the mosque's date). Both dates
 * are inclusive. An announcement that is over reads as `ended` even when it
 * is also switched off: that it is finished is the more useful fact.
 */
export function announcementStatus(announcement: AnnouncementTiming, today: DateString): AnnouncementStatus {
  if (announcement.endsOn !== null && announcement.endsOn < today) return "ended";
  if (!announcement.showOnSite && !announcement.showOnTv) return "hidden";
  if (announcement.startsOn !== null && announcement.startsOn > today) return "scheduled";
  return "active";
}

/** How each status reads in the list. */
export const ANNOUNCEMENT_STATUS_LABELS: Readonly<Record<AnnouncementStatus, string>> = {
  active: "Active",
  scheduled: "Scheduled",
  ended: "Ended",
  hidden: "Hidden",
};

/** The order of the statuses in the admin's list: what is on show first, what is over last. */
const STATUS_ORDER: readonly AnnouncementStatus[] = ["active", "scheduled", "hidden", "ended"];

/** An announcement with the status it has today. */
export interface AnnouncementWithStatus<Item extends AnnouncementTiming> {
  announcement: Item;
  status: AnnouncementStatus;
}

/**
 * The announcements in the order the admin's list shows them: by status
 * (active, scheduled, hidden, ended) and, within a status, in the order
 * given, which is the order visitors see them in.
 */
export function listByStatus<Item extends AnnouncementTiming>(
  announcements: readonly Item[],
  today: DateString,
): Array<AnnouncementWithStatus<Item>> {
  const withStatus = announcements.map((announcement) => ({
    announcement,
    status: announcementStatus(announcement, today),
  }));
  return STATUS_ORDER.flatMap((status) => withStatus.filter((item) => item.status === status));
}

/**
 * Announcements changed on this screen that the list from the server may not
 * show yet, by id: the announcement as it was saved, or null once deleted.
 */
export type LocalAnnouncementChanges = ReadonlyMap<number, Announcement | null>;

/**
 * The stored list with the changes made on this screen laid over it, so a
 * save shows the moment it has happened instead of a beat later, when the
 * refreshed list arrives. New announcements go first, newest at the top.
 */
export function applyLocalAnnouncements(
  stored: readonly Announcement[],
  changes: LocalAnnouncementChanges,
): readonly Announcement[] {
  if (changes.size === 0) return stored;
  const storedIds = new Set(stored.map((announcement) => announcement.id));
  const added = Array.from(changes.values())
    .filter((announcement): announcement is Announcement => announcement !== null && !storedIds.has(announcement.id))
    .reverse();
  const kept = stored.flatMap((announcement) => {
    const changed = changes.get(announcement.id);
    if (changed === undefined) return [announcement];
    return changed === null ? [] : [changed];
  });
  return [...added, ...kept];
}

/** How many announcements are being shown on `today`. */
export function countActiveAnnouncements(announcements: readonly AnnouncementTiming[], today: DateString): number {
  return announcements.filter((announcement) => announcementStatus(announcement, today) === "active").length;
}

/** When an announcement runs, as a phrase: `From 1 March 2027 until 9 March 2027`. */
export function describeSchedule({ startsOn, endsOn }: Pick<Announcement, "startsOn" | "endsOn">): string {
  if (startsOn !== null && endsOn !== null) {
    return startsOn === endsOn
      ? `On ${formatDateFull(startsOn)} only`
      : `From ${formatDateFull(startsOn)} until ${formatDateFull(endsOn)}`;
  }
  if (startsOn !== null) return `From ${formatDateFull(startsOn)}, until removed`;
  if (endsOn !== null) return `Until ${formatDateFull(endsOn)}`;
  return "Until removed";
}

/** Where an announcement is shown, as a phrase. */
export function describeAudience({ showOnSite, showOnTv }: Pick<Announcement, "showOnSite" | "showOnTv">): string {
  if (showOnSite && showOnTv) return "Website and TV";
  if (showOnSite) return "Website only";
  if (showOnTv) return "TV only";
  return "Not shown anywhere";
}

/** The announcement form as the inputs hold it: dates are `YYYY-MM-DD` or empty. */
export interface AnnouncementFormState {
  title: string;
  body: string;
  startsOn: string;
  endsOn: string;
  showOnSite: boolean;
  showOnTv: boolean;
  pinned: boolean;
}

/** The form for a new announcement: shown everywhere, from now, until removed. */
export const EMPTY_ANNOUNCEMENT_FORM: AnnouncementFormState = {
  title: "",
  body: "",
  startsOn: "",
  endsOn: "",
  showOnSite: true,
  showOnTv: true,
  pinned: false,
};

/** The form filled in from a stored announcement. */
export function announcementToForm(announcement: Announcement): AnnouncementFormState {
  return {
    title: announcement.title,
    body: announcement.body,
    startsOn: announcement.startsOn ?? "",
    endsOn: announcement.endsOn ?? "",
    showOnSite: announcement.showOnSite,
    showOnTv: announcement.showOnTv,
    pinned: announcement.pinned,
  };
}

/**
 * What the form sends to the create and update actions. Every field is
 * included, so an update replaces the announcement as the form shows it;
 * an empty date means "no limit".
 */
export function formToAnnouncementInput(form: AnnouncementFormState): AnnouncementInput {
  return {
    title: form.title,
    body: form.body,
    startsOn: form.startsOn === "" ? null : form.startsOn,
    endsOn: form.endsOn === "" ? null : form.endsOn,
    showOnSite: form.showOnSite,
    showOnTv: form.showOnTv,
    pinned: form.pinned,
  };
}

/**
 * The status the form's current values would give, for the live preview.
 * A date the browser has not finished accepting counts as "no limit".
 */
export function formStatus(form: AnnouncementFormState, today: DateString): AnnouncementStatus {
  return announcementStatus(
    {
      startsOn: isValidDateString(form.startsOn) ? form.startsOn : null,
      endsOn: isValidDateString(form.endsOn) ? form.endsOn : null,
      showOnSite: form.showOnSite,
      showOnTv: form.showOnTv,
    },
    today,
  );
}

/** Whether two form states hold the same values. */
export function announcementFormsEqual(a: AnnouncementFormState, b: AnnouncementFormState): boolean {
  return (
    a.title === b.title &&
    a.body === b.body &&
    a.startsOn === b.startsOn &&
    a.endsOn === b.endsOn &&
    a.showOnSite === b.showOnSite &&
    a.showOnTv === b.showOnTv &&
    a.pinned === b.pinned
  );
}
