import { Alert } from "@/components/ui/alert";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/spinner";
import type { ImportMappingOverrides, ImportPreviewData } from "@/lib/actions/types";
import { importVerdict, type ImportOptionsState } from "@/lib/admin/import-wizard";
import type { TimeFormat } from "@/lib/types";
import { ChangeSummary } from "./change-summary";
import { FileSummary } from "./file-summary";
import { ImportOptions, hasImportOptions } from "./import-options";
import { IssueList } from "./issue-list";
import { MappingEditor } from "./mapping-editor";
import { PreviewTable } from "./preview-table";
import { PublishBar } from "./publish-bar";

/** Props of {@link ReviewStep}. */
export interface ReviewStepProps {
  preview: ImportPreviewData;
  options: ImportOptionsState;
  timeFormat: TimeFormat;
  /** True while the preview is being worked out again after a change. */
  refreshing: boolean;
  /** Why the last re-run of the preview failed; the review on show is then the one before. */
  refreshError: string | null;
  acknowledged: boolean;
  publishing: boolean;
  publishError: string | null;
  onOptions: (patch: Partial<ImportOptionsState>) => void;
  onMapping: (overrides: ImportMappingOverrides) => void;
  onAcknowledge: (value: boolean) => void;
  onPublish: () => void;
  onChooseAnother: () => void;
}

/**
 * Step two: everything about the file before anything is saved. From the
 * top: what the file is, the verdict, the questions only the user can
 * answer, what would change, the problems, the column matching, the rows
 * themselves, and the Publish button.
 *
 * While a change is being worked out the sections stay where they are,
 * dimmed, so the page does not jump.
 */
export function ReviewStep({ preview, options, timeFormat, refreshing, refreshError, acknowledged, publishing, publishError, onOptions, onMapping, onAcknowledge, onPublish, onChooseAnother }: ReviewStepProps) {
  const verdict = importVerdict(preview);
  const sheetCount = preview.sheets.length;

  return (
    <div className="flex flex-col gap-6">
      <FileSummary preview={preview} onChooseAnother={onChooseAnother} busy={publishing} />

      <div role="status" className={cn("flex items-center gap-2 text-sm font-semibold text-fg-muted", !refreshing && "sr-only")}>
        {refreshing ? (
          <>
            <Spinner label={null} />
            Working the review out again
          </>
        ) : null}
      </div>
      {refreshError ? (
        <Alert tone="danger" title="The review could not be updated" announce>
          {refreshError} What you see below is from before your last change.
        </Alert>
      ) : null}

      <div aria-busy={refreshing} className={cn("flex flex-col gap-6 transition-opacity duration-base", refreshing && "opacity-60")}>
        <Alert tone={verdict.tone} title={verdict.title}>
          {verdict.detail}
        </Alert>

        {hasImportOptions(preview) ? <ImportOptions preview={preview} options={options} onChange={onOptions} /> : null}
        {preview.canCommit ? <ChangeSummary diff={preview.diff} timeFormat={timeFormat} /> : null}
        <IssueList
          issues={preview.issues}
          counts={preview.issueCounts}
          truncated={preview.issuesTruncated}
          sheetCount={sheetCount}
        />
        <MappingEditor preview={preview} overrides={options.mapping} onChange={onMapping} />
        {preview.rows.length > 0 ? <PreviewTable preview={preview} timeFormat={timeFormat} /> : null}
      </div>

      <PublishBar
        preview={preview}
        acknowledged={acknowledged}
        onAcknowledge={onAcknowledge}
        refreshing={refreshing}
        publishing={publishing}
        error={publishError}
        onPublish={onPublish}
      />
    </div>
  );
}
