import { PrayerName, TimeText } from "@/components/display";
import { PencilIcon, PlusIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { editorHrefForDate } from "@/lib/admin/coverage";
import { formatDateLong, type DayPrayerRow } from "@/lib/time";
import type { DateString, TimeFormat } from "@/lib/types";

/** Props of {@link TodayTimes}. */
export interface TodayTimesProps {
  /** Today on the mosque's wall clock. */
  today: DateString;
  /** The six rows of the day, as the public site shows them. */
  rows: readonly DayPrayerRow[];
  /** False when no times are stored for today. */
  stored: boolean;
  /** The note stored with the day, if any. */
  note: string | null;
  timeFormat: TimeFormat;
}

/** The congregation column of one row: one time, or every Jumu'ah on a Friday. */
function JamaatCell({ row, timeFormat }: { row: DayPrayerRow; timeFormat: TimeFormat }) {
  if (row.key === "sunrise") return <span className="sr-only">No congregation</span>;
  if (!row.isJumuah || row.jumuahTimes.length < 2) {
    return <TimeText time={row.jamaat} format={timeFormat} className="time-numerals text-time-sm font-semibold text-fg" />;
  }
  return (
    <span className="flex flex-col items-end gap-0.5">
      {row.jumuahTimes.map((slot) => (
        <span key={`${slot.label}-${slot.time}`} className="flex items-baseline gap-2">
          <span className="text-xs text-fg-muted">{slot.label}</span>
          <TimeText time={slot.time} format={timeFormat} className="time-numerals text-time-sm font-semibold text-fg" />
        </span>
      ))}
    </span>
  );
}

/**
 * Today's prayer times exactly as visitors see them, so a volunteer can
 * check them at a glance and correct them in one tap.
 */
export function TodayTimes({ today, rows, stored, note, timeFormat }: TodayTimesProps) {
  return (
    <Card as="section" aria-labelledby="today-title">
      <CardHeader>
        <div>
          <CardTitle id="today-title">Today&apos;s times</CardTitle>
          <CardDescription>{formatDateLong(today)}</CardDescription>
        </div>
      </CardHeader>
      <CardBody className="pt-3">
        {stored ? (
          <>
            <table className="w-full border-collapse text-base">
              <caption className="sr-only">Prayer times for {formatDateLong(today)}</caption>
              <thead>
                <tr className="text-sm text-fg-muted">
                  <th scope="col" className="py-2 text-left font-semibold">
                    Prayer
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Begins
                  </th>
                  <th scope="col" className="w-2/5 py-2 text-right font-semibold">
                    Jamaat
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <th scope="row" className="py-2.5 text-left font-semibold text-fg">
                      <PrayerName name={row.name} arabic={row.arabic} arabicClassName="text-fg-muted" />
                    </th>
                    <td className="py-2.5 text-right">
                      <TimeText time={row.begins} format={timeFormat} className="time-numerals text-time-sm text-fg-muted" />
                    </td>
                    <td className="py-2.5 text-right">
                      <JamaatCell row={row} timeFormat={timeFormat} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {note ? <p className="mt-3 rounded-md bg-surface-sunken px-3 py-2 text-sm text-fg">Note: {note}</p> : null}
          </>
        ) : (
          <p className="rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-base text-fg">
            <strong className="font-semibold text-danger-fg">No prayer times are stored for today.</strong> The website
            and the TV display have nothing to show until they are added.
          </p>
        )}
      </CardBody>
      <CardFooter>
        <Button
          href={editorHrefForDate(today)}
          variant="secondary"
          size="sm"
          iconStart={stored ? <PencilIcon /> : <PlusIcon />}
        >
          {stored ? "Correct today’s times" : "Add today’s times"}
        </Button>
      </CardFooter>
    </Card>
  );
}
