"use client";

/**
 * The live display, as React context. `DisplayProvider` takes the payload the
 * server rendered the page with and from then on keeps everything below it
 * correct without a reload: the data refreshes itself, the clock ticks in the
 * mosque's timezone on the server's time, and the prayer state follows.
 *
 * Three contexts, by how often they change, so that a component re-renders
 * only as often as what it shows:
 * - `useDisplay()`         the payload and the connection: every few minutes.
 * - `usePrayerSchedule()`  rows, statuses, next and current prayer, dates:
 *                          when a prayer time passes, at midnight, on edits.
 * - `usePrayerState()`     the full state with the clock and the countdowns:
 *                          every second.
 *
 * Hydration: the server cannot know the viewer's "now", so everything derived
 * from the clock is null on the server AND during hydration, and arrives in
 * an update after mount. Components render a placeholder of the same size for
 * null. What the server can know (the payload, and therefore the timetable of
 * the day it was produced on) is rendered on the server; see `useTimetable`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { computePrayerState, type PrayerState } from "@/lib/time";
import type { Announcement, DateString, DisplayPayload, SiteSettings } from "@/lib/types";
import type { ConnectionStatus } from "./display-data";
import {
  activeAnnouncements,
  liveTimetable,
  payloadDate,
  scheduleFromSignature,
  scheduleSignature,
  staticTimetable,
  toSchedule,
  type AnnouncementAudience,
  type PrayerSchedule,
  type TimetableView,
} from "./prayer-view";
import { useLiveClock } from "./use-clock";
import { useDisplayData } from "./use-display-data";

/** The slow-changing part of the live display; the value of `useDisplay()`. */
export interface DisplayContextValue {
  /**
   * The newest good payload. Its `settings`, `days`, `announcements` and
   * `coverage` keep their identity across refreshes that did not change them,
   * so they are safe dependencies for memoisation and effects.
   */
  payload: DisplayPayload;
  /** Shorthand for `payload.settings`. */
  settings: SiteSettings;
  /** Whether the data is current; see `ConnectionStatus`. */
  status: ConnectionStatus;
  /** Server clock at which `payload` was produced, epoch milliseconds. */
  lastUpdatedMs: number;
  /** Build id the page was rendered with. */
  renderedVersion: string;
  /** Build id the server reported last; differs from `renderedVersion` after a deployment. */
  latestVersion: string;
  /** Fetches the payload now; resolves when the attempt has settled. */
  refresh(): Promise<void>;
  /**
   * The corrected time right now, epoch milliseconds. For timers and event
   * handlers; rendering must use `usePrayerState()` instead.
   */
  getNowMs(): number;
  /** The latest prayer state, or null before mount. For timers and event handlers. */
  getPrayerState(): PrayerState | null;
}

/** The mosque's current date, and whether it is known or assumed. */
export interface MosqueDate {
  /** Today in the mosque's timezone; before the clock is known, the day the payload was produced on. */
  date: DateString;
  /** True once the date comes from the running clock. */
  live: boolean;
}

/** Props of {@link DisplayProvider}. */
export interface DisplayProviderProps {
  /** The payload the server rendered the page with (`loadDisplayPayload()`). */
  initial: DisplayPayload;
  /**
   * Called when the server reports a build other than the one the page was
   * rendered with. Only usable from a Client Component (functions cannot be
   * passed from the server); the TV page uses `useAutoReloadOnVersionChange`.
   */
  onVersionChange?: (version: string) => void;
  children: ReactNode;
}

const DisplayContext = createContext<DisplayContextValue | null>(null);
const ScheduleContext = createContext<PrayerSchedule | null>(null);
const PrayerStateContext = createContext<PrayerState | null>(null);

/**
 * Runs the live display for everything below it. Render it once per page,
 * around the parts that show prayer times; Server Components passed as
 * `children` stay Server Components.
 *
 * @example
 * // In a Server Component, inside <Suspense>:
 * const payload = await loadDisplayPayload();
 * return <DisplayProvider initial={payload}>...</DisplayProvider>;
 */
