import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeSync } from "@/components/ui/theme";
import { ThemeScript } from "@/components/ui/theme-script";
import { fontVariables } from "@/fonts";
import { DEFAULT_SETTINGS } from "@/lib/types";
import "./globals.css";

/**
 * Base for absolute URLs in metadata. A malformed SITE_URL must not take the
 * whole build down, so it falls back to localhost.
 */
function siteUrl(): URL {
  try {
    return new URL(process.env.SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

/**
 * Static defaults. Pages set their own `title` and get the suffix from the
 * template; areas that know the mosque's real name override it in their own
 * layout.
 */
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: DEFAULT_SETTINGS.mosqueName,
    template: `%s | ${DEFAULT_SETTINGS.mosqueName}`,
  },
  description: DEFAULT_SETTINGS.tagline,
  applicationName: DEFAULT_SETTINGS.shortName,
  appleWebApp: {
    capable: true,
    title: DEFAULT_SETTINGS.shortName,
    statusBarStyle: "default",
  },
  // Stops iOS turning times and dates into phone links; real numbers use tel: links.
  formatDetection: { telephone: false },
};

/** The browser chrome follows the page background of each colour scheme (`--canvas`). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1614" },
  ],
};

/**
 * The root layout: document shell, fonts, global styles and the theme
 * bootstrap. It is deliberately free of data and navigation so that it is
 * prerendered once; the site, the TV display and the admin area each add
 * their own layout below it.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The theme script sets data-theme before React hydrates, hence the suppression.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {children}
        <ThemeSync />
      </body>
    </html>
  );
}
