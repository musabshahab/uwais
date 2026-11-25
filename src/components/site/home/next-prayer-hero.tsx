"use client";

import { useId } from "react";
import { Lattice } from "@/components/brand/lattice";
import { ConnectionBadge, GregorianDateText, HijriDateText, NextPrayerCountdown, TimeText } from "@/components/display";
import { Arabic } from "@/components/ui/arabic";
import { cn } from "@/components/ui/cn";
import { describeEvent, useDisplay, usePrayerSchedule } from "@/lib/client";
import { eventArabic } from "@/lib/site/home";
import { NEEDS_SCRIPT } from "../no-script";
import {
  HERO_BODY,
  HERO_COUNTDOWN,
  HERO_DATE_LINE,
  HERO_FIGURE_LABEL,
  HERO_FIGURE_VALUE,
  HERO_FIGURES,
  HERO_HEADING,
  HERO_NAME,
  HERO_NAME_LINE,
  HERO_PANEL,
  HERO_TIME,
} from "./home-layout";

/** A no-break space: holds one line open while the real text is not known yet. */
const LINE_PLACEHOLDER = "\u00a0";

/** Props of {@link NextPrayerHero}. */
export interface NextPrayerHeroProps {
  className?: string;
}

/**
 * The first thing a worshipper sees: what comes next (`Asr jamaat`,
 * `Maghrib begins`, `2nd Jumu'ah`), at what time, and a countdown to it, with
 * today's date in both calendars.
 *
 * Everything that depends on the current time appears only once the live
 * clock is running. Until then each piece is an invisible placeholder set in
 * the same type, so the panel has its final size from the first paint and
 * never shows a guess. Must be rendered inside `DisplayProvider`.
 */
export function NextPrayerHero({ className }: NextPrayerHeroProps) {
  const headingId = useId();
  const { settings } = useDisplay();
  const schedule = usePrayerSchedule();
  const pending = schedule === null;
  const next = schedule === null ? null : schedule.next;
  const tomorrow = schedule !== null && next !== null && next.date !== schedule.today;

  return (
    <section
      {...NEEDS_SCRIPT}
      aria-labelledby={headingId}
      className={cn(HERO_PANEL, className)}
    >
      <div className="absolute inset-0 overflow-hidden rounded-xl">
        <Lattice tone="accent" opacity={0.2} fade="edges" />
      </div>
      <ConnectionBadge className="absolute -top-3 right-4 z-10 text-xs shadow-sm sm:right-6 max-sm:[&_.display-badge-detail]:hidden" />

      <div className={HERO_BODY}>
        <div className="min-w-0">
          <p className={HERO_DATE_LINE}>
            <GregorianDateText format="medium" className="font-semibold sm:hidden" />
            <GregorianDateText className="font-semibold max-sm:hidden" />
            <HijriDateText className="text-on-brand-accent" />
          </p>
          <h2 id={headingId} className={HERO_HEADING}>
            Next prayer
          </h2>
          <p className={HERO_NAME_LINE}>
            {pending ? (
              <span aria-hidden="true" className={cn("display-pending", HERO_NAME)}>
                {LINE_PLACEHOLDER}
              </span>
            ) : next === null ? (
              <span className={cn("display-appear", HERO_NAME)}>Nothing more today</span>
            ) : (
              <>
                <span className={cn("display-appear", HERO_NAME)}>{describeEvent(next)}</span>
                <Arabic className="display-appear text-lg leading-none text-on-brand-accent min-[360px]:text-xl sm:text-3xl">
                  {eventArabic(next)}
                </Arabic>
              </>
            )}
          </p>
        </div>

        {!pending && next === null ? (
          <p className="display-appear flex min-h-14 max-w-prose items-center text-on-brand/90 sm:min-h-18 sm:border-t sm:border-on-brand/20 sm:pt-4 xl:max-w-xs xl:border-0 xl:pt-0">
            Tomorrow&apos;s prayer times have not been published yet.
          </p>
        ) : (
          <dl className={HERO_FIGURES}>
            <div>
              <dt className={HERO_FIGURE_LABEL}>{tomorrow ? "Tomorrow at" : "Starts at"}</dt>
              <dd className={HERO_FIGURE_VALUE}>
                <TimeText
                  time={next === null ? null : next.time}
                  format={settings.timeFormat}
                  className={cn(HERO_TIME, pending ? "display-pending" : "display-appear")}
                />
              </dd>
            </div>
            <div className="text-right">
              <dt className={HERO_FIGURE_LABEL}>Starts in</dt>
              <dd className={HERO_FIGURE_VALUE}>
                <NextPrayerCountdown className={HERO_COUNTDOWN} />
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
