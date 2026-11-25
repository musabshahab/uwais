import { describe, expect, it } from "vitest";
import type { Announcement } from "@/lib/types";
import {
  EMPTY_ANNOUNCEMENT_FORM,
  announcementFormsEqual,
  applyLocalAnnouncements,
  announcementStatus,
  announcementToForm,
  countActiveAnnouncements,
  describeAudience,
  describeSchedule,
  formStatus,
  formToAnnouncementInput,
  listByStatus,
} from "./announcements";

const TODAY = "2026-11-25";

function timing(overrides: Partial<Pick<Announcement, "startsOn" | "endsOn" | "showOnSite" | "showOnTv">> = {}) {
  return { startsOn: null, endsOn: null, showOnSite: true, showOnTv: true, ...overrides };
}

describe("announcementStatus", () => {
  it("is active with no dates at all", () => {
    expect(announcementStatus(timing(), TODAY)).toBe("active");
  });

  it("treats both dates as inclusive", () => {
    expect(announcementStatus(timing({ startsOn: TODAY }), TODAY)).toBe("active");
    expect(announcementStatus(timing({ endsOn: TODAY }), TODAY)).toBe("active");
    expect(announcementStatus(timing({ startsOn: TODAY, endsOn: TODAY }), TODAY)).toBe("active");
  });

  it("is scheduled until its first day", () => {
    expect(announcementStatus(timing({ startsOn: "2026-11-26" }), TODAY)).toBe("scheduled");
    expect(announcementStatus(timing({ startsOn: "2026-11-26", endsOn: "2026-12-01" }), TODAY)).toBe("scheduled");
  });

  it("has ended after its last day", () => {
    expect(announcementStatus(timing({ endsOn: "2026-11-24" }), TODAY)).toBe("ended");
    expect(announcementStatus(timing({ startsOn: "2026-11-01", endsOn: "2026-11-24" }), TODAY)).toBe("ended");
  });

  it("is hidden when it is shown on neither screen", () => {
    expect(announcementStatus(timing({ showOnSite: false, showOnTv: false }), TODAY)).toBe("hidden");
    expect(announcementStatus(timing({ showOnSite: false, showOnTv: false, startsOn: "2027-01-01" }), TODAY)).toBe(
      "hidden",
    );
  });

  it("stays visible when one screen shows it", () => {
    expect(announcementStatus(timing({ showOnSite: false }), TODAY)).toBe("active");
    expect(announcementStatus(timing({ showOnTv: false }), TODAY)).toBe("active");
  });

  it("prefers ended over hidden", () => {
    expect(announcementStatus(timing({ showOnSite: false, showOnTv: false, endsOn: "2026-01-01" }), TODAY)).toBe(
      "ended",
    );
  });

  it("depends on the mosque's date, not on a clock", () => {
    const announcement = timing({ startsOn: "2026-11-26" });
    expect(announcementStatus(announcement, "2026-11-25")).toBe("scheduled");
    expect(announcementStatus(announcement, "2026-11-26")).toBe("active");
  });
});

describe("countActiveAnnouncements", () => {
  it("counts only what is on show today", () => {
    const list = [
      timing(),
      timing({ startsOn: "2027-01-01" }),
      timing({ endsOn: "2026-01-01" }),
      timing({ showOnSite: false, showOnTv: false }),
      timing({ showOnTv: false }),
    ];
    expect(countActiveAnnouncements(list, TODAY)).toBe(2);
    expect(countActiveAnnouncements([], TODAY)).toBe(0);
  });
});

describe("describeSchedule", () => {
  it("covers every combination of dates", () => {
    expect(describeSchedule({ startsOn: null, endsOn: null })).toBe("Until removed");
    expect(describeSchedule({ startsOn: "2027-03-01", endsOn: null })).toBe("From 1 March 2027, until removed");
    expect(describeSchedule({ startsOn: null, endsOn: "2027-03-09" })).toBe("Until 9 March 2027");
    expect(describeSchedule({ startsOn: "2027-03-01", endsOn: "2027-03-09" })).toBe(
      "From 1 March 2027 until 9 March 2027",
    );
    expect(describeSchedule({ startsOn: "2027-03-01", endsOn: "2027-03-01" })).toBe("On 1 March 2027 only");
  });
});

describe("describeAudience", () => {
  it("names the screens", () => {
    expect(describeAudience({ showOnSite: true, showOnTv: true })).toBe("Website and TV");
    expect(describeAudience({ showOnSite: true, showOnTv: false })).toBe("Website only");
    expect(describeAudience({ showOnSite: false, showOnTv: true })).toBe("TV only");
    expect(describeAudience({ showOnSite: false, showOnTv: false })).toBe("Not shown anywhere");
  });
});

