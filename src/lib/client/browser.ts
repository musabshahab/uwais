/**
 * The browser behind the live display's injectable dependencies. Everything
 * here is glue of one or two lines around a browser API; the logic that uses
 * it lives in the modules that take these functions as arguments.
 *
 * Call these only in the browser (from an effect or a store's `subscribe`),
 * never while rendering.
 */

import type { FetchLike, Timers } from "./http";

/** A place to keep strings between page loads; `localStorage` and `sessionStorage` satisfy it. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's timers. */
export const browserTimers: Timers = {
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

/** The browser's `fetch`, looked up on every call so a service worker shim installed later is used. */
export const browserFetch: FetchLike = (url, init) => window.fetch(url, init);

/** Whether the page is on screen. A browser without the Page Visibility API counts as visible. */
export function isDocumentVisible(): boolean {
  return document.visibilityState !== "hidden";
}

/**
 * Whether the browser believes it has a network. `true` proves little (a
 * router without internet still counts), `false` is reliable.
 */
export function isNavigatorOnline(): boolean {
  return navigator.onLine !== false;
}

/** Listens for a `window` event; returns the function that stops listening. */
export function onWindowEvent(type: string, listener: () => void): () => void {
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}

/**
 * Calls `listener` whenever the page comes back in front of the viewer: the
 * tab becomes visible again, or the page is restored from the back/forward
 * cache. Timers are throttled or frozen in between, so this is the moment to
 * catch up.
 */
export function onPageWake(listener: () => void): () => void {
  const onVisibility = () => {
    if (isDocumentVisible()) listener();
  };
  // `pageshow` also ends every ordinary page load; only a restore is a wake-up.
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) listener();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
  };
}

/**
 * One of the browser's storage areas, or null when it cannot be used. Merely
 * reading the property throws where storage is blocked (private modes, some
 * embedded signage players), so the access itself is guarded.
 */
export function browserStorage(area: "localStorage" | "sessionStorage"): StorageLike | null {
  try {
    return window[area] ?? null;
  } catch {
    return null;
  }
}
