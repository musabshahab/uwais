"use client";

import { useEffect } from "react";

/**
 * Asks the browser to confirm before the tab is closed or reloaded while
 * `active` is true, so work that only exists on this page (a chosen file,
 * unsaved settings) is not lost to a stray keystroke. The wording of the
 * question is the browser's own.
 */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
