import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ImportPreviewData } from "@/lib/actions/types";
import { daysAffected } from "@/lib/admin/import-wizard";
import { formatList, plural } from "@/lib/admin/text";

/** Props of {@link PublishBar}. */
export interface PublishBarProps {
  preview: ImportPreviewData;
  /** Whether "I have checked these warnings" is ticked. */
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  /** True while the review is being worked out again after a change. */
  refreshing: boolean;
  /** True while the import is being saved. */
  publishing: boolean;
  /** Why the last attempt to publish did not go through. */
  error: string | null;
  onPublish: () => void;
}

/** What needs confirming, as a phrase: `1 error and 2 warnings`. */
function concerns(preview: ImportPreviewData): string {
  const parts: string[] = [];
  if (preview.issueCounts.error > 0) parts.push(plural(preview.issueCounts.error, "error"));
  if (preview.issueCounts.warning > 0) parts.push(plural(preview.issueCounts.warning, "warning"));
  return parts.length === 0 ? "rows or sheets that are left out" : formatList(parts);
}

/**
 * The last thing on the review step, always in view: what publishing will
 * do, the confirmation that warnings have been read when there are any, and
 * the one button that changes the timetable.
 */
export function PublishBar({ preview, acknowledged, onAcknowledge, refreshing, publishing, error, onPublish }: PublishBarProps) {
  const { diff, canCommit, requiresAcknowledgement } = preview;
  const blocked = !canCommit || (requiresAcknowledgement && !acknowledged) || refreshing;
  const affected = daysAffected(diff);

  return (
    <div className="sticky bottom-0 z-10 -mx-gutter border-t border-line bg-surface-raised px-gutter py-4 shadow-md">
      {error ? (
        <Alert tone="danger" title="Nothing was published" announce className="mb-3">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          {!canCommit ? (
            <p className="text-base font-semibold text-danger-fg">
              This file cannot be published yet. The top of this page says what is missing.
            </p>
          ) : (
            <>
              <p className="text-base font-semibold text-fg">
                {affected === 0
                  ? "Publishing changes nothing: every day is already stored like this."
                  : `Publishing adds ${plural(diff.added, "day")} and changes ${plural(diff.updated, "day")}.`}
              </p>
              {requiresAcknowledgement ? (
                <Checkbox
                  checked={acknowledged}
                  onChange={(event) => onAcknowledge(event.target.checked)}
                  disabled={publishing}
                  label="I have checked these warnings"
                  description={`This file has ${concerns(preview)}. Rows with errors are left out; everything else is published as shown.`}
                />
              ) : (
                <p className="text-sm text-fg-muted">
                  {affected === 0
                    ? "You can leave it there. Publishing anyway only adds this file to the list of recent imports."
                    : "The website and the TV display show the new times straight away."}
                </p>
              )}
            </>
          )}
        </div>
        <Button
          size="lg"
          // With nothing to change, publishing is no longer the thing to do next.
          variant={canCommit && affected === 0 ? "secondary" : "primary"}
          onClick={onPublish}
          disabled={blocked}
          loading={publishing}
          loadingLabel="Publishing"
          aria-describedby={refreshing ? "publish-refreshing" : undefined}
        >
          Publish timetable
        </Button>
      </div>
      {refreshing ? (
        <p id="publish-refreshing" className="mt-1 text-right text-sm text-fg-muted">
          Working the review out again. You can publish when it is ready.
        </p>
      ) : null}
    </div>
  );
}
