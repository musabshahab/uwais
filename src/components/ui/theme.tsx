"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon, TvIcon } from "@/components/brand/icons";
import { SegmentedControl } from "./segmented-control";
import { THEME_STORAGE_KEY, parseThemePreference, type ThemePreference } from "./theme-script";

/** Fired on `window` when the preference changes in this tab (the `storage` event only reaches other tabs). */
const CHANGE_EVENT = "uwais:theme-change";

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
}

/**
 * The visitor's theme preference and a setter that stores and applies it.
 * On the server, and until hydration, the preference reads as `system`.
 */
export function useThemePreference(): readonly [ThemePreference, (preference: ThemePreference) => void] {
  const preference = useSyncExternalStore<ThemePreference>(subscribe, readPreference, () => "system");

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Storage is unavailable (private mode): the choice still applies to this page view.
    }
    applyPreference(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [preference, setPreference] as const;
}

/**
 * Keeps `data-theme` on `<html>` in step with the stored preference after
 * hydration: when another tab changes it, and in development, where React's
 * Strict Mode remount drops attributes that an inline script added.
 * Rendered once by the root layout; it outputs nothing.
 */
export function ThemeSync() {
  const [preference] = useThemePreference();
  useLayoutEffect(() => {
    applyPreference(preference);
  }, [preference]);
  return null;
}

/** Props of {@link ThemeToggle}. */
export interface ThemeToggleProps {
  className?: string;
}

/** Lets the visitor choose between following the system, light and dark. */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const [preference, setPreference] = useThemePreference();
  return (
    <SegmentedControl
      name="theme"
      label="Colour theme"
      value={preference}
      onChange={setPreference}
      className={className}
      options={[
        { value: "system", label: "System", icon: <TvIcon size="1.125em" /> },
        { value: "light", label: "Light", icon: <SunIcon size="1.125em" /> },
        { value: "dark", label: "Dark", icon: <MoonIcon size="1.125em" /> },
      ]}
    />
  );
}