describe("the announcement form", () => {
  const stored: Announcement = {
    id: 7,
    title: "Eid prayer",
    body: "8:00 AM in the main hall.",
    startsOn: "2027-03-01",
    endsOn: null,
    showOnSite: true,
    showOnTv: false,
    pinned: true,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  };

  it("round-trips a stored announcement", () => {
    const form = announcementToForm(stored);
    expect(form).toEqual({
      title: "Eid prayer",
      body: "8:00 AM in the main hall.",
      startsOn: "2027-03-01",
      endsOn: "",
      showOnSite: true,
      showOnTv: false,
      pinned: true,
    });
    expect(formToAnnouncementInput(form)).toEqual({
      title: "Eid prayer",
      body: "8:00 AM in the main hall.",
      startsOn: "2027-03-01",
      endsOn: null,
      showOnSite: true,
      showOnTv: false,
      pinned: true,
    });
  });

  it("sends empty dates as no limit", () => {
    const input = formToAnnouncementInput(EMPTY_ANNOUNCEMENT_FORM);
    expect(input.startsOn).toBeNull();
    expect(input.endsOn).toBeNull();
  });

  it("previews the status of what is being typed", () => {
    expect(formStatus(EMPTY_ANNOUNCEMENT_FORM, TODAY)).toBe("active");
    expect(formStatus({ ...EMPTY_ANNOUNCEMENT_FORM, startsOn: "2027-01-01" }, TODAY)).toBe("scheduled");
    expect(formStatus({ ...EMPTY_ANNOUNCEMENT_FORM, endsOn: "2026-01-01" }, TODAY)).toBe("ended");
    expect(formStatus({ ...EMPTY_ANNOUNCEMENT_FORM, showOnSite: false, showOnTv: false }, TODAY)).toBe("hidden");
  });

  it("ignores a half-typed date in the preview", () => {
    expect(formStatus({ ...EMPTY_ANNOUNCEMENT_FORM, startsOn: "2027-13-99" }, TODAY)).toBe("active");
  });

  it("compares forms by value", () => {
    expect(announcementFormsEqual(EMPTY_ANNOUNCEMENT_FORM, { ...EMPTY_ANNOUNCEMENT_FORM })).toBe(true);
    expect(announcementFormsEqual(EMPTY_ANNOUNCEMENT_FORM, { ...EMPTY_ANNOUNCEMENT_FORM, pinned: true })).toBe(false);
    expect(announcementFormsEqual(EMPTY_ANNOUNCEMENT_FORM, { ...EMPTY_ANNOUNCEMENT_FORM, title: "x" })).toBe(false);
  });
});

describe("listByStatus", () => {
  it("puts what is on show first and what is over last, keeping the given order within a status", () => {
    const list = [
      { id: 1, startsOn: null, endsOn: "2026-11-01", showOnSite: true, showOnTv: true },
      { id: 2, startsOn: null, endsOn: null, showOnSite: true, showOnTv: false },
      { id: 3, startsOn: "2026-12-01", endsOn: null, showOnSite: true, showOnTv: true },
      { id: 4, startsOn: null, endsOn: null, showOnSite: false, showOnTv: false },
      { id: 5, startsOn: null, endsOn: null, showOnSite: false, showOnTv: true },
    ];
    const ordered = listByStatus(list, "2026-11-25");
    expect(ordered.map((item) => item.announcement.id)).toEqual([2, 5, 3, 4, 1]);
    expect(ordered.map((item) => item.status)).toEqual(["active", "active", "scheduled", "hidden", "ended"]);
  });

  it("returns an empty list for no announcements", () => {
    expect(listByStatus([], "2026-11-25")).toEqual([]);
  });
});

describe("applyLocalAnnouncements", () => {
  const make = (id: number, title: string): Announcement => ({
    id,
    title,
    body: "",
    startsOn: null,
    endsOn: null,
    showOnSite: true,
    showOnTv: true,
    pinned: false,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  });
  const stored = [make(1, "Parking"), make(2, "Classes"), make(3, "Collection")];

  it("returns the stored list when nothing was changed here", () => {
    expect(applyLocalAnnouncements(stored, new Map())).toBe(stored);
  });

  it("shows an edit in place", () => {
    const shown = applyLocalAnnouncements(stored, new Map([[2, make(2, "Weekend classes")]]));
    expect(shown.map((item) => item.title)).toEqual(["Parking", "Weekend classes", "Collection"]);
  });

  it("drops a deleted announcement", () => {
    const shown = applyLocalAnnouncements(stored, new Map([[1, null]]));
    expect(shown.map((item) => item.id)).toEqual([2, 3]);
  });

  it("puts new announcements first, newest at the top", () => {
    const shown = applyLocalAnnouncements(
      stored,
      new Map([
        [4, make(4, "Eid salah")],
        [5, make(5, "Janazah")],
      ]),
    );
    expect(shown.map((item) => item.id)).toEqual([5, 4, 1, 2, 3]);
  });

  it("ignores the deletion of something the list never had", () => {
    expect(applyLocalAnnouncements(stored, new Map([[9, null]])).map((item) => item.id)).toEqual([1, 2, 3]);
  });
});
