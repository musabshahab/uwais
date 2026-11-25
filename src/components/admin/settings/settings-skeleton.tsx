import { Skeleton } from "@/components/ui/skeleton";

/** One section of the form in outline: heading on the left, fields on the right. */
function SectionSkeleton({ fields }: { fields: number }) {
  return (
    <div className="grid gap-x-10 gap-y-5 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-3 h-5" />
        <Skeleton className="mt-2 h-5 w-2/3" />
      </div>
      <div className="flex max-w-form flex-col gap-5">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-11 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The outline of the settings form while the stored settings stream in. */
export function SettingsSkeleton() {
  return (
    <div role="status" aria-label="Loading the settings">
      <SectionSkeleton fields={6} />
      <SectionSkeleton fields={4} />
      <SectionSkeleton fields={4} />
      <SectionSkeleton fields={4} />
    </div>
  );
}
