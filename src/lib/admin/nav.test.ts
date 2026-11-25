import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS, isCurrentNavItem } from "./nav";

describe("isCurrentNavItem", () => {
  it("marks the overview only on the overview itself", () => {
    expect(isCurrentNavItem("/admin", "/admin")).toBe(true);
    expect(isCurrentNavItem("/admin/", "/admin")).toBe(true);
    expect(isCurrentNavItem("/admin/import", "/admin")).toBe(false);
  });

  it("marks a section on its page and on pages below it", () => {
    expect(isCurrentNavItem("/admin/timetable", "/admin/timetable")).toBe(true);
    expect(isCurrentNavItem("/admin/timetable/", "/admin/timetable")).toBe(true);
    expect(isCurrentNavItem("/admin/timetable/2027", "/admin/timetable")).toBe(true);
    expect(isCurrentNavItem("/admin/timetables", "/admin/timetable")).toBe(false);
  });

  it("marks exactly one item for every page in the menu", () => {
    for (const page of ADMIN_NAV_ITEMS) {
      const current = ADMIN_NAV_ITEMS.filter((item) => isCurrentNavItem(page.href, item.href));
      expect(current.map((item) => item.id)).toEqual([page.id]);
    }
  });
});
