import { ChevronLeftIcon, ChevronRightIcon } from "@/components/brand/icons";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Select } from "@/components/ui/select";
import { adjacentMonths, listMonths, timetableHref, type MonthRange } from "@/lib/site/month";
import { formatMonthYear, type MonthString } from "@/lib/time";
import { SiteLink } from "../site-link";

const MONTH_FIELD_ID = "timetable-month";

const STEP = buttonClasses({ variant: "secondary" });

/**
 * A link one month back or forward. At the end of the range there is no
 * link; on a phone, where the two links share a row, its space is kept
 * (`holdSpace`) so that the other link stays on its side.
 */
function StepLink({
  month,
  direction,
  holdSpace,
}: {
  month: MonthString | null;
  direction: "previous" | "next";
  holdSpace: boolean;
}) {
  const previous = direction === "previous";
  if (month === null) {
    return holdSpace ? <span aria-hidden="true" className="flex-1 sm:hidden" /> : null;
  }
  return (
    <SiteLink href={timetableHref(month)} rel={previous ? "prev" : "next"} className={cn(STEP, "max-sm:flex-1", previous ? "pl-3" : "pr-3")}>
      {previous ? <ChevronLeftIcon /> : null}
      {/* A phone has room for one word; the month is still announced. */}
      <span aria-hidden="true" className="sm:hidden">
        {previous ? "Previous" : "Next"}
      </span>
      <span className="sr-only">{previous ? "Previous month: " : "Next month: "}</span>
      <span className="max-sm:sr-only">{formatMonthYear(month)}</span>
      {previous ? null : <ChevronRightIcon />}
    </SiteLink>
  );
}

/** Props of {@link MonthNav}. */
export interface MonthNavProps {
  /** The month on screen. */
  month: MonthString;
  /** The months that can be opened, from `navigableMonths`. */
  range: MonthRange;
  className?: string;
}

/**
 * Moves between months: a link to the month before and the month after, and
 * a list of every month that can be opened. Everything is a plain link or a
 * plain GET form, so it works without JavaScript and each month has an
 * address of its own (`/timetable?month=2026-11`). Not printed.
 */
export function MonthNav({ month, range, className }: MonthNavProps) {
  const { previous, next } = adjacentMonths(month, range);
  const months = listMonths(range, month);
  return (
    <nav aria-label="Months" className={cn("flex flex-wrap items-center gap-2 sm:gap-3 print:hidden", className)}>
      <StepLink month={previous} direction="previous" holdSpace={next !== null} />
      <form action="/timetable" method="get" className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
        <label htmlFor={MONTH_FIELD_ID} className="sr-only">
          Month
        </label>
        <Select id={MONTH_FIELD_ID} name="month" defaultValue={month} wrapperClassName="min-w-0 flex-1 sm:w-52 sm:flex-none">
          {months.map((option) => (
            <option key={option} value={option}>
              {formatMonthYear(option)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>
      <StepLink month={next} direction="next" holdSpace={previous !== null} />
    </nav>
  );
}
