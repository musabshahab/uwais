import type { ReactNode } from "react";
import { cn } from "./cn";

/** Props of {@link EmptyState}. */
export interface EmptyStateProps {
  /** An icon from the icon set. */
  icon?: ReactNode;
  /** What is missing, in plain words: "No timetable yet". */
  title: ReactNode;
  /** What to do about it. */
  description?: ReactNode;
  /** The action that fills the space, usually one primary button. */
  actions?: ReactNode;
  /** Heading level of the title. Defaults to `h2`. */
  headingLevel?: "h2" | "h3" | "h4";
  className?: string;
}

/**
 * Shown where a list or table would be when there is nothing in it yet.
 * An empty screen is an invitation to act: say what is missing and offer the
 * way to add it.
 */
export function EmptyState({ icon, title, description, actions, headingLevel: Heading = "h2", className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? (
        // The octagon echoes the eye of the mark.
        <span
          aria-hidden="true"
          className="mb-4 grid size-14 place-items-center bg-accent-soft text-accent-fg [clip-path:polygon(29.3%_0,70.7%_0,100%_29.3%,100%_70.7%,70.7%_100%,29.3%_100%,0_70.7%,0_29.3%)] [&>svg]:size-6"
        >
          {icon}
        </span>
      ) : null}
      <Heading className="font-display text-xl font-semibold tracking-tight text-fg">{title}</Heading>
      {description ? <p className="mt-1.5 max-w-prose text-base text-fg-muted">{description}</p> : null}
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