export function DisplayProvider({ initial, onVersionChange, children }: DisplayProviderProps) {
  const data = useDisplayData(initial, { onVersionChange });
  const clock = useLiveClock({ serverNow: initial.serverNow });
  const [renderedVersion] = useState(initial.version);

  const { days, settings } = data.payload;
  const { nowMs } = clock;
  const state = useMemo(
    () => (nowMs === null ? null : computePrayerState({ days, settings, nowMs })),
    [days, settings, nowMs],
  );

  // The schedule is rebuilt from its own serialisation, keyed on that string:
  // it keeps one identity for as long as its content stays the same, which is
  // what lets its consumers skip the per-second renders.
  const signature = useMemo(
    () => (state === null ? null : scheduleSignature(toSchedule(state))),
    [state],
  );
  const schedule = useMemo(
    () => (signature === null ? null : scheduleFromSignature(signature)),
    [signature],
  );

  const latestState = useRef<PrayerState | null>(null);
  useEffect(() => {
    latestState.current = state;
  }, [state]);
  const getPrayerState = useCallback(() => latestState.current, []);

  const { payload, status, lastUpdatedMs, latestVersion, refresh } = data;
  const getNowMs = clock.read;
  const display = useMemo<DisplayContextValue>(
    () => ({
      payload,
      settings: payload.settings,
      status,
      lastUpdatedMs,
      renderedVersion,
      latestVersion,
      refresh,
      getNowMs,
      getPrayerState,
    }),
    [payload, status, lastUpdatedMs, renderedVersion, latestVersion, refresh, getNowMs, getPrayerState],
  );

  return (
    <DisplayContext value={display}>
      <ScheduleContext value={schedule}>
        <PrayerStateContext value={state}>{children}</PrayerStateContext>
      </ScheduleContext>
    </DisplayContext>
  );
}

/**
 * The payload, the settings and the connection status. Changes every few
 * minutes at most.
 * @throws Error when used outside a `DisplayProvider`.
 */
export function useDisplay(): DisplayContextValue {
  const display = useContext(DisplayContext);
  if (display === null) {
    throw new Error("The live display hooks and components must be rendered inside <DisplayProvider>.");
  }
  return display;
}

/**
 * The full prayer state, recomputed every second, or null before mount.
 * Only for components that show something that changes every second (a
 * clock, a countdown); everything else should use `usePrayerSchedule()`.
 * @throws Error when used outside a `DisplayProvider`.
 */
export function usePrayerState(): PrayerState | null {
  useDisplay();
  return useContext(PrayerStateContext);
}

/**
 * The prayer state without its per-second parts, or null before mount. Keeps
 * its identity until its content changes.
 * @throws Error when used outside a `DisplayProvider`.
 */
export function usePrayerSchedule(): PrayerSchedule | null {
  useDisplay();
  return useContext(ScheduleContext);
}

/**
 * Today's timetable rows, renderable on the server: before the clock is known
 * these are the rows of the day the payload was produced on, without
 * statuses; after mount they are today's rows with live statuses.
 * @throws Error when used outside a `DisplayProvider`.
 */
export function useTimetable(): TimetableView {
  const { payload } = useDisplay();
  // Once the schedule exists the payload is no longer a dependency, so the
  // view keeps its identity across data refreshes that changed nothing.
  const source = useContext(ScheduleContext) ?? payload;
  return useMemo(
    () => ("rows" in source ? liveTimetable(source) : staticTimetable(source)),
    [source],
  );
}

/**
 * The mosque's current date, renderable on the server (see {@link MosqueDate}).
 * @throws Error when used outside a `DisplayProvider`.
 */
export function useMosqueDate(): MosqueDate {
  const { payload } = useDisplay();
  const schedule = useContext(ScheduleContext);
  const source = schedule ?? payload;
  const date = useMemo(() => ("today" in source ? source.today : payloadDate(source)), [source]);
  const live = schedule !== null;
  return useMemo(() => ({ date, live }), [date, live]);
}

/**
 * The announcements to show on one screen today, pinned first. Renderable on
 * the server, where "today" is the day the payload was produced on.
 * @throws Error when used outside a `DisplayProvider`.
 */
export function useActiveAnnouncements(audience: AnnouncementAudience): Announcement[] {
  const { payload } = useDisplay();
  const { date } = useMosqueDate();
  const { announcements } = payload;
  return useMemo(
    () => activeAnnouncements(announcements, date, audience),
    [announcements, date, audience],
  );
}
