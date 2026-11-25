"use client";

import { DisplayProvider } from "@/lib/client";
import type { DisplayPayload } from "@/lib/types";
import { Announcements } from "./announcements";
import { DayTimes } from "./day-times";
import { HOME_ASIDE, HOME_GRID } from "./home-layout";
import { JamaatChangesNotice } from "./jamaat-changes";
import { JumuahCard } from "./jumuah-card";
import { NextPrayerHero } from "./next-prayer-hero";
import { NoTimetable } from "./no-timetable";
import { useDayFacts } from "./use-day-facts";

/** The blocks of the home page, inside the live data they all read. */
function HomeBlocks() {
  const { dataStatus } = useDayFacts();
  return (
    <div className={HOME_GRID}>
      {dataStatus === "empty" ? (
        <NoTimetable className="min-w-0 self-start" />
      ) : (
        <>
          <NextPrayerHero />
          <DayTimes />
        </>
      )}
      <div className={HOME_ASIDE}>
        <JamaatChangesNotice />
        <JumuahCard />
        <Announcements />
      </div>
    </div>
  );
}

/** Props of {@link HomeView}. */
export interface HomeViewProps {
  /** What the server knew when it rendered the page, from `loadDisplayPayload`. */
  payload: DisplayPayload;
}

/**
 * The home page below the header, in order of importance: what is next and
 * how long until it, today's times with the day browser, then tomorrow's
 * changes, Jumu'ah and the announcements. On a wide screen the secondary
 * blocks sit beside the times.
 *
 * When there is no timetable for today or the weeks ahead, a message takes
 * the place of the countdown and the times; Jumu'ah (from the settings) and
 * the announcements stay.
 *
 * It takes the payload and sets up the live data itself, so that the server
 * hands the whole page to the browser as one component with plain data.
 * React then renders it in one piece, and the times are complete in the
 * HTML, readable even without JavaScript.
 */
export function HomeView({ payload }: HomeViewProps) {
  return (
    <DisplayProvider initial={payload}>
      <HomeBlocks />
    </DisplayProvider>
  );
}
