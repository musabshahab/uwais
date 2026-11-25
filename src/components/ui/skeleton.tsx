import { cn } from "./cn";

/** Props of {@link Skeleton}. */
export interface SkeletonProps {
  /** Size it with utilities, e.g. `h-6 w-24`. Defaults to one line of text, full width. */
  className?: string;
}

/**
 * A placeholder block shown while content loads. Shape it like the thing it
 * stands for, so the page does not jump when the content arrives. It is
 * hidden from assistive technology; announce loading once with a `Spinner`
 * or `Status` instead.
 */
export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden="true" className={cn("block h-[1em] w-full animate-skeleton rounded-sm bg-surface-sunken", className)} />;
}

/** Props of {@link SkeletonText}. */
export interface SkeletonTextProps {
  /** Number of lines. Defaults to 3. */
  lines?: number;
  className?: string;
}

/** A paragraph-shaped placeholder; the last line is shorter, like real text. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  const count = Math.max(1, Math.floor(lines));
  return (
    <span aria-hidden="true" className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={index === count - 1 && count > 1 ? "w-3/5" : undefined} />
      ))}
    </span>
  );
}
