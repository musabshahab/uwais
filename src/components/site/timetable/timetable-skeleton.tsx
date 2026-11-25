import { Skeleton } from "@/components/ui/skeleton";
import { NOSCRIPT_FALLBACK } from "../no-script";
import {
  TIMETABLE_FRAME,
  TIMETABLE_HEADING,
  TIMETABLE_NAV,
  TIMETABLE_OVERLINE,
  TIMETABLE_SUBHEADING,
  TIMETABLE_TABLE,
} from "./timetable-layout";

/**
 * The monthly timetable page while its data loads: the heading, the month
 * navigation and the table as blocks of roughly their final size. Part of
 * the prerendered shell; hidden from assistive technology and not printed.
 */
export function TimetableSkeleton() {
  return (
    <div {...NOSCRIPT_FALLBACK} aria-hidden="true" className={`${TIMETABLE_FRAME} print:hidden`}>
      <div className={TIMETABLE_HEADING}>
        <span className={TIMETABLE_OVERLINE}>&nbsp;</span>
        <Skeleton className="my-[0.25em] h-[0.75em] w-56 max-w-full" />
      </div>
      <div className={TIMETABLE_SUBHEADING}>
        <Skeleton className="my-[0.275em] w-72 max-w-full" />
      </div>
      <div className={`${TIMETABLE_NAV} flex flex-wrap gap-2 sm:gap-3`}>
        <Skeleton className="h-control flex-1 sm:w-40 sm:flex-none" />
        <Skeleton className="order-last h-control w-full sm:order-none sm:w-72" />
        <Skeleton className="h-control flex-1 sm:w-40 sm:flex-none" />
      </div>
      <Skeleton className={`${TIMETABLE_TABLE} h-[min(80dvh,46rem)] rounded-lg lg:h-[78rem]`} />
    </div>
  );
}
