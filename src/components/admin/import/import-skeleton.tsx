import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** The outline of the first step of the import while the page's data streams in. */
export function ImportSkeleton() {
  return (
    <div role="status" aria-label="Loading the import page">
      <Skeleton className="mb-6 h-7 w-72" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-line bg-surface px-5 py-5 sm:px-6">
            <Skeleton className="h-7 w-64" />
            <SkeletonText lines={5} className="mt-4" />
          </div>
          <div className="rounded-lg border border-line bg-surface px-5 py-5 sm:px-6">
            <Skeleton className="h-7 w-52" />
            <SkeletonText lines={2} className="mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
