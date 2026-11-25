"use client";

import { useEffect, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/brand/logo";
import { TvStage } from "@/components/tv";
import { browserFetch, browserStorage, browserTimers, isNavigatorOnline } from "@/lib/client/browser";
import { fetchJson } from "@/lib/client/http";
import { parseTvQueryString, resolveTvOptions } from "@/lib/tv/options";
import {
  readReconnectAttempts,
  reconnectDelayMs,
  writeReconnectAttempts,
} from "@/lib/tv/reconnect";
import { DEFAULT_SETTINGS } from "@/lib/types";

/** Answers 200 only when the server and its database are both up. */
const HEALTH_ENDPOINT = "/api/health";

/** How long to wait for the health check before counting it as failed. */
const HEALTH_TIMEOUT_MS = 8000;

/** The address of the page does not change while this screen is up: nothing to listen for. */
const subscribeToNothing = () => () => undefined;
const readSearch = () => window.location.search;
const readNoSearch = () => "";

/** Whether the server is ready to render the display again. */
async function serverIsReady(): Promise<boolean> {
  if (!isNavigatorOnline()) return false;
  const result = await fetchJson(HEALTH_ENDPOINT, HEALTH_TIMEOUT_MS, {
    fetch: browserFetch,
    now: () => Date.now(),
    timers: browserTimers,
  });
  // An answer from the service worker's cache says nothing about the server.
  return result.kind === "ok" && !result.cached;
}

/**
 * The error screen of the TV display. Nobody stands by a wall screen with a
 * keyboard, so it does not offer a button: it says "Reconnecting" and gets
 * itself out. After a wait that grows with every attempt and differs from
 * screen to screen (see `reconnectDelayMs`) it asks the server whether it is
 * healthy, and reloads the page only when it is. While the server or the
 * network is down the screen stays here, calmly, instead of landing on the
 * browser's own error page.
 *
 * The settings are not available here, so the screen follows what its address
 * asks for (rotation, extra margin, theme) and is otherwise the night theme.
 */
export default function TvError() {
  const search = useSyncExternalStore(subscribeToNothing, readSearch, readNoSearch);
  const screen = resolveTvOptions(parseTvQueryString(search), DEFAULT_SETTINGS.tv);

  useEffect(() => {
    const storage = browserStorage("sessionStorage");
    let attempt = readReconnectAttempts(storage);
    let timer: number | undefined;
    let stopped = false;

    const check = async () => {
      const ready = await serverIsReady();
      if (stopped) return;
      attempt += 1;
      if (ready) {
        // Remembered across the reload, so a page that fails again waits longer.
        writeReconnectAttempts(storage, attempt);
        window.location.reload();
      } else {
        wait();
      }
    };
    const wait = () => {
      timer = window.setTimeout(() => void check(), reconnectDelayMs(attempt, Math.random()));
    };

    wait();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <TvStage theme={screen.theme} rotate={screen.rotate} insetFraction={screen.insetFraction}>
      <div className="tvx-notice tv-drift" role="status">
        <LogoMark size="1em" detail="facets" className="tvx-notice-mark" />
        <h1 className="tv-display tvx-notice-title">Reconnecting</h1>
        <p className="tvx-notice-text">
          This screen has lost touch with the mosque&apos;s timetable. It will be back on its own
          in a moment.
        </p>
      </div>
    </TvStage>
  );
}
