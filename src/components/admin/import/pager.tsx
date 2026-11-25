import { ChevronLeftIcon, ChevronRightIcon } from "@/components/brand/icons";
import { IconButton } from "@/components/ui/icon-button";
import { pageCount } from "@/lib/admin/import-wizard";

/** Props of {@link Pager}. */
export interface PagerProps {
  /** What is being paged through, plural: `rows`, `changed days`. */
  noun: string;
  /** The page on show, counted from 1. */
  page: number;
  /** Number of items in all. */
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}

/** Steps through a long list a page at a time. Renders nothing when everything fits on one page. */
export function Pager({ noun, page, total, pageSize, onPage }: PagerProps) {
  const pages = pageCount(total, pageSize);
  if (pages <= 1) return null;
  const current = Math.min(Math.max(1, page), pages);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(total, current * pageSize);
  return (
    <nav aria-label={`Pages of ${noun}`} className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="numerals text-sm text-fg-muted" aria-live="polite">
        {first} to {last} of {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        <IconButton label="Previous page" variant="secondary" size="sm" disabled={current === 1} onClick={() => onPage(current - 1)}>
          <ChevronLeftIcon />
        </IconButton>
        <span className="numerals text-sm text-fg">
          Page {current} of {pages}
        </span>
        <IconButton label="Next page" variant="secondary" size="sm" disabled={current === pages} onClick={() => onPage(current + 1)}>
          <ChevronRightIcon />
        </IconButton>
      </div>
    </nav>
  );
}
