import { Skeleton } from "@/components/ui/skeleton";

/** Shown for the moment before the sign-in page itself has arrived. */
export default function LoginLoading() {
  return (
    <div role="status" aria-label="Loading the sign-in page" className="flex min-h-dvh flex-col bg-canvas">
      <div className="bg-brand pt-12 pb-28" />
      <div className="mx-auto -mt-16 w-full max-w-form px-gutter">
        <div className="rounded-xl border border-line bg-surface-raised px-5 py-6 shadow-md sm:px-8 sm:py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-3 mb-6 h-5" />
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="mt-5 h-13 rounded-md" />
        </div>
      </div>
    </div>
  );
}
