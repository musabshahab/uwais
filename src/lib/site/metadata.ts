/**
 * Page metadata for the public site, built from the settings so that titles,
 * descriptions and link previews carry the mosque's real name.
 */

import type { Metadata } from "next";
import { formatMonthYear, type MonthString } from "@/lib/time";
import type { SiteSettings } from "@/lib/types";
import { timetableHref } from "./month";

type NamedSettings = Pick<SiteSettings, "mosqueName" | "shortName" | "tagline">;

/** One sentence saying what the site is for, used where search engines and link previews show a summary. */
export function siteDescription(settings: Pick<SiteSettings, "mosqueName">): string {
  return `Today's salah and jamaat times, Jumu'ah times and the monthly prayer timetable for ${settings.mosqueName}.`;
}

/**
 * Metadata shared by every public page: the title (the mosque's name on the
 * home page, `Page | Mosque` elsewhere), a description that mentions prayer
 * times, and the Open Graph basics for link previews.
 */
export function siteMetadata(settings: NamedSettings): Metadata {
  const name = settings.mosqueName;
  const description = siteDescription(settings);
  const shortName = settings.shortName.trim() || name;
  return {
    // `absolute` keeps the root layout's placeholder template away from the name itself.
    title: { absolute: name, template: `%s | ${name}` },
    description,
    applicationName: shortName,
    appleWebApp: { capable: true, title: shortName, statusBarStyle: "default" },
    openGraph: {
      type: "website",
      siteName: name,
      title: name,
      description,
      url: "/",
      locale: "en_GB",
    },
    twitter: { card: "summary", title: name, description },
  };
}

/**
 * Metadata of the monthly timetable page for one month. Each month is a page
 * of its own, so the canonical address carries the month even when the
 * visitor arrived without one.
 */
export function timetableMetadata(settings: Pick<NamedSettings, "mosqueName">, month: MonthString): Metadata {
  const name = settings.mosqueName;
  const monthName = formatMonthYear(month);
  const title = `Prayer timetable for ${monthName}`;
  const description = `Begins and jamaat times for every day of ${monthName} at ${name}, with Jumu'ah times and a printable timetable.`;
  const address = timetableHref(month);
  return {
    title,
    description,
    alternates: { canonical: address },
    openGraph: {
      type: "website",
      siteName: name,
      title: `${title} | ${name}`,
      description,
      url: address,
      locale: "en_GB",
    },
    twitter: { card: "summary", title: `${title} | ${name}`, description },
  };
}
