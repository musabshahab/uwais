import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Props of {@link AdminPageHeader}. */
export interface AdminPageHeaderProps {
  /** The page's name: its only `h1`. */
  title: string;
  /** One or two sentences on what the page is for. */
  description?: ReactNode;
  /** Buttons that act on the whole page, shown beside the title. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The title block at the top of an admin page. It is static, so it is part
 * of the prerendered shell and appears at once while the page's data streams in.
 */
export function AdminPageHeader({ title, description, actions, className }: AdminPageHeaderProps) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        <h1 className="text-3xl text-fg">{title}</h1>
        {description ? <p className="mt-2 max-w-prose text-base text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
