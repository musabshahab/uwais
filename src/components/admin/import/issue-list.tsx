"use client";

import { useState } from "react";
import { InfoIcon, WarningIcon } from "@/components/brand/icons";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import type { ImportIssueCounts } from "@/lib/actions/types";
import { SEVERITY_TEXT, defaultIssueFilter, filterIssues, type IssueFilter } from "@/lib/admin/import-wizard";
import { plural } from "@/lib/admin/text";
import type { ImportIssue, IssueSeverity } from "@/lib/import/types";
import { ReviewSection } from "./review-section";

/** Issues of one kind shown before "Show more" is needed. */
const ISSUES_PER_STEP = 25;

const SEVERITIES: readonly IssueSeverity[] = ["error", "warning", "info"];

const SEVERITY_TONES: Record<IssueSeverity, { badge: BadgeTone; text: string; border: string }> = {
  error: { badge: "danger", text: "text-danger-fg", border: "border-danger-line" },
  warning: { badge: "warning", text: "text-warning-fg", border: "border-warning-line" },
  info: { badge: "info", text: "text-info-fg", border: "border-line" },
};

/** Props of {@link IssueList}. */
export interface IssueListProps {
  issues: readonly ImportIssue[];
  /** Counts before any truncation. */
  counts: ImportIssueCounts;
  /** True when the server returned only the most important issues. */
  truncated: boolean;
  /** Number of sheets in the file; sheets are named only when there are several. */
  sheetCount: number;
}

/** The issues of one severity: a heading that says what they mean, then the list. */
function SeverityGroup({ severity, issues, total, sheetCount }: { severity: IssueSeverity; issues: readonly ImportIssue[]; total: number; sheetCount: number }) {
  const [shown, setShown] = useState(ISSUES_PER_STEP);
  const tone = SEVERITY_TONES[severity];
  const text = SEVERITY_TEXT[severity];
  const Icon = severity === "info" ? InfoIcon : WarningIcon;
  const visible = issues.slice(0, shown);

  return (
    <div className={cn("rounded-lg border", tone.border)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3.5">
        <h3 className={cn("flex items-center gap-2 text-base font-semibold", tone.text)}>
          <Icon />
          {plural(total, text.one, text.many)}
        </h3>
        <p className="text-sm text-fg-muted">{text.meaning}</p>
      </div>
      <ul className="px-4 py-2">
        {visible.map((issue, index) => (
          <li key={`${issue.code}-${issue.sheet}-${issue.rowNumber}-${index}`} className="border-line py-2 text-base text-fg not-last:border-b">
            {sheetCount > 1 && issue.sheet !== null ? (
              <Badge tone="neutral" className="mr-2 align-middle">
                {issue.sheet}
              </Badge>
            ) : null}
            {issue.message}
          </li>
        ))}
      </ul>
      {issues.length > shown ? (
        <div className="px-4 pb-3.5">
          <Button variant="secondary" size="sm" onClick={() => setShown((count) => count + ISSUES_PER_STEP * 4)}>
            Show more ({issues.length - shown} left)
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Everything the importer noticed about the file, grouped by how much it
 * matters: errors (left out), warnings (imported, but check them) and notes
 * (how the file was read).
 */
export function IssueList({ issues, counts, truncated, sheetCount }: IssueListProps) {
  const [filter, setFilter] = useState<IssueFilter>(() => defaultIssueFilter(counts));
  const total = counts.error + counts.warning + counts.info;
  const kinds = SEVERITIES.filter((severity) => counts[severity] > 0);
  // A new preview can remove the kind that was being looked at.
  const active: IssueFilter = filter !== "all" && counts[filter] === 0 ? "all" : filter;

  if (total === 0) {
    return (
      <ReviewSection id="issues-title" title="Problems">
        <p className="text-base text-fg-muted">None. Every row of the file was read without a problem.</p>
      </ReviewSection>
    );
  }

  const options: Array<SegmentedOption<IssueFilter>> = [
    { value: "all", label: `All (${total})` },
    ...kinds.map((severity) => ({
      value: severity,
      label: `${severity === "error" ? "Errors" : severity === "warning" ? "Warnings" : "Notes"} (${counts[severity]})`,
    })),
  ];

  return (
    <ReviewSection
      id="issues-title"
      title="Problems"
      description="What was noticed while reading the file. Errors are left out of the import; warnings are imported but deserve a look."
      aside={
        kinds.length > 1 ? (
          <SegmentedControl name="issue-filter" label="Show" options={options} value={active} onChange={setFilter} />
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {kinds
          .filter((severity) => active === "all" || active === severity)
          .map((severity) => (
            <SeverityGroup
              key={severity}
              severity={severity}
              issues={filterIssues(issues, severity)}
              total={counts[severity]}
              sheetCount={sheetCount}
            />
          ))}
      </div>
      {truncated ? (
        <p className="mt-3 text-sm text-fg-muted">
          The file has more problems than can be listed: only the first {issues.length} are shown, errors before
          anything else. Correcting the file and uploading it again is likely to be quicker than reading them all.
        </p>
      ) : null}
    </ReviewSection>
  );
}
