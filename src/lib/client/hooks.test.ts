import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Announcement, DisplayPayload } from "@/lib/types";
import {
  DisplayProvider,
  useActiveAnnouncements,
  useDisplay,
  useMosqueDate,
  usePrayerSchedule,
  usePrayerState,
  useTimetable,
} from "./prayer-state";
import { SAMPLE_NOW_MS, makePayload } from "./testing";
import { useAutoReloadOnVersionChange, useFullscreen, useIdleCursorHide, useWakeLock } from "./tv";
import { useClock } from "./use-clock";
import { useDisplayData } from "./use-display-data";

/**
 * The hooks are rendered here the way the server renders them, which is also
 * what the browser must reproduce while hydrating. What they do after mount
 * is the business of the stores behind them, which have their own tests.
 */

/** `children` is a required prop; as a `createElement` argument it has to be viewed as optional. */
const Provider = DisplayProvider as FunctionComponent<{ initial: DisplayPayload }>;

/** Undoes the escaping React applies to text, so a rendered JSON string can be parsed again. */
function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** What a hook returns during a server render, optionally inside a `DisplayProvider`. */
function serverValue<T>(useValue: () => T, payload: DisplayPayload | null = makePayload()): T {
  function Probe() {
    return JSON.stringify({ value: useValue() });
  }
  const probe = createElement(Probe);
  const markup = renderToStaticMarkup(
    payload === null ? probe : createElement(Provider, { initial: payload }, probe),
  );
  return (JSON.parse(unescapeHtml(markup)) as { value: T }).value;
}

function announcement(id: number, overrides: Partial<Announcement> = {}): Announcement {
  return {
    id,
    title: `Announcement ${id}`,
    body: "",
    startsOn: null,
    endsOn: null,
    showOnSite: true,
    showOnTv: true,
    pinned: false,
    createdAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("the display hooks during a server render", () => {
  it("useDisplay serves the payload the page was rendered with, as live", () => {
    const value = serverValue(() => {
      const display = useDisplay();
      return {
        version: display.payload.version,
        sameSettings: display.settings === display.payload.settings,
        status: display.status,
        lastUpdatedMs: display.lastUpdatedMs,
        renderedVersion: display.renderedVersion,
        latestVersion: display.latestVersion,
        prayerState: display.getPrayerState(),
      };
    });
    expect(value).toEqual({
      version: "build-1",
      sameSettings: true,
      status: "live",
      lastUpdatedMs: SAMPLE_NOW_MS,
      renderedVersion: "build-1",
      latestVersion: "build-1",
      prayerState: null,
    });
  });

  it("usePrayerState and usePrayerSchedule have nothing yet: the server cannot know the viewer's time", () => {
    expect(serverValue(() => usePrayerState())).toBeNull();
    expect(serverValue(() => usePrayerSchedule())).toBeNull();
  });

  it("useTimetable serves the rows of the payload's day without statuses", () => {
    const view = serverValue(() => useTimetable());
    expect(view.date).toBe("2026-11-25");
    expect(view.live).toBe(false);
    expect(view.rows.map((row) => [row.key, row.begins, row.jamaat, row.status])).toEqual([
      ["fajr", "05:40", "06:15", null],
      ["sunrise", "07:30", null, null],
      ["dhuhr", "11:55", "12:30", null],
      ["asr", "14:05", "14:30", null],
      ["maghrib", "16:02", "16:07", null],
      ["isha", "17:45", "19:30", null],
    ]);
  });

  it("useMosqueDate serves the payload's day in the mosque's timezone and says it is not live", () => {
    expect(serverValue(() => useMosqueDate())).toEqual({ date: "2026-11-25", live: false });

    const karachi = makePayload({ serverNow: Date.UTC(2026, 10, 25, 23, 30) });
    karachi.settings.timezone = "Asia/Karachi";
    expect(serverValue(() => useMosqueDate(), karachi)).toEqual({ date: "2026-11-26", live: false });
  });

  it("useActiveAnnouncements filters by screen and by the payload's day", () => {
    const payload = makePayload({
      announcements: [
        announcement(1, { pinned: true }),
        announcement(2, { showOnTv: false }),
        announcement(3, { showOnSite: false }),
        announcement(4, { startsOn: "2026-11-26" }),
        announcement(5, { endsOn: "2026-11-24" }),
      ],
    });
    expect(serverValue(() => useActiveAnnouncements("site"), payload).map((item) => item.id)).toEqual([1, 2]);
    expect(serverValue(() => useActiveAnnouncements("tv"), payload).map((item) => item.id)).toEqual([1, 3]);
  });

  it("useClock has no time and useDisplayData has the initial payload", () => {
    expect(serverValue(() => useClock({ serverNow: SAMPLE_NOW_MS }), null)).toBeNull();

    const initial = makePayload();
    const data = serverValue(() => {
      const { payload, status, lastUpdatedMs, latestVersion } = useDisplayData(initial);
      return { samePayload: payload === initial, status, lastUpdatedMs, latestVersion };
    }, null);
    expect(data).toEqual({
      samePayload: true,
      status: "live",
      lastUpdatedMs: SAMPLE_NOW_MS,
      latestVersion: "build-1",
    });
  });

  it("the TV hooks report nothing held, supported or idle, and touch no browser API", () => {
    const value = serverValue(() => {
      useAutoReloadOnVersionChange();
      const fullscreen = useFullscreen();
      return {
        awake: useWakeLock(),
        awakeWhenDisabled: useWakeLock(false),
        idle: useIdleCursorHide(),
        fullscreenSupported: fullscreen.supported,
        fullscreenActive: fullscreen.active,
      };
    });
    expect(value).toEqual({
      awake: false,
      awakeWhenDisabled: false,
      idle: false,
      fullscreenSupported: false,
      fullscreenActive: false,
    });
  });
});

describe("the display hooks outside a DisplayProvider", () => {
  it.each([
    ["useDisplay", () => useDisplay().status],
    ["usePrayerState", () => usePrayerState()],
    ["usePrayerSchedule", () => usePrayerSchedule()],
    ["useTimetable", () => useTimetable().date],
    ["useMosqueDate", () => useMosqueDate().date],
    ["useActiveAnnouncements", () => useActiveAnnouncements("site").length],
    ["useAutoReloadOnVersionChange", () => useAutoReloadOnVersionChange()],
  ] as const)("%s explains what is missing", (_name, useValue) => {
    expect(() => serverValue<unknown>(useValue, null)).toThrow(/inside <DisplayProvider>/);
  });
});
