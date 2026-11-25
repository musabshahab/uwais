/**
 * The pages of the admin area, in menu order, and the rule for which one is
 * the current page.
 */

/** Identifies a menu item; the shell maps each to its icon. */
export type AdminNavId = "overview" | "import" | "timetable" | "announcements" | "settings";

/** One entry of the admin menu. */
export interface AdminNavItem {
  id: AdminNavId;
  href: string;
  label: string;
}

/** The admin menu. */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { id: "overview", href: "/admin", label: "Overview" },
  { id: "import", href: "/admin/import", label: "Import timetable" },
  { id: "timetable", href: "/admin/timetable", label: "Timetable" },
  { id: "announcements", href: "/admin/announcements", label: "Announcements" },
  { id: "settings", href: "/admin/settings", label: "Settings" },
];

/**
 * Whether the page at `pathname` belongs to a menu item. The overview only
 * matches itself; every other item also matches the pages below it.
 */
export function isCurrentNavItem(pathname: string, href: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(`${href}/`);
}
