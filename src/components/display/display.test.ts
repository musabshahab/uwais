import { createElement, type FunctionComponent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisplayProvider } from "@/lib/client/prayer-state";
import { makePayload } from "@/lib/client/testing";
import type { DisplayPayload } from "@/lib/types";
import {
  ClockFace,
  ConnectionBadge,
  ConnectionNotice,
  Countdown,
  GregorianDateText,
  HijriDateText,
  LiveClock,
  NextPrayerCountdown,
  NextPrayerLabel,
  PrayerName,
  TimeText,
} from "./index";

/**
 * These tests render the way the server does. For the components that read
 * the live display that is exactly the state that matters for hydration: what
 * they output before the clock is known.
 */
const html = (element: ReactElement): string => renderToStaticMarkup(element);

/** `children` is a required prop; as a `createElement` argument it has to be viewed as optional. */
const Provider = DisplayProvider as FunctionComponent<{ initial: DisplayPayload }>;

/** Renders a component inside a `DisplayProvider`, as the server would. */
function inDisplay(child: ReactElement, payload: DisplayPayload = makePayload()): string {
  return html(createElement(Provider, { initial: payload }, child));
}

const NO_BREAK_SPACE = " ";

describe("TimeText", () => {
  it("writes a 12-hour time with a separate, small period", () => {
    const out = html(createElement(TimeText, { time: "17:05", format: "12h" }));
    expect(out).toBe(
      '<time dateTime="17:05" class="display-time">5:05<span class="display-time-period"> PM</span></time>',
    );
  });

  it("writes midnight and noon the way people say them", () => {
    expect(html(createElement(TimeText, { time: "00:07", format: "12h" }))).toContain(">12:07<");
    expect(html(createElement(TimeText, { time: "00:07", format: "12h" }))).toContain(" AM<");
    expect(html(createElement(TimeText, { time: "12:00", format: "12h" }))).toContain(" PM<");
  });

  it("writes a 24-hour time without a period", () => {
    const out = html(createElement(TimeText, { time: "17:05", format: "24h" }));
    expect(out).toBe('<time dateTime="17:05" class="display-time">17:05</time>');
  });

  it("adds the caller's classes to its own", () => {
    const out = html(createElement(TimeText, { time: "17:05", format: "24h", className: "tv-time" }));
    expect(out).toContain('class="display-time tv-time"');
  });

  it.each([null, undefined, "", "25:99", "5pm"])("shows a placeholder for a missing time (%j)", (time) => {
    const out = html(createElement(TimeText, { time, format: "12h" }));
    expect(out).toBe(
      '<span class="display-time"><span aria-hidden="true">--:--</span>' +
        '<span class="display-sr-only">No time</span></span>',
    );
  });

  it("lets the caller choose the placeholder and what is read out for it", () => {
    const out = html(
      createElement(TimeText, { time: null, format: "12h", placeholder: "n/a", missingLabel: "Not published" }),
    );
    expect(out).toContain('<span aria-hidden="true">n/a</span>');
    expect(out).toContain(">Not published<");
  });
});

