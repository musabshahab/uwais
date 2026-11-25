import { describe, expect, it } from "vitest";
import {
  COMPACT_TEXT_FROM,
  DEFAULT_BAND_SECONDS,
  MAX_BAND_SECONDS,
  MIN_BAND_SECONDS,
  bandIndexAt,
  bandSeconds,
  bandTextLength,
  bandTextScale,
  buildBandItems,
  type BandItem,
} from "./band";
import { londonMs, makeAnnouncement, makeDay, makeSettings, makeWeek, scheduleAt } from "./testing";

const settings = makeSettings();

/** Wednesday midday: Jumu'ah is two days off and Thursday's Asr congregation differs. */
const wednesday = scheduleAt(londonMs(25, "12:00"));

function text(item: BandItem): string {
  return item.segments
    .map((segment) => (segment.type === "time" ? `<${segment.time}>` : segment.text))
    .join("");
}

describe("bandSeconds", () => {
  it("keeps the configured duration within bounds", () => {
    expect(bandSeconds(12)).toBe(12);
    expect(bandSeconds(1)).toBe(MIN_BAND_SECONDS);
    expect(bandSeconds(0)).toBe(MIN_BAND_SECONDS);
    expect(bandSeconds(-30)).toBe(MIN_BAND_SECONDS);
    expect(bandSeconds(999)).toBe(MAX_BAND_SECONDS);
    expect(bandSeconds(12.4)).toBe(12);
  });

  it("falls back to the default when the setting is not a number", () => {
    expect(bandSeconds(Number.NaN)).toBe(DEFAULT_BAND_SECONDS);
    expect(bandSeconds(Number.POSITIVE_INFINITY)).toBe(DEFAULT_BAND_SECONDS);
  });
});

