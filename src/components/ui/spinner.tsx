import { cn } from "./cn";

/** Props of {@link Spinner}. */
export interface SpinnerProps {
  /** Diameter: pixels or any CSS length. Defaults to `1.25em`. */
  size?: number | string;
  /**
   * What is loading, announced to screen readers. Pass `null` when the
   * spinner only decorates something that already announces itself (a busy
   * button). Defaults to "Loading".
   */
  label?: string | null;
  className?: string;
}

/** An indeterminate progress ring in the current text colour. */
export function Spinner({ size = "1.25em", label = "Loading", className }: SpinnerProps) {
  const ring = (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      // The rotation is the only sign that work is in progress, so it keeps
      // turning (slowly) for people who prefer reduced motion.
      data-motion="essential"
      className="shrink-0 animate-spin motion-reduce:[animation-duration:1.8s]"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );

  if (label === null) {
    return <span className={cn("inline-flex", className)}>{ring}</span>;
  }

  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  );
}