describe("Countdown", () => {
  it("ticks silently and reads out as words with its label", () => {
    const out = html(createElement(Countdown, { seconds: 725, label: "Time until Asr jamaat" }));
    expect(out).toBe(
      '<span role="timer" aria-live="off" class="display-countdown">' +
        '<span aria-hidden="true">12:05</span>' +
        '<span class="display-sr-only">Time until Asr jamaat: 12 min</span></span>',
    );
  });

  it("shows hours once there are any", () => {
    expect(html(createElement(Countdown, { seconds: 3909 }))).toContain('<span aria-hidden="true">1:05:09</span>');
    expect(html(createElement(Countdown, { seconds: 3909 }))).toContain(">1 hr 5 min<");
  });

  it("can be written in words", () => {
    const out = html(createElement(Countdown, { seconds: 3909, mode: "words" }));
    expect(out).toContain('<span aria-hidden="true">1 hr 5 min</span>');
  });

  it("reads sensibly in the last minute and never runs below zero", () => {
    expect(html(createElement(Countdown, { seconds: 42 }))).toContain(">less than a minute<");
    const passed = html(createElement(Countdown, { seconds: -30 }));
    expect(passed).toContain('<span aria-hidden="true">00:00</span>');
    expect(passed).toContain(">less than a minute<");
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "shows a placeholder that is hidden from screen readers when there is nothing to count down to (%j)",
    (seconds) => {
      const out = html(createElement(Countdown, { seconds, className: "tv-countdown" }));
      expect(out).toBe('<span aria-hidden="true" class="display-countdown tv-countdown">--:--</span>');
    },
  );
});

describe("PrayerName", () => {
  it("marks the Arabic name up as Arabic and keeps the two names apart", () => {
    const out = html(createElement(PrayerName, { name: "Asr", arabic: "العصر" }));
    expect(out).toBe(
      '<span class="display-prayer-name"><span class="display-prayer-name-latin">Asr</span> ' +
        '<span lang="ar" dir="rtl" class="arabic display-prayer-name-arabic">العصر</span></span>',
    );
  });

  it("can stack the names and style the Arabic", () => {
    const out = html(
      createElement(PrayerName, { name: "Asr", arabic: "العصر", layout: "stacked", arabicClassName: "text-muted" }),
    );
    expect(out).toContain('class="display-prayer-name display-prayer-name-stacked"');
    expect(out).toContain('class="arabic display-prayer-name-arabic text-muted"');
  });

  it.each([undefined, null, ""])("renders the English name alone without an Arabic one (%j)", (arabic) => {
    const out = html(createElement(PrayerName, { name: "Sunrise", arabic, className: "font-display" }));
    expect(out).toBe(
      '<span class="display-prayer-name font-display"><span class="display-prayer-name-latin">Sunrise</span></span>',
    );
  });
});

describe("ClockFace", () => {
  const clock = { time: "14:05", second: 9 };

  it("shows hours and minutes, with seconds that a screen reader skips", () => {
    const out = html(createElement(ClockFace, { clock, format: "12h", showSeconds: true }));
    expect(out).toBe(
      '<time dateTime="14:05:09" class="display-clock display-appear">2:05' +
        '<span aria-hidden="true" class="display-clock-minor display-clock-seconds">:09</span>' +
        '<span class="display-clock-minor display-clock-period"> PM</span></time>',
    );
  });

  it("leaves out the seconds and the period when asked", () => {
    const out = html(createElement(ClockFace, { clock, format: "12h", showPeriod: false }));
    expect(out).toBe('<time dateTime="14:05:09" class="display-clock display-appear">2:05</time>');
  });

  it("shows a 24-hour clock without a period", () => {
    const out = html(createElement(ClockFace, { clock, format: "24h", showSeconds: true, className: "tv-clock" }));
    expect(out).toContain('class="display-clock display-appear tv-clock"');
    expect(out).toContain(">14:05<span");
    expect(out).not.toContain("display-clock-period");
  });

  it("is an invisible placeholder of the same shape while pending", () => {
    const out = html(createElement(ClockFace, { clock, format: "12h", showSeconds: true, pending: true }));
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('class="display-clock display-pending"');
    // A machine-readable time would claim the placeholder is the time.
    expect(out).not.toContain("dateTime");
    expect(out).toContain(":09");
  });
});

describe("ConnectionNotice", () => {
  it("is an empty live region while the connection is live", () => {
    expect(html(createElement(ConnectionNotice, { status: "live", lastUpdated: "2:05 PM" }))).toBe(
      '<span role="status" aria-live="polite"></span>',
    );
  });

  it("says offline, with the age of the data", () => {
    const out = html(createElement(ConnectionNotice, { status: "offline", lastUpdated: "2:05 PM" }));
    expect(out).toMatch(/^<span role="status" aria-live="polite"><span class="display-badge display-badge-offline">/);
    expect(out).toContain('<span class="display-badge-label">Offline</span>');
    expect(out).toContain('<span class="display-badge-detail">Last updated 2:05 PM</span>');
    // The icon is decoration; the words carry the meaning.
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("says reconnecting when the server cannot be reached properly", () => {
    const out = html(createElement(ConnectionNotice, { status: "stale", className: "ml-auto" }));
    expect(out).toContain('class="display-badge display-badge-stale ml-auto"');
    expect(out).toContain(">Reconnecting<");
    expect(out).not.toContain("display-badge-detail");
  });
});

describe("before the clock is known (server render and hydration)", () => {
  it("LiveClock holds its space with an invisible clock derived from the payload", () => {
    const out = inDisplay(createElement(LiveClock, { showSeconds: true, className: "tv-clock" }));
    expect(out).toBe(
      '<time aria-hidden="true" class="display-clock display-pending tv-clock">12:00' +
        '<span aria-hidden="true" class="display-clock-minor display-clock-seconds">:00</span>' +
        '<span class="display-clock-minor display-clock-period"> PM</span></time>',
    );
  });

  it("LiveClock follows the mosque's time format unless told otherwise", () => {
    const payload = makePayload();
    payload.settings.timeFormat = "24h";
    expect(inDisplay(createElement(LiveClock), payload)).not.toContain("display-clock-period");
    expect(inDisplay(createElement(LiveClock, { format: "12h" }), payload)).toContain("display-clock-period");
  });

  it("GregorianDateText shows the day the payload was produced on, in the mosque's timezone", () => {
    expect(inDisplay(createElement(GregorianDateText))).toBe(
      '<time dateTime="2026-11-25">Wednesday 25 November 2026</time>',
    );
    expect(inDisplay(createElement(GregorianDateText, { format: "medium", className: "text-muted" }))).toBe(
      '<time dateTime="2026-11-25" class="text-muted">Wed 25 Nov</time>',
    );

    // 23:30 UTC is already tomorrow in Karachi.
    const karachi = makePayload({ serverNow: Date.UTC(2026, 10, 25, 23, 30) });
    karachi.settings.timezone = "Asia/Karachi";
    expect(inDisplay(createElement(GregorianDateText), karachi)).toContain("Thursday 26 November 2026");
  });

  it("HijriDateText and NextPrayerLabel hold one line open without saying anything", () => {
    const placeholder = `<span aria-hidden="true" class="display-pending">${NO_BREAK_SPACE}</span>`;
    expect(inDisplay(createElement(HijriDateText))).toBe(placeholder);
    expect(inDisplay(createElement(NextPrayerLabel, { fallback: "No times" }))).toBe(placeholder);
  });

  it("NextPrayerCountdown holds its space with an invisible placeholder", () => {
    expect(inDisplay(createElement(NextPrayerCountdown, { className: "tv-countdown" }))).toBe(
      '<span aria-hidden="true" class="display-countdown display-pending tv-countdown">--:--</span>',
    );
  });

  it("ConnectionBadge is an empty live region: the server rendered live data", () => {
    expect(inDisplay(createElement(ConnectionBadge))).toBe('<span role="status" aria-live="polite"></span>');
  });
});

describe("outside a DisplayProvider", () => {
  it.each([
    ["LiveClock", LiveClock],
    ["GregorianDateText", GregorianDateText],
    ["HijriDateText", HijriDateText],
    ["NextPrayerLabel", NextPrayerLabel],
    ["NextPrayerCountdown", NextPrayerCountdown],
    ["ConnectionBadge", ConnectionBadge],
  ] as const)("%s explains what is missing", (_name, component) => {
    expect(() => html(createElement(component as FunctionComponent))).toThrow(/inside <DisplayProvider>/);
  });
});
