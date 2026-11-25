import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// After globals.css (imported by the root layout), so these rules win over its TV reset.
import "./tv.css";

/** The TV page is for the screens in the building, not for search results. */
export const metadata: Metadata = {
  title: "TV display",
  robots: { index: false, follow: false },
};

/**
 * A wall screen shows the page at exactly its own size: no zooming by a
 * stray remote control, and no browser rescaling of the layout.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Layout of the TV display. It adds nothing around the page: no site header,
 * footer or navigation, only the TV stylesheet. The page fills the screen
 * with its own fixed stage.
 */
export default function TvLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
