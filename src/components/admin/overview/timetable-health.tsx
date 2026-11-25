import type { ReactNode } from "react";
import { CalendarIcon, CheckIcon, UploadIcon, WarningIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { CoverageHealth } from "@/lib/admin/coverage";
import { timetableHref } from "@/lib/admin/month";
import { formatDateFull, plural } from "@/lib/admin/text";
import { monthOf } from "@/lib/time";
import type { DateString, TimetableCoverage } from "@/lib/types";

/** Props of {@link TimetableHealth}. */
export interface TimetableHealthProps {
  health: CoverageHealth;
  coverage: TimetableCoverage;
  today: DateString;
  /** Number of days without times between today and the end of the timetable, inside the look-ahead. */
  gapDays: number;
  /** Length of the look-ahead, in days. */
  lookaheadDays: number;
}

const TONE_BOX: Record<CoverageHealth["tone"], string> = {
  success: "border-line bg-surface",
  warning: "border-warning-line bg-warning-soft",
  danger: "border-danger-line bg-danger-soft",
};

const TONE_ACCENT: Record<CoverageHealth["tone"], string> = {
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
};

/** One fact about the timetable: a small label over a value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-fg">{children}</dd>
    </div>
  );
}

/**
 * The first thing on the overview: whether the stored timetable is in order.
 * It turns amber when the timetable ends within a month and red when it has
 * run out or there is none, and always says what to do about it.
 */
export function TimetableHealth({ health, coverage, today, gapDays, lookaheadDays }: TimetableHealthProps) {
  const { firstDate, lastDate } = coverage;
  const healthy = health.tone === "success";
  const Icon = healthy ? CheckIcon : WarningIcon;

  return (
    <section
      aria-labelledby="timetable-health-title"
      // An amber or red verdict is announced; a green one is simply there.
      role={healthy ? undefined : "alert"}
      className={cn("rounded-lg border shadow-sm", TONE_BOX[health.tone])}
    >
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex gap-3.5">
          <span
            aria-hidden="true"
            className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised", TONE_ACCENT[health.tone])}
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg-muted">Timetable</p>
            <h2 id="timetable-health-title" className={cn("text-2xl", healthy ? "text-fg" : TONE_ACCENT[health.tone])}>
              {health.headline}
            </h2>
            <p className="mt-1.5 max-w-prose text-base text-fg">{health.detail}</p>
          </div>
        </div>

        {firstDate !== null && lastDate !== null ? (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 border-t border-line pt-5 sm:grid-cols-3">
            <Fact label="First day">{formatDateFull(firstDate)}</Fact>
            <Fact label="Last day">{formatDateFull(lastDate)}</Fact>
            <Fact label="Days left after today">
              <span className="numerals">{health.daysRemaining ?? 0}</span>
            </Fact>
          </dl>
        ) : null}

        {healthy ? (
          <p className="flex items-start gap-2 text-base text-fg-muted">
            {gapDays === 0 ? (
              <>
                <CheckIcon className="mt-1 text-success-fg" />
                No days are missing in the next {lookaheadDays} days.
              </>
            ) : (
              <>
                <WarningIcon className="mt-1 text-warning-fg" />
                {plural(gapDays, "day")} in the next {lookaheadDays} days {gapDays === 1 ? "has" : "have"} no prayer times.
                See the list below.
              </>
            )}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button href="/admin/import" variant={healthy ? "secondary" : "primary"} iconStart={<UploadIcon />}>
            {health.level === "empty" || health.level === "not-started" ? "Import a timetable" : "Import the next timetable"}
          </Button>
          {health.level !== "empty" ? (
            <Button href={timetableHref(monthOf(today))} variant="secondary" iconStart={<CalendarIcon />}>
              View this month
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
