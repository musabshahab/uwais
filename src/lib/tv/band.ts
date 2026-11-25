/**
 * The footer band of the TV display: one message at a time, each shown for
 * a set number of seconds, cross-fading to the next. This module builds the
 * list of messages and decides which one is on screen at a given instant.
 *
 * The choice is a function of the clock alone, not of when a screen was
 * switched on, so every screen in the building shows the same message at the
 * same moment.
 */

import type { PrayerSchedule } from "@/lib/client/prayer-view";
import { MS_PER_SECOND } from "@/lib/time";
import {
  JUMUAH_LABEL,
  type Announcement,
  type DateString,
  type SiteSettings,
  type TimeString,
} from "@/lib/types";

/** What a band message is about. */
export type BandItemKind = "announcement" | "jumuah" | "changes" | "tagline";

/**
 * A run of a message: plain words, or a time of day that the screen sets in
 * the time numerals and formats to the mosque's 12 or 24-hour setting.
 */
export type BandSegment = { type: "text"; text: string } | { type: "time"; time: TimeString };

/** One message of the footer band. */
export interface BandItem {
  /** Identity of the message: the same message keeps its key from one build to the next. */
  key: string;
  kind: BandItemKind;
  /** The small heading beside the message, e.g. `Notice`; null for the tagline. */
  label: string | null;
  /** The emphasised opening of the message, or null. */
  title: string | null;
  /** The rest of the message. */
  segments: BandSegment[];
  /** How long the message stays on screen. */
  seconds: number;
}

/** How much text a message carries, which decides the size it is set in. */
export type BandTextScale = "regular" | "compact";

/** Input of {@link buildBandItems}. */
export interface BandItemsInput {
  /** The announcements for the TV today (`useActiveAnnouncements("tv")`). */
  announcements: readonly Announcement[];
  /** The live schedule, or null before the clock is known. */
  schedule: Pick<
    PrayerSchedule,
    "today" | "tomorrow" | "isFriday" | "jumuah" | "tomorrowChanges"
  > | null;
  settings: Pick<SiteSettings, "tagline"> & {
    tv: Pick<SiteSettings["tv"], "announcementSeconds">;
  };
  /** The date the timetable on screen is for; its Jumu'ah row makes a Jumu'ah message redundant. */
  tableDate: DateString;
}

/** Shortest time a message stays up, whatever the settings say. */
export const MIN_BAND_SECONDS = 5;

/** Longest time a message stays up. */
export const MAX_BAND_SECONDS = 120;

/** Used when the configured duration is not a number. */
export const DEFAULT_BAND_SECONDS = 12;

/** Changed congregation times per message; more would not fit on one screen line. */
export const CHANGES_PER_ITEM = 2;

/** Messages longer than this many characters are set in the compact size. */
export const COMPACT_TEXT_FROM = 150;

/** A time takes about this many characters on screen (`12:30 PM`). */
const TIME_TEXT_LENGTH = 8;

const SEPARATOR: BandSegment = { type: "text", text: "  ·  " };

/** The configured seconds per message, kept within sensible bounds. */
export function bandSeconds(configured: number): number {
  if (!Number.isFinite(configured)) return DEFAULT_BAND_SECONDS;
  return Math.min(MAX_BAND_SECONDS, Math.max(MIN_BAND_SECONDS, Math.round(configured)));
}

