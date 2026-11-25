"use client";

import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
import type { DisplayPayload } from "@/lib/types";
import { createDisplayStore, type DisplaySnapshot } from "./display-data";

/** The display's data as a component sees it. */
export interface DisplayData extends DisplaySnapshot {
  /** Fetches the payload now; resolves when the attempt has settled, whatever its outcome. */
  refresh(): Promise<void>;
}

/** Options of {@link useDisplayData}. */
export interface DisplayDataOptions {
  /**
   * Called once for each new build id a live response reports that differs
   * from the one the page was rendered with. The TV uses it to reload itself.
   */
  onVersionChange?: (version: string) => void;
}

/**
 * Keeps the display payload fresh for the lifetime of the component: starts
 * from the payload the page was rendered with, upgrades from `localStorage`
 * when that holds something newer, polls `GET /api/display`, and keeps the
 * last good payload whatever happens to the network (see `./display-data`).
 *
 * Hydration: the server and the hydrating client both render `initial` with
 * status `live`; storage and the network are only consulted after mount.
 *
 * @param initial The payload the server rendered the page with. A newer one
 *        passed later (the page was re-rendered on the server) is adopted.
 */
export function useDisplayData(
  initial: DisplayPayload,
  options: DisplayDataOptions = {},
): DisplayData {
  const [store] = useState(() => createDisplayStore(initial));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  const { onVersionChange } = options;
  const announce = useEffectEvent((version: string) => {
    if (onVersionChange) onVersionChange(version);
  });
  useEffect(() => store.onVersionChange((version) => announce(version)), [store]);

  useEffect(() => {
    store.offer(initial);
  }, [store, initial]);

  return useMemo(() => ({ ...snapshot, refresh: store.refresh }), [snapshot, store]);
}
