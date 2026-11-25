"use client";

import { MoonIcon, SunIcon } from "@/components/brand/icons";
import { IconButton } from "@/components/ui/icon-button";
import { useThemePreference } from "@/components/ui/theme";
import { parseThemePreference } from "@/components/ui/theme-script";

/** Props of {@link ThemeButton}. */
export interface ThemeButtonProps {
  className?: string;
}

/** Whether the page is showing its dark theme right now: the explicit choice, else the system's. */
function isDarkNow(): boolean {
  const explicit = parseThemePreference(document.documentElement.getAttribute("data-theme"));
  if (explicit !== "system") return explicit === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * A one-tap switch between the light and the dark theme for the site header,
 * where the full three-way control does not fit on a phone. The footer has
 * that control, including "follow the system".
 *
 * Which icon shows is decided by CSS from the theme in effect, not by React
 * state, so the button is right from the first paint and never flickers.
 */
export function ThemeButton({ className }: ThemeButtonProps) {
  const [, setPreference] = useThemePreference();
  return (
    <IconButton
      label="Switch between light and dark theme"
      className={className}
      onClick={() => setPreference(isDarkNow() ? "light" : "dark")}
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </IconButton>
  );
}
