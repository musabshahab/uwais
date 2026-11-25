"use client";

/**
 * Hooks for the full-screen TV page: keep the screen awake, go full screen,
 * hide the cursor when nobody is using it, and reload unattended after a
 * deployment and once a night. Each is a thin React wrapper over a tested
 * controller in this folder.
 */

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { resolveTimeZone, zonedNow } from "@/lib/time";
import {
  browserAutoReloadDeps,
  createAutoReloader,
  isQuietMoment,
  type AutoReloader,
} from "./auto-reload";
import { fullscreenControls, type FullscreenControls } from "./fullscreen";
import { createIdleStore } from "./idle";
import { useDisplay } from "./prayer-state";
import { createWakeLock } from "./wake-lock";

/** Full-screen mode as a component sees it. */
export interface FullscreenState {
  /** Whether the browser lets this page go full screen. False on the server and until mounted. */
  supported: boolean;
  /** Whether the page is full screen right now. */
  active: boolean;
  /** Goes full screen. Must be called from a click or key handler. Resolves to whether it worked. */
  enter(): Promise<boolean>;
  /** Leaves full-screen mode. Resolves to whether the page is out of it. */
  exit(): Promise<boolean>;
  /** Switches between the two. Resolves to whether the switch worked. */
  toggle(): Promise<boolean>;
}

/** Options of {@link useAutoReloadOnVersionChange}. */
export interface AutoReloadHookOptions {
  /**
   * Whether the screen may go blank for a moment right now. Defaults to
   * `isQuietMoment` on the current prayer state: no congregation in progress
   * and no prayer time within 15 minutes ahead or 10 minutes behind.
   */
  canReloadNow?: () => boolean;
  /** Also reload once a night between 03:00 and 05:00 mosque time. Defaults to true. */
  dailyReload?: boolean;
}

const FULLSCREEN_UNSUPPORTED = 0;
const FULLSCREEN_INACTIVE = 1;
const FULLSCREEN_ACTIVE = 2;

/** Created on first use in the browser; undefined until then. */
let fullscreen: FullscreenControls | null | undefined;

function getFullscreen(): FullscreenControls | null {
  if (fullscreen === undefined) fullscreen = fullscreenControls(document);
  return fullscreen;
}

function subscribeToFullscreen(listener: () => void): () => void {
  const controls = getFullscreen();
  return controls === null ? () => undefined : controls.onChange(listener);
}

function readFullscreen(): number {
  const controls = getFullscreen();
  if (controls === null) return FULLSCREEN_UNSUPPORTED;
  return controls.isActive() ? FULLSCREEN_ACTIVE : FULLSCREEN_INACTIVE;
}

const subscribeToNothing = (): (() => void) => () => undefined;
const neverOnServer = (): boolean => false;
const unsupportedOnServer = (): number => FULLSCREEN_UNSUPPORTED;

/**
 * Keeps the screen from dimming or sleeping while the component is mounted,
 * where the browser supports it; silently does nothing elsewhere. The lock is
 * re-acquired whenever the page comes back on screen.
 * @param enabled Pass false to release the lock without unmounting.
 * @returns Whether the screen is currently being kept awake.
 */
export function useWakeLock(enabled: boolean = true): boolean {
  const [store] = useState(() => createWakeLock());
  return useSyncExternalStore(
    enabled ? store.subscribe : subscribeToNothing,
    enabled ? store.getSnapshot : neverOnServer,
    neverOnServer,
  );
}

/**
 * Full-screen mode of the page. `enter` only works from a click or key
 * handler (browsers require a user gesture), so render a button while
 * `supported && !active`.
 */
export function useFullscreen(): FullscreenState {
  const code = useSyncExternalStore(subscribeToFullscreen, readFullscreen, unsupportedOnServer);
  return useMemo(() => {
    const enter = async () => getFullscreen()?.enter() ?? false;
    const exit = async () => getFullscreen()?.exit() ?? false;
    const toggle = async () => (getFullscreen()?.isActive() ? exit() : enter());
    return {
      supported: code !== FULLSCREEN_UNSUPPORTED,
      active: code === FULLSCREEN_ACTIVE,
      enter,
      exit,
      toggle,
    };
  }, [code]);
}

/**
 * Whether the pointer and the keyboard have been idle for `timeoutMs`. The TV
 * stage hides the cursor by default; use this to show the cursor and any
 * on-screen controls while somebody is using the remote or a mouse:
 * `style={{ cursor: idle ? "none" : "auto" }}`.
 * @param timeoutMs Idle time before the result turns true. Defaults to 3 seconds.
 * @returns False on the server, right after mount and after any activity.
 */
export function useIdleCursorHide(timeoutMs: number = 3000): boolean {
  const store = useMemo(() => createIdleStore(timeoutMs), [timeoutMs]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, neverOnServer);
}

/**
 * Reloads the page, unattended, when the server has been redeployed, and once
 * a night to shed whatever a browser leaks over weeks. A reload only happens
 * when the device is online, the server has just answered, and
 * `canReloadNow()` says the screen is quiet; after a deployment each screen
 * also waits its own random delay, so they do not all go blank together.
 *
 * Must be used inside `DisplayProvider`. Meant for the TV page; the public
 * site should not reload under a visitor.
 */
export function useAutoReloadOnVersionChange(options: AutoReloadHookOptions = {}): void {
  const { renderedVersion, latestVersion, settings, getNowMs, getPrayerState } = useDisplay();
  const { canReloadNow, dailyReload = true } = options;
  const { timezone } = settings;

  const isQuiet = useEffectEvent(() =>
    canReloadNow ? canReloadNow() : isQuietMoment(getPrayerState()),
  );
  const minutesOfDay = useEffectEvent(
    () => zonedNow(resolveTimeZone(timezone), getNowMs()).minutesOfDay,
  );

  const reloader = useRef<AutoReloader | null>(null);
  useEffect(() => {
    const created = createAutoReloader(
      { renderedVersion, dailyReload },
      {
        ...browserAutoReloadDeps(),
        canReloadNow: () => isQuiet(),
        mosqueMinutesOfDay: () => minutesOfDay(),
      },
    );
    reloader.current = created;
    created.start();
    return () => {
      created.stop();
      reloader.current = null;
    };
  }, [renderedVersion, dailyReload]);

  // Declared after the effect above, so the reloader exists when this one first runs.
  useEffect(() => {
    if (reloader.current !== null) reloader.current.setLatestVersion(latestVersion);
  }, [latestVersion, renderedVersion, dailyReload]);
}
