import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** A card-shaped placeholder of a given height. */
function CardSkeleton({ className }: { className: string }) {
  return (
    <div className={`rounded-lg border border-line bg-surface px-5 py-5 shadow-sm sm:px-6 ${className}`}>
      <Skeleton className="h-6 w-40" />
      <SkeletonText lines={3} className="mt-4" />
    </div>
  );
}

/** The outline of the overview while its data streams in: the same columns and roughly the same heights. */
export function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading the overview" className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <CardSkeleton className="min-h-72" />
          <CardSkeleton className="min-h-56" />
        </div>
        <div className="flex flex-col gap-6">
          <CardSkeleton className="min-h-96" />
          <CardSkeleton className="min-h-48" />
        </div>
      </div>
      <CardSkeleton className="min-h-96" />
    </div>
  );
}
