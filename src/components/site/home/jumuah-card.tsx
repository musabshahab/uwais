"use client";

import { useId } from "react";
import { PrayerName, TimeText } from "@/components/display";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { useDisplay } from "@/lib/client";
import { formatDateLong } from "@/lib/time";
import { JUMUAH_LABEL } from "@/lib/types";
import { useDayFacts } from "./use-day-facts";

/** Props of {@link JumuahCard}. */
export interface JumuahCardProps {
  className?: string;
}

/**
 * The coming Friday's Jumu'ah: its date and every congregation, shown all
 * week. On a Friday it is today's until the last Jumu'ah has started, then
 * next week's. Must be rendered inside `DisplayProvider`.
 */
export function JumuahCard({ className }: JumuahCardProps) {
  const headingId = useId();
  const { settings } = useDisplay();
  const { jumuah, today } = useDayFacts();

  return (
    <Card as="section" aria-labelledby={headingId} className={cn("px-5 py-5 sm:px-6", className)}>
      <h2 id={headingId}>
        <PrayerName
          name={JUMUAH_LABEL.name}
          arabic={JUMUAH_LABEL.arabic}
          className="font-display text-xl font-semibold tracking-tight"
          arabicClassName="text-accent-fg"
        />
      </h2>
      <p className="mt-0.5 text-sm text-fg-muted">
        {jumuah.date === today ? "Today, " : null}
        <time dateTime={jumuah.date}>{formatDateLong(jumuah.date)}</time>
      </p>
      {jumuah.slots.length === 0 ? (
        <p className="mt-4 text-fg-muted">Jumu&apos;ah times have not been announced yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {jumuah.slots.map((slot) => (
            <li
              key={`${slot.label}-${slot.time}`}
              className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 last:pb-0"
            >
              <span className="font-semibold">{slot.label}</span>
              <TimeText time={slot.time} format={settings.timeFormat} className="time-numerals text-time" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
