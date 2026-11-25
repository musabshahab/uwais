import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown inside the admin frame while a page is on its way. Every page also
 * has skeletons of its own shape around its data; this one covers the moment
 * before the page itself has arrived.
 */
export default function ConsoleLoading() {
  return (
    <div role="status" aria-label="Loading the page">
      <div className="mb-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-3 h-5 w-full max-w-md" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
