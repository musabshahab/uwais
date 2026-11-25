import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/shell/page-header";
import { TimetableEditor } from "@/components/admin/timetable/timetable-editor";
import { TimetableSkeleton } from "@/components/admin/timetable/timetable-skeleton";
import { monthChoices, monthRows, readEditParam, readMonthParam } from "@/lib/admin/month";
import { loadMosqueToday, requireAdminRequest } from "@/lib/admin/request";
import type { QueryValue } from "@/lib/admin/session";
import { loadMonth, loadSettings, loadTimetableRange } from "@/lib/server/data";
import { addDays, monthOf } from "@/lib/time";

export const metadata: Metadata = { title: "Timetable" };

/** What Next.js passes to the page: the query string, known only at request time. */
interface TimetablePageProps {
  searchParams: Promise<Record<string, QueryValue>>;
}

/**
 * The month the address asks for, or the current month on the mosque's
 * clock when it asks for none (or for something that is not a month).
 * Request-time: rendered inside `<Suspense>`.
 */
async function TimetableContent({ searchParams }: TimetablePageProps) {
  await requireAdminRequest();
  const [query, settings, mosqueToday] = await Promise.all([searchParams, loadSettings(), loadMosqueToday()]);
  const currentMonth = monthOf(mosqueToday);
  const data = (await loadMonth(readMonthParam(query.month) ?? currentMonth)) ?? (await loadMonth(currentMonth));
  if (data === null) throw new Error(`The month "${currentMonth}" could not be loaded.`);

  const { month, today, coverage } = data;
  const dayBefore = addDays(data.from, -1);
  const before = await loadTimetableRange(dayBefore, dayBefore);

  return (
    <TimetableEditor
      // Another month is another page of the editor: nothing open carries over.
      key={month}
      month={month}
      currentMonth={currentMonth}
      rows={monthRows(month, data.days, today)}
      dayBeforeMonth={before.days.find((day) => day.date === dayBefore) ?? null}
      monthChoices={monthChoices(coverage, currentMonth, month)}
      editDate={readEditParam(query.edit, month)}
      today={monthOf(today) === month ? today : null}
      timeFormat={settings.timeFormat}
      usualJumuah={settings.jumuah}
    />
  );
}

/**
 * The timetable editor, `/admin/timetable?month=YYYY-MM&edit=YYYY-MM-DD`.
 * The title is static; the month streams in.
 */
export default function TimetablePage({ searchParams }: TimetablePageProps) {
  return (
    <>
      <AdminPageHeader
        title="Timetable"
        description="Every stored day, a month at a time. Correct a single day here; to change many days at once, import a file."
      />
      <Suspense fallback={<TimetableSkeleton />}>
        <TimetableContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