describe("buildBandItems", () => {
  it("lists announcements, then Jumu'ah, then tomorrow's changes", () => {
    const items = buildBandItems({
      announcements: [
        makeAnnouncement(1, { title: "Please park considerately", body: "Use the car park." }),
        makeAnnouncement(2, { title: "Qur'an classes" }),
      ],
      schedule: wednesday,
      settings,
      tableDate: wednesday.today,
    });
    expect(items.map((item) => item.kind)).toEqual([
      "announcement",
      "announcement",
      "jumuah",
      "changes",
    ]);
    expect(items.every((item) => item.seconds === settings.tv.announcementSeconds)).toBe(true);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });

  it("gives an announcement a heading, its title and its body as one paragraph", () => {
    const [item] = buildBandItems({
      announcements: [
        makeAnnouncement(7, {
          title: "  Eid   prayer ",
          body: "First jamaat at 8.\n\nSecond   jamaat at 9.",
          updatedAt: "2026-11-22T09:00:00.000Z",
        }),
      ],
      schedule: null,
      settings,
      tableDate: "2026-11-25",
    });
    expect(item).toEqual({
      key: "announcement:7:2026-11-22T09:00:00.000Z",
      kind: "announcement",
      label: "Notice",
      title: "Eid prayer",
      segments: [{ type: "text", text: "First jamaat at 8. Second jamaat at 9." }],
      seconds: 12,
    });
  });

  it("handles an announcement with only a title, and skips an empty one", () => {
    const items = buildBandItems({
      announcements: [
        makeAnnouncement(1, { title: "Car park closed today", body: "   " }),
        makeAnnouncement(2, { title: " ", body: "" }),
      ],
      schedule: null,
      settings,
      tableDate: "2026-11-25",
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Car park closed today");
    expect(items[0].segments).toEqual([]);
  });

  it("changes the key of an announcement when it is edited", () => {
    const build = (updatedAt: string) =>
      buildBandItems({
        announcements: [makeAnnouncement(1, { updatedAt })],
        schedule: null,
        settings,
        tableDate: "2026-11-25",
      })[0].key;
    expect(build("2026-11-20T10:00:00.000Z")).not.toBe(build("2026-11-21T10:00:00.000Z"));
  });

  it("advertises a single default Jumu'ah by its time alone", () => {
    const items = buildBandItems({
      announcements: [],
      schedule: wednesday,
      settings,
      tableDate: wednesday.today,
    });
    const jumuah = items.filter((item) => item.kind === "jumuah")[0];
    expect(jumuah.key).toBe("jumuah:2026-11-27");
    expect(jumuah.label).toBe("Jumu'ah");
    expect(jumuah.title).toBe("This Friday");
    expect(jumuah.segments).toEqual([{ type: "time", time: "13:15" }]);
  });

  it("lists several Jumu'ah slots with their labels, earliest first", () => {
    const twoSlots = makeSettings({
      jumuah: [
        { label: "2nd Jumu'ah", time: "13:30" },
        { label: "1st Jumu'ah", time: "12:30" },
      ],
    });
    const schedule = scheduleAt(londonMs(25, "12:00"), makeWeek(), twoSlots);
    const items = buildBandItems({
      announcements: [],
      schedule,
      settings: twoSlots,
      tableDate: schedule.today,
    });
    const jumuah = items.filter((item) => item.kind === "jumuah")[0];
    expect(text(jumuah)).toBe("1st Jumu'ah <12:30>  ·  2nd Jumu'ah <13:30>");
  });

  it("keeps the label of a single slot that is not simply called Jumu'ah", () => {
    const khutbah = makeSettings({ jumuah: [{ label: "Khutbah", time: "13:00" }] });
    const schedule = scheduleAt(londonMs(25, "12:00"), makeWeek(), khutbah);
    const items = buildBandItems({
      announcements: [],
      schedule,
      settings: khutbah,
      tableDate: schedule.today,
    });
    expect(text(items.filter((item) => item.kind === "jumuah")[0])).toBe("Khutbah <13:00>");
  });

  it("says Tomorrow on a Thursday", () => {
    const thursday = scheduleAt(londonMs(26, "12:00"));
    const items = buildBandItems({
      announcements: [],
      schedule: thursday,
      settings,
      tableDate: thursday.today,
    });
    expect(items.filter((item) => item.kind === "jumuah")[0].title).toBe("Tomorrow");
  });

  it("leaves Jumu'ah out on a Friday, before and after the prayer", () => {
    for (const time of ["09:00", "13:00", "18:00", "23:00"]) {
      const friday = scheduleAt(londonMs(27, time));
      const items = buildBandItems({
        announcements: [],
        schedule: friday,
        settings,
        tableDate: friday.today,
      });
      expect(items.some((item) => item.kind === "jumuah")).toBe(false);
    }
  });

  it("leaves Jumu'ah out on Thursday night once the table shows Friday", () => {
    const thursdayNight = scheduleAt(londonMs(26, "21:00"));
    const items = buildBandItems({
      announcements: [],
      schedule: thursdayNight,
      settings,
      tableDate: thursdayNight.tomorrow,
    });
    expect(items.some((item) => item.kind === "jumuah")).toBe(false);
  });

  it("leaves Jumu'ah out when no time is known for it", () => {
    const none = makeSettings({ jumuah: [] });
    const schedule = scheduleAt(londonMs(25, "12:00"), makeWeek().map((day) => ({ ...day, dhuhrJamaat: null })), none);
    const items = buildBandItems({
      announcements: [],
      schedule,
      settings: none,
      tableDate: schedule.today,
    });
    expect(items.some((item) => item.kind === "jumuah")).toBe(false);
  });

  it("announces a congregation time that changes tomorrow", () => {
    const items = buildBandItems({
      announcements: [],
      schedule: wednesday,
      settings,
      tableDate: wednesday.today,
    });
    const changes = items.filter((item) => item.kind === "changes");
    expect(changes).toHaveLength(1);
    expect(changes[0].label).toBe("From tomorrow");
    expect(changes[0].title).toBeNull();
    expect(text(changes[0])).toBe("Asr jamaat <14:15> (was <14:30>)");
    expect(changes[0].key).toBe("changes:2026-11-26:0");
  });

  it("puts two changes in a message and starts another for the rest", () => {
    const days = [
      makeDay("2026-11-24"),
      makeDay("2026-11-25"),
      makeDay("2026-11-26", {
        fajrJamaat: "06:30",
        dhuhrJamaat: "12:45",
        asrJamaat: "14:15",
        maghribJamaat: "16:06",
        ishaJamaat: "19:15",
      }),
    ];
    const schedule = scheduleAt(londonMs(25, "12:00"), days);
    const changes = buildBandItems({
      announcements: [],
      schedule,
      settings,
      tableDate: schedule.today,
    }).filter((item) => item.kind === "changes");
    expect(changes.map(text)).toEqual([
      "Fajr jamaat <06:30> (was <06:15>)  ·  Dhuhr jamaat <12:45> (was <12:30>)",
      "Asr jamaat <14:15> (was <14:30>)  ·  Maghrib jamaat <16:06> (was <16:07>)",
      "Isha jamaat <19:15> (was <19:30>)",
    ]);
    expect(changes.map((item) => item.key)).toEqual([
      "changes:2026-11-26:0",
      "changes:2026-11-26:2",
      "changes:2026-11-26:4",
    ]);
  });

  it("has no changes to announce when tomorrow is the same", () => {
    const thursday = scheduleAt(londonMs(26, "12:00"));
    const items = buildBandItems({
      announcements: [],
      schedule: thursday,
      settings,
      tableDate: thursday.today,
    });
    expect(items.some((item) => item.kind === "changes")).toBe(false);
  });

  it("shows only announcements before the clock is known", () => {
    const items = buildBandItems({
      announcements: [makeAnnouncement(1)],
      schedule: null,
      settings,
      tableDate: "2026-11-25",
    });
    expect(items.map((item) => item.kind)).toEqual(["announcement"]);
  });

  it("falls back to the tagline when there is nothing else", () => {
    const friday = scheduleAt(londonMs(27, "09:00"));
    const items = buildBandItems({
      announcements: [],
      schedule: friday,
      settings: makeSettings({ tagline: "  Prayer times and\ncommunity updates " }),
      tableDate: friday.today,
    });
    expect(items).toEqual([
      {
        key: "tagline",
        kind: "tagline",
        label: null,
        title: null,
        segments: [{ type: "text", text: "Prayer times and community updates" }],
        seconds: 12,
      },
    ]);
  });

  it("is empty when there is nothing to show and no tagline", () => {
    const friday = scheduleAt(londonMs(27, "09:00"));
    expect(
      buildBandItems({
        announcements: [],
        schedule: friday,
        settings: makeSettings({ tagline: "   " }),
        tableDate: friday.today,
      }),
    ).toEqual([]);
    expect(
      buildBandItems({
        announcements: [],
        schedule: null,
        settings: makeSettings({ tagline: "" }),
        tableDate: "2026-11-25",
      }),
    ).toEqual([]);
  });

  it("clamps the duration of every message", () => {
    const fast = makeSettings({}, { announcementSeconds: 1 });
    const items = buildBandItems({
      announcements: [makeAnnouncement(1)],
      schedule: wednesday,
      settings: fast,
      tableDate: wednesday.today,
    });
    expect(items.length).toBeGreaterThan(1);
    expect(items.every((item) => item.seconds === MIN_BAND_SECONDS)).toBe(true);
  });
});

describe("bandIndexAt", () => {
  const three = [{ seconds: 10 }, { seconds: 10 }, { seconds: 10 }];

  it("is -1 for an empty list and 0 for a single message", () => {
    expect(bandIndexAt([], 123_456)).toBe(-1);
    expect(bandIndexAt([{ seconds: 12 }], 123_456_789)).toBe(0);
  });

  it("shows the first message before the clock is known", () => {
    expect(bandIndexAt(three, null)).toBe(0);
    expect(bandIndexAt(three, Number.NaN)).toBe(0);
  });

  it("walks through the messages, each for its own duration, and loops", () => {
    const base = 30_000 * 1000; // A multiple of the 30-second loop.
    expect(bandIndexAt(three, base)).toBe(0);
    expect(bandIndexAt(three, base + 9_999)).toBe(0);
    expect(bandIndexAt(three, base + 10_000)).toBe(1);
    expect(bandIndexAt(three, base + 19_999)).toBe(1);
    expect(bandIndexAt(three, base + 20_000)).toBe(2);
    expect(bandIndexAt(three, base + 29_999)).toBe(2);
    expect(bandIndexAt(three, base + 30_000)).toBe(0);
  });

  it("honours different durations", () => {
    const mixed = [{ seconds: 5 }, { seconds: 20 }, { seconds: 10 }];
    const base = 35_000 * 1000;
    const shown = [0, 4, 5, 24, 25, 34, 35].map((second) => bandIndexAt(mixed, base + second * 1000));
    expect(shown).toEqual([0, 0, 1, 1, 2, 2, 0]);
  });

  it("depends on the clock alone, so every screen agrees", () => {
    const nowMs = londonMs(25, "14:03:27");
    expect(bandIndexAt(three, nowMs)).toBe(bandIndexAt(three.slice(), nowMs));
    // 14:03:27 is 50,607 seconds into a day of whole 30-second loops: 27 seconds into a loop.
    expect(bandIndexAt(three, nowMs)).toBe(2);
  });

  it("gives every message its share over a whole loop", () => {
    const counts = [0, 0, 0];
    const start = londonMs(25, "09:00");
    for (let second = 0; second < 30; second++) counts[bandIndexAt(three, start + second * 1000)]++;
    expect(counts).toEqual([10, 10, 10]);
  });

  it("stays in range for instants before the epoch", () => {
    expect(bandIndexAt(three, -1)).toBe(2);
    expect(bandIndexAt(three, -30_000)).toBe(0);
  });

  it("clamps a duration that is out of bounds rather than stalling", () => {
    const broken = [{ seconds: 0 }, { seconds: Number.NaN }];
    const loop = MIN_BAND_SECONDS + DEFAULT_BAND_SECONDS;
    const base = loop * 1000 * 1000;
    expect(bandIndexAt(broken, base)).toBe(0);
    expect(bandIndexAt(broken, base + MIN_BAND_SECONDS * 1000)).toBe(1);
  });
});

describe("bandTextLength and bandTextScale", () => {
  it("counts the title, the words and the times", () => {
    expect(bandTextLength({ title: null, segments: [] })).toBe(0);
    expect(bandTextLength({ title: "Hello", segments: [{ type: "text", text: "world" }] })).toBe(11);
    expect(
      bandTextLength({
        title: null,
        segments: [
          { type: "text", text: "Asr jamaat " },
          { type: "time", time: "14:15" },
        ],
      }),
    ).toBe(19);
  });

  it("sets long messages in the compact size", () => {
    const body = (length: number) => ({
      title: null,
      segments: [{ type: "text" as const, text: "x".repeat(length) }],
    });
    expect(bandTextScale(body(40))).toBe("regular");
    expect(bandTextScale(body(COMPACT_TEXT_FROM))).toBe("regular");
    expect(bandTextScale(body(COMPACT_TEXT_FROM + 1))).toBe("compact");
    expect(bandTextScale(body(600))).toBe("compact");
  });
});
