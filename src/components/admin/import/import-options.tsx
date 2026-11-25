import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { MAX_IMPORT_YEAR, MIN_IMPORT_YEAR, type ImportDateOrderOption, type ImportPreviewData } from "@/lib/actions/types";
import {
  isYearReady,
  needsYear,
  offersDateOrder,
  offersFillDown,
  type ImportOptionsState,
} from "@/lib/admin/import-wizard";
import { ReviewSection } from "./review-section";

const DATE_ORDER_OPTIONS: ReadonlyArray<{ value: ImportDateOrderOption; label: string }> = [
  { value: "auto", label: "Work it out" },
  { value: "dmy", label: "Day first (31/12)" },
  { value: "mdy", label: "Month first (12/31)" },
];

/** Props of {@link ImportOptions}. */
export interface ImportOptionsProps {
  preview: ImportPreviewData;
  options: ImportOptionsState;
  /** Changes one or more options; the preview is then run again. */
  onChange: (patch: Partial<ImportOptionsState>) => void;
}

/** Whether a preview has any question to put to the user. */
export function hasImportOptions(preview: ImportPreviewData): boolean {
  return needsYear(preview) || offersDateOrder(preview) || offersFillDown(preview);
}

/**
 * The questions only the user can answer about a file, each shown only when
 * the file raises it: which year its dates are in, whether 01/02 is the 1st
 * of February or the 2nd of January, and whether an empty jamaat cell means
 * "same as the row above".
 */
export function ImportOptions({ preview, options, onChange }: ImportOptionsProps) {
  const yearMissing = preview.issues.some((issue) => issue.code === "year-unknown");
  const yearError =
    options.year.trim() !== "" && !isYearReady(options.year)
      ? `Enter a year between ${MIN_IMPORT_YEAR} and ${MAX_IMPORT_YEAR}.`
      : yearMissing && options.year.trim() === ""
        ? "The dates in this file have no year. Enter the year the timetable is for."
        : null;

  return (
    <ReviewSection
      id="options-title"
      title="A few questions about this file"
      description="Change an answer and the review below is worked out again."
    >
      <div className="flex max-w-form flex-col gap-5">
        {needsYear(preview) ? (
          <FormField label="Year of the timetable" hint="Used for dates that are written without a year." error={yearError}>
            <Input
              value={options.year}
              onChange={(event) => onChange({ year: event.target.value })}
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              placeholder="2027"
              className="numerals max-w-32"
            />
          </FormField>
        ) : null}
        {offersDateOrder(preview) ? (
          <div>
            <SegmentedControl
              name="import-date-order"
              label="How dates are written"
              showLabel
              options={DATE_ORDER_OPTIONS}
              value={options.dateOrder}
              onChange={(dateOrder) => onChange({ dateOrder })}
            />
            <p className="mt-1.5 text-sm text-fg-muted">
              Matters for dates such as 01/02/2027, which could be 1 February or 2 January.
            </p>
          </div>
        ) : null}
        {offersFillDown(preview) ? (
          <Switch
            checked={options.fillDown}
            onChange={(event) => onChange({ fillDown: event.target.checked })}
            label="An empty jamaat cell means the same as the row above"
            description="For timetables that only write a jamaat time on the day it changes."
          />
        ) : null}
      </div>
    </ReviewSection>
  );
}
