import { describe, expect, it } from "vitest";
import { URGENT_SECONDS, nextEventView } from "./next-event";
import { londonMs, makeSettings, makeWeek, stateAt } from "./testing";

describe("nextEventView", () => {
  it("names a congregation and the start of a prayer time", () => {
    expect(nextEventView(stateAt(londonMs(25, "14:10")))).toMatchObject({
      label: "Asr jamaat in",
      timerLabel: "Time until Asr jamaat",
      urgent: false,
    });
    expect(nextEventView(stateAt(londonMs(25, "15:00")))).toMatchObject({
      label: "Maghrib begins in",
      timerLabel: "Time until Maghrib begins",
      urgent: false,
    });
  });

  it("carries the event it counts down to", () => {
    const view = nextEventView(stateAt(londonMs(25, "14:10")));
    expect(view?.event.time).toBe("14:30");
    expect(view?.event.secondsUntil).toBe(20 * 60);
  });

  it("turns urgent for the final five minutes before a congregation", () => {
    expect(nextEventView(stateAt(londonMs(25, "14:24:59")))?.urgent).toBe(false);
    expect(nextEventView(stateAt(londonMs(25, "14:25:00")))?.urgent).toBe(true);
    expect(nextEventView(stateAt(londonMs(25, "14:29:59")))?.urgent).toBe(true);
    expect(nextEventView(stateAt(londonMs(25, "14:25:00")))?.event.secondsUntil).toBe(URGENT_SECONDS);
  });

  it("is no longer urgent once the congregation has started", () => {
    const view = nextEventView(stateAt(londonMs(25, "14:30:00")));
    expect(view).toMatchObject({ label: "Maghrib begins in", urgent: false });
  });

  it("is never urgent for the start of a prayer time", () => {
    expect(nextEventView(stateAt(londonMs(25, "16:00")))).toMatchObject({
      label: "Maghrib begins in",
      urgent: false,
    });
    // Maghrib's congregation follows five minutes after it begins.
    expect(nextEventView(stateAt(londonMs(25, "16:03")))).toMatchObject({
      label: "Maghrib jamaat in",
      urgent: true,
    });
  });

  it("names Jumu'ah congregations by their label and Friday's start as Dhuhr", () => {
    const twoSlots = makeSettings({
      jumuah: [
        { label: "1st Jumu'ah", time: "12:30" },
        { label: "2nd Jumu'ah", time: "13:30" },
      ],
    });
    expect(nextEventView(stateAt(londonMs(27, "11:00"), makeWeek(), twoSlots))?.label).toBe(
      "Dhuhr begins in",
    );
    expect(nextEventView(stateAt(londonMs(27, "12:00"), makeWeek(), twoSlots))?.label).toBe(
      "1st Jumu'ah in",
    );
    expect(nextEventView(stateAt(londonMs(27, "13:27"), makeWeek(), twoSlots))).toMatchObject({
      label: "2nd Jumu'ah in",
      urgent: true,
    });
  });

  it("counts down to tomorrow's Fajr after Isha", () => {
    const view = nextEventView(stateAt(londonMs(25, "21:00")));
    expect(view).toMatchObject({ label: "Fajr begins in", urgent: false });
    expect(view?.event.date).toBe("2026-11-26");
  });

  it("is null when the timetable has nothing ahead", () => {
    expect(nextEventView(stateAt(londonMs(28, "22:00")))).toBeNull();
    expect(nextEventView(stateAt(londonMs(25, "12:00"), []))).toBeNull();
  });
});
