import type { ReactNode } from "react";

/** Props of {@link ReviewSection}. */
export interface ReviewSectionProps {
  /** Id of the heading. */
  id: string;
  title: string;
  /** A sentence under the title. */
  description?: ReactNode;
  /** Sits beside the title: a count, a filter. */
  aside?: ReactNode;
  children: ReactNode;
}

/** One titled block of the review step. */
export function ReviewSection({ id, title, description, aside, children }: ReviewSectionProps) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 id={id} className="text-xl text-fg">
            {title}
          </h2>
          {description ? <p className="mt-1 max-w-prose text-base text-fg-muted">{description}</p> : null}
        </div>
        {/* A filter with several choices is wider than a phone: it scrolls sideways inside the block instead of widening the page. */}
        {aside ? <div className="max-w-full overflow-x-auto">{aside}</div> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}
