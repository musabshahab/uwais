import { Skeleton } from "@/components/ui/skeleton";

/** The outline of the month editor while the month streams in: toolbar, summary line and grid. */
export function TimetableSkeleton() {
  return (
    <div role="status" aria-label="Loading the month">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Skeleton className="size-11 rounded-md" />
          <Skeleton className="h-11 w-52 rounded-md" />
          <Skeleton className="size-11 rounded-md" />
        </div>
        <Skeleton className="h-11 w-40 rounded-md" />
      </div>
      <Skeleton className="mb-4 h-7 w-72" />
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
