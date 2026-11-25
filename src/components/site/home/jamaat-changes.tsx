"use client";

import { TimeText } from "@/components/display";
import { Alert } from "@/components/ui/alert";
import { useDisplay } from "@/lib/client";
import { useDayFacts } from "./use-day-facts";

/** Props of {@link JamaatChangesNotice}. */
export interface JamaatChangesNoticeProps {
  className?: string;
}

/**
 * Warns that congregation times are different tomorrow, prayer by prayer,
 * with today's time and tomorrow's. Renders nothing when no time changes.
 * Must be rendered inside `DisplayProvider`.
 */
export function JamaatChangesNotice({ className }: JamaatChangesNoticeProps) {
  const { settings } = useDisplay();
  const { tomorrowChanges } = useDayFacts();
  if (tomorrowChanges.length === 0) return null;

  return (
    <Alert tone="info" title="Jamaat times change tomorrow" className={className}>
      <ul className="mt-1.5 flex flex-col gap-1">
        {tomorrowChanges.map((change) => (
          <li key={change.key} className="flex flex-wrap items-baseline gap-x-2">
            <span className="min-w-20 font-semibold">{change.name}</span>
            {/* The two times stay together: on a narrow phone they move under the name as a pair. */}
            <span className="inline-flex items-baseline gap-x-2 whitespace-nowrap">
              <span className="sr-only">today</span>
              <TimeText time={change.from} format={settings.timeFormat} className="time-numerals text-time-sm text-fg-muted" />
              <span aria-hidden="true" className="text-fg-muted">
                →
              </span>
              <span className="sr-only">tomorrow</span>
              <TimeText time={change.to} format={settings.timeFormat} className="time-numerals text-time-sm" />
            </span>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
