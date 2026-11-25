import { Skeleton } from "@/components/ui/skeleton";

/** The outline of the announcements list while it streams in. */
export function AnnouncementsSkeleton() {
  return (
    <div role="status" aria-label="Loading the announcements">
      <div className="mb-5 flex items-center justify-between gap-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-11 w-48 rounded-md" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-lg border border-line bg-surface px-5 py-4 shadow-sm sm:px-6">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="mt-3 h-6 w-2/5" />
            <Skeleton className="mt-2 h-5 w-4/5" />
            <Skeleton className="mt-3 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