/** Folds line breaks and runs of spaces: the band shows a message as one paragraph. */
function singleParagraph(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function announcementItems(announcements: readonly Announcement[], seconds: number): BandItem[] {
  const items: BandItem[] = [];
  for (const announcement of announcements) {
    const title = singleParagraph(announcement.title);
    const body = singleParagraph(announcement.body);
    if (title === "" && body === "") continue;
    items.push({
      // The time of the last edit is part of the key, so an edited message fades in afresh.
      key: `announcement:${announcement.id}:${announcement.updatedAt}`,
      kind: "announcement",
      label: "Notice",
      title: title === "" ? null : title,
      segments: body === "" ? [] : [{ type: "text", text: body }],
      seconds,
    });
  }
  return items;
}

/**
 * The coming Jumu'ah, for the days when the table does not show it. Left out
 * on a Friday (the table has a Jumu'ah row all day) and whenever the table on
 * screen is that Friday's (Thursday night, once it has moved on to tomorrow).
 */
function jumuahItems(
  schedule: NonNullable<BandItemsInput["schedule"]>,
  tableDate: DateString,
  seconds: number,
): BandItem[] {
  const { date, slots } = schedule.jumuah;
  if (slots.length === 0 || schedule.isFriday || date === tableDate) return [];
  const segments: BandSegment[] = [];
  slots.forEach((slot, index) => {
    if (index > 0) segments.push(SEPARATOR);
    // A lone slot called "Jumu'ah" would only repeat the heading.
    const named = slots.length > 1 || slot.label !== JUMUAH_LABEL.name;
    if (named) segments.push({ type: "text", text: `${slot.label} ` });
    segments.push({ type: "time", time: slot.time });
  });
  return [
    {
      key: `jumuah:${date}`,
      kind: "jumuah",
      label: JUMUAH_LABEL.name,
      title: date === schedule.tomorrow ? "Tomorrow" : "This Friday",
      segments,
      seconds,
    },
  ];
}

/** Congregation times that are different tomorrow, a few per message. */
function changeItems(
  schedule: NonNullable<BandItemsInput["schedule"]>,
  seconds: number,
): BandItem[] {
  const changes = schedule.tomorrowChanges;
  const items: BandItem[] = [];
  for (let start = 0; start < changes.length; start += CHANGES_PER_ITEM) {
    const segments: BandSegment[] = [];
    changes.slice(start, start + CHANGES_PER_ITEM).forEach((change, index) => {
      if (index > 0) segments.push(SEPARATOR);
      segments.push(
        { type: "text", text: `${change.name} jamaat ` },
        { type: "time", time: change.to },
        { type: "text", text: " (was " },
        { type: "time", time: change.from },
        { type: "text", text: ")" },
      );
    });
    items.push({
      key: `changes:${schedule.tomorrow}:${start}`,
      kind: "changes",
      label: "From tomorrow",
      title: null,
      segments,
      seconds,
    });
  }
  return items;
}

/**
 * Builds the messages of the band, in the order they are shown:
 * announcements (pinned first, as the server sends them), the coming
 * Jumu'ah, then the congregation times that change tomorrow. With none of
 * those the band shows the mosque's tagline, and with no tagline either the
 * list is empty and the band is not drawn.
 *
 * Before the clock is known (`schedule` null) only the announcements are
 * available, which is also what the server renders.
 */
export function buildBandItems({
  announcements,
  schedule,
  settings,
  tableDate,
}: BandItemsInput): BandItem[] {
  const seconds = bandSeconds(settings.tv.announcementSeconds);
  const items = announcementItems(announcements, seconds);
  if (schedule !== null) {
    items.push(...jumuahItems(schedule, tableDate, seconds), ...changeItems(schedule, seconds));
  }
  if (items.length > 0) return items;
  const tagline = singleParagraph(settings.tagline);
  if (tagline === "") return [];
  return [
    {
      key: "tagline",
      kind: "tagline",
      label: null,
      title: null,
      segments: [{ type: "text", text: tagline }],
      seconds,
    },
  ];
}

/**
 * Which message is on screen at an instant: the index into `items`, or -1
 * for an empty list. The messages are laid end to end on a loop that started
 * at the epoch, so the answer depends only on the list and the clock.
 * @param nowMs The current instant, epoch milliseconds, or null before the
 *        clock is known (the first message is shown then).
 */
export function bandIndexAt(
  items: readonly Pick<BandItem, "seconds">[],
  nowMs: number | null,
): number {
  if (items.length === 0) return -1;
  if (items.length === 1 || nowMs === null || !Number.isFinite(nowMs)) return 0;
  let loopSeconds = 0;
  for (const item of items) loopSeconds += bandSeconds(item.seconds);
  const elapsed = Math.floor(nowMs / MS_PER_SECOND);
  let position = ((elapsed % loopSeconds) + loopSeconds) % loopSeconds;
  for (let index = 0; index < items.length; index++) {
    position -= bandSeconds(items[index].seconds);
    if (position < 0) return index;
  }
  return 0;
}

/** Roughly how many characters a message puts on screen. */
export function bandTextLength(item: Pick<BandItem, "title" | "segments">): number {
  let length = item.title === null ? 0 : item.title.length + 1;
  for (const segment of item.segments) {
    length += segment.type === "time" ? TIME_TEXT_LENGTH : segment.text.length;
  }
  return length;
}

/**
 * The size a message is set in: long ones go one size down so that more of
 * them fits before the band has to cut them off.
 */
export function bandTextScale(item: Pick<BandItem, "title" | "segments">): BandTextScale {
  return bandTextLength(item) > COMPACT_TEXT_FROM ? "compact" : "regular";
}
