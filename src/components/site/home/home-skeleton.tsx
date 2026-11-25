import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { PRAYERS } from "@/lib/types";
import { NOSCRIPT_FALLBACK } from "../no-script";
import {
  HERO_BODY,
  HERO_DATE_LINE,
  HERO_FIGURE_LABEL,
  HERO_FIGURE_VALUE,
  HERO_FIGURES,
  HERO_HEADING,
  HERO_NAME,
  HERO_NAME_LINE,
  HERO_PANEL,
  HERO_TIME,
  HOME_ASIDE,
  HOME_GRID,
  TIMES_BEGINS_COLUMN,
  TIMES_CARD,
  TIMES_COLUMN_HEADING,
  TIMES_DATE,
  TIMES_FOOTER,
  TIMES_HEADER,
  TIMES_JAMAAT_COLUMN,
  TIMES_NAME_COLUMN,
  TIMES_ROW,
  TIMES_ROW_PADDING,
  TIMES_STATUS_SLOT,
  TIMES_SUNRISE_TIME,
  TIMES_TIME,
  TIMES_TITLE,
  timesNameClasses,
} from "./home-layout";

/** Fajr, Sunrise and the four prayers after: the six rows of a day. */
const ROW_COUNT = PRAYERS.length + 1;

/** Sunrise is the second row. */
const SUNRISE_ROW = 1;

/**
 * One line of text that is not known yet: an empty line set in the type of
 * the real one (so it is exactly as tall), with a shimmer bar drawn over it.
 */
function Line({ className, bar, children }: { className?: string; bar?: string; children?: ReactNode }) {
  return (
    <span className={cn("relative", className)}>
      &nbsp;
      {bar ? <Skeleton className={cn("absolute top-1/2 h-[0.6em] -translate-y-1/2", bar)} /> : null}
      {children}
    </span>
  );
}

/** The next-prayer panel with nothing in it yet. */
function HeroSkeleton() {
  return (
    <div className={HERO_PANEL}>
      <div className={HERO_BODY}>
        <div className="min-w-0">
          <p className={HERO_DATE_LINE}>&nbsp;</p>
          <p className={HERO_HEADING}>&nbsp;</p>
          <p className={HERO_NAME_LINE}>
            <span className={HERO_NAME}>&nbsp;</span>
          </p>
        </div>
        <div className={HERO_FIGURES}>
          <div>
            <p className={HERO_FIGURE_LABEL}>&nbsp;</p>
            <p className={HERO_FIGURE_VALUE}>
              <span className={HERO_TIME}>&nbsp;</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The times card: its header, six rows and footer, with bars where the names and times will be. */
function TimesSkeleton() {
  return (
    <Card className={TIMES_CARD}>
      <div className={TIMES_HEADER}>
        <span className="size-control shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <Line className={TIMES_TITLE} bar="left-1/2 w-24 -translate-x-1/2" />
          <Line className={TIMES_DATE} bar="left-1/2 w-32 -translate-x-1/2" />
        </div>
        <span className="size-control shrink-0" />
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(TIMES_COLUMN_HEADING, TIMES_NAME_COLUMN)}>&nbsp;</th>
            <th className={cn(TIMES_COLUMN_HEADING, TIMES_BEGINS_COLUMN)}>&nbsp;</th>
            <th className={cn(TIMES_COLUMN_HEADING, TIMES_JAMAAT_COLUMN)}>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROW_COUNT }, (_, index) => {
            const sunrise = index === SUNRISE_ROW;
            const classes = timesNameClasses(sunrise);
            const time = sunrise ? TIMES_SUNRISE_TIME : TIMES_TIME;
            return (
              <tr key={index} className={TIMES_ROW}>
                <th className={cn(TIMES_NAME_COLUMN, TIMES_ROW_PADDING)}>
                  <span className={classes.stack}>
                    <Line className={classes.name} bar={sunrise ? "left-0 w-16" : "left-0 w-20"} />
                    <span className={classes.detail}>{sunrise ? null : <span className={TIMES_STATUS_SLOT} />}</span>
                  </span>
                </th>
                <td className={cn(TIMES_BEGINS_COLUMN, TIMES_ROW_PADDING)}>
                  <Line className={time} bar="right-0 w-16" />
                </td>
                <td className={cn(TIMES_JAMAAT_COLUMN, TIMES_ROW_PADDING)}>
                  <Line className={time} bar={sunrise ? undefined : "right-0 w-16"} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={TIMES_FOOTER}>
        <span className={cn(buttonClasses({ variant: "ghost", size: "sm" }), "invisible")}>&nbsp;</span>
      </div>
    </Card>
  );
}

/**
 * The home page while its data loads: the countdown panel, the times card
 * and the Jumu'ah card, built from the same class names as the real blocks
 * so that each has its final size and the page does not move when the
 * content arrives. Part of the prerendered shell; hidden from assistive
 * technology, which is told about the content when it is there.
 */
export function HomeSkeleton() {
  return (
    <div {...NOSCRIPT_FALLBACK} aria-hidden="true" className={HOME_GRID}>
      <HeroSkeleton />
      <TimesSkeleton />
      <div className={HOME_ASIDE}>
        <Card className="px-5 py-5 sm:px-6">
          <Line className="block font-display text-xl font-semibold" bar="left-0 w-32" />
          <Line className="mt-0.5 block text-sm" bar="left-0 w-44" />
          <div className="mt-3 border-t border-line pt-2.5">
            <Line className="block time-numerals text-time" bar="right-0 w-20" />
          </div>
        </Card>
      </div>
    </div>
  );
}
