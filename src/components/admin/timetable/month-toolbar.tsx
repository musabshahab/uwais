"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { timetableHref } from "@/lib/admin/month";
import { addMonths, formatMonthYear, type MonthString } from "@/lib/time";

/** Props of {@link MonthToolbar}. */
export interface MonthToolbarProps {
  /** The month on show. */
  month: MonthString;
  /** The month today falls in, on the mosque's wall clock. */
  currentMonth: MonthString;
  /** The months offered in the list, ascending; `month` is among them. */
  choices: readonly MonthString[];
}

/**
 * Moves between months: one step either way, a list to jump further, and a
 * way back to the current month. Each is an ordinary navigation, so the
 * browser's Back button retraces them.
 */
export function MonthToolbar({ month, currentMonth, choices }: MonthToolbarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (target: MonthString) => startTransition(() => router.push(timetableHref(target)));

  return (
    <nav aria-label="Month" className="flex flex-wrap items-center gap-2 max-sm:w-full">
      <IconButton
        label={`Previous month, ${formatMonthYear(addMonths(month, -1))}`}
        variant="secondary"
        onClick={() => go(addMonths(month, -1))}
      >
        <ChevronLeftIcon />
      </IconButton>
      <label htmlFor="timetable-month" className="sr-only">
        Month on show
      </label>
      <Select
        id="timetable-month"
        value={month}
        onChange={(event) => go(event.target.value as MonthString)}
        wrapperClassName="min-w-0 max-sm:flex-1 sm:w-52"
        className="font-semibold"
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {formatMonthYear(choice)}
          </option>
        ))}
      </Select>
      <IconButton
        label={`Next month, ${formatMonthYear(addMonths(month, 1))}`}
        variant="secondary"
        onClick={() => go(addMonths(month, 1))}
      >
        <ChevronRightIcon />
      </IconButton>
      {month !== currentMonth ? (
        <Button variant="ghost" onClick={() => go(currentMonth)}>
          This month
        </Button>
      ) : null}
      {pending ? <Spinner label="Loading the month" className="text-fg-muted" /> : null}
    </nav>
  );
}
