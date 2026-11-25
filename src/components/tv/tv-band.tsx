"use client";

import { memo, useMemo, useState } from "react";
import { TimeText } from "@/components/display";
import { cn } from "@/components/ui/cn";
import {
  useActiveAnnouncements,
  useDisplay,
  useMosqueDate,
  usePrayerSchedule,
  usePrayerState,
} from "@/lib/client";
import { bandIndexAt, bandTextScale, buildBandItems, type BandItem } from "@/lib/tv/band";
import type { TimetableDay } from "@/lib/tv/timetable";
import type { TimeFormat } from "@/lib/types";

/** Props of {@link TvBand}. */
export interface TvBandProps {
  /** The day the timetable on screen is for, from `useTimetableDay()`. */
  day: TimetableDay;
}

interface MessageProps {
  item: BandItem;
  format: TimeFormat;
  /** Position of the message in the rotation, from 0. */
  index: number;
  /** Number of messages in the rotation. */
  count: number;
}

/** The message on screen and the one it is replacing. */
interface Layers {
  current: MessageProps;
  previous: MessageProps | null;
}

/** With more messages than this the row of position marks would crowd the text. */
const MAX_POSITION_MARKS = 8;

/** One message, laid out: heading, text clamped to the lines that fit, position marks. */
function Message({ item, format, index, count }: MessageProps) {
  return (
    <>
      {item.label === null ? null : <span className="tvx-band-label">{item.label}</span>}
      <p className={cn("tvx-band-text", `tvx-band-text-${bandTextScale(item)}`)}>
        {item.title === null ? null : (
          <strong className="tv-display tvx-band-title">{item.title}</strong>
        )}
        {item.segments.map((segment, position) =>
          segment.type === "time" ? (
            <TimeText
              key={position}
              time={segment.time}
              format={format}
              className="tv-display tvx-band-time"
            />
          ) : (
            <span key={position}>{segment.text}</span>
          ),
        )}
      </p>
      {count > 1 && count <= MAX_POSITION_MARKS ? (
        <span className="tvx-band-marks" aria-hidden="true">
          {Array.from({ length: count }, (_, mark) => (
            <span
              key={mark}
              className={cn("tvx-band-mark", mark === index && "tvx-band-mark-on")}
            />
          ))}
        </span>
      ) : null}
    </>
  );
}

/**
 * Shows one message and cross-fades to the next: the outgoing message stays
 * in place and fades out while the incoming one fades in over it. The first
 * message is simply there, so the server-rendered band does not fade in on
 * every page load.
 */
const BandMessages = memo(function BandMessages(props: MessageProps) {
  const [layers, setLayers] = useState<Layers>({ current: props, previous: null });
  // Adjusting state while rendering, as React recommends for state derived
  // from a changing prop: no effect, and no frame with the wrong message.
  if (layers.current.item.key !== props.item.key) {
    setLayers({ current: props, previous: layers.current });
  } else if (
    layers.current.item !== props.item ||
    layers.current.index !== props.index ||
    layers.current.count !== props.count ||
    layers.current.format !== props.format
  ) {
    // The same message with new details: update it in place, without a fade.
    setLayers({ current: props, previous: layers.previous });
  }
  const { current, previous } = layers;
  return (
    <>
      {previous === null ? null : (
        <div
          key={previous.item.key}
          className={cn("tvx-band-item tvx-band-out", `tvx-band-${previous.item.kind}`)}
          aria-hidden="true"
        >
          <Message {...previous} />
        </div>
      )}
      <div
        key={current.item.key}
        className={cn(
          "tvx-band-item",
          previous !== null && "tvx-band-in",
          `tvx-band-${current.item.kind}`,
        )}
      >
        <Message {...current} />
      </div>
    </>
  );
});

/**
 * The footer band of the TV display. It rotates, one message at a time with
 * a calm cross-fade, through the announcements for the TV, the coming
 * Jumu'ah (on the days the table does not show it) and the congregation
 * times that change tomorrow. With nothing to say it shows the mosque's
 * tagline, and with no tagline it is not drawn at all, leaving its room to
 * the timetable.
 *
 * Which message is up is decided by the clock alone, so every screen in the
 * building shows the same one. Long text is set smaller and clamped; it
 * never overflows or scrolls.
 *
 * Must be rendered inside `DisplayProvider`.
 */
export function TvBand({ day }: TvBandProps) {
  const announcements = useActiveAnnouncements("tv");
  const schedule = usePrayerSchedule();
  const state = usePrayerState();
  const { settings } = useDisplay();
  const { date } = useMosqueDate();
  const tableDate = day === "tomorrow" && schedule !== null ? schedule.tomorrow : date;
  const items = useMemo(
    () => buildBandItems({ announcements, schedule, settings, tableDate }),
    [announcements, schedule, settings, tableDate],
  );
  const index = bandIndexAt(items, state === null ? null : state.nowMs);
  if (index < 0) return null;
  return (
    <aside className="tvx-band" aria-label="Notices">
      <BandMessages
        item={items[index]}
        format={settings.timeFormat}
        index={index}
        count={items.length}
      />
    </aside>
  );
}
