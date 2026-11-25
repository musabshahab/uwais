"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/components/ui/cn";
import { Select } from "@/components/ui/select";
import type { ImportMappingOverrides, ImportPreviewData } from "@/lib/actions/types";
import {
  MAPPING_GROUPS,
  columnOptionLabel,
  editMapping,
  editableSheets,
  mappingGaps,
  mappingTargetLabel,
  mappingTargetName,
  mappingsAgree,
  setApplyToAll,
} from "@/lib/admin/import-wizard";
import { formatList, plural } from "@/lib/admin/text";
import { MAPPING_TARGETS, type MappingTarget, type SheetReport } from "@/lib/import/types";

/** Props of {@link MappingEditor}. */
export interface MappingEditorProps {
  preview: ImportPreviewData;
  /** The column choices sent with the preview on show, or null when the importer worked them out. */
  overrides: ImportMappingOverrides | null;
  /** Sends new column choices; the preview is then run again. */
  onChange: (overrides: ImportMappingOverrides) => void;
}

/** Value of the "Not in this file" option. */
const NO_COLUMN = "";

/** The columns the importer set aside or could not place, so nothing in the file goes unexplained. */
function LeftoverColumns({ sheet }: { sheet: SheetReport }) {
  if (sheet.ignoredColumns.length === 0 && sheet.unmappedColumns.length === 0) return null;
  return (
    <div className="mt-5 flex flex-col gap-1.5 text-sm text-fg-muted">
      {sheet.ignoredColumns.length > 0 ? (
        <p>
          <span className="font-semibold text-fg">Not needed: </span>
          {formatList(sheet.ignoredColumns.map((column) => `${column.label} (${column.reason})`))}.
        </p>
      ) : null}
      {sheet.unmappedColumns.length > 0 ? (
        <p>
          <span className="font-semibold text-fg">Not recognised, so not imported: </span>
          {formatList(sheet.unmappedColumns.map((column) => (column.label.trim() === "" ? `column ${column.letter}` : `${column.label} (column ${column.letter})`)))}
          . If one of them holds a time, choose it above.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shows which column of the file feeds each part of a day and lets the user
 * correct it: "Fajr jamaat comes from column C". Every choice starts from
 * what the importer worked out. Anything essential that is missing (the
 * date, or any time at all) is pointed out.
 */
export function MappingEditor({ preview, overrides, onChange }: MappingEditorProps) {
  const sheets = editableSheets(preview.sheets);
  const [chosenSheet, setChosenSheet] = useState<string | null>(null);
  const [applyChoice, setApplyChoice] = useState<boolean | null>(null);

  const sheet = sheets.find((candidate) => candidate.name === chosenSheet) ?? sheets[0];
  // A sheet can also fail for a reason the columns cannot fix (dates without a year); that is not a mapping problem.
  const needsHelp = sheets.some((candidate) => {
    const gaps = mappingGaps(preview.mapping[candidate.name] ?? candidate.mapping);
    return gaps.dateMissing || gaps.timesMissing;
  });
  const [open, setOpen] = useState(needsHelp);

  if (sheet === undefined) return null;

  const several = sheets.length > 1;
  // Month-per-sheet workbooks nearly always share their columns: correct one sheet, correct them all.
  const applyToAll = several && (applyChoice ?? mappingsAgree(preview.mapping));
  const mapping = preview.mapping[sheet.name] ?? sheet.mapping;
  const gaps = mappingGaps(mapping);
  const matched = MAPPING_TARGETS.filter((target) => mapping[target] !== null).length;

  const choose = (target: MappingTarget, value: string) =>
    onChange(
      editMapping(preview.mapping, overrides, {
        sheet: sheet.name,
        target,
        column: value === NO_COLUMN ? null : Number(value),
        applyToAll,
      }),
    );

  return (
    <section aria-labelledby="mapping-title" className="rounded-lg border border-line bg-surface shadow-sm">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg px-5 py-5 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <h2 id="mapping-title" className="text-xl text-fg">
              How the columns were matched
            </h2>
            <span className="mt-1 block max-w-prose text-base text-fg-muted">
              {needsHelp
                ? "Something essential could not be found. Choose the right columns below."
                : `${plural(matched, "column")} matched${several ? " on each sheet" : ""}. Open this only if a time has ended up in the wrong place.`}
            </span>
          </span>
          <span className="text-sm font-semibold text-brand-fg underline decoration-brand-line underline-offset-4">
            <span className="group-open:hidden">Show the columns</span>
            <span className="hidden group-open:inline">Hide the columns</span>
          </span>
        </summary>

        <div className="border-t border-line px-5 py-5 sm:px-6">
          {several ? (
            <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mapping-sheet" className="text-sm font-semibold text-fg">
                  Sheet
                </label>
                <Select id="mapping-sheet" value={sheet.name} onChange={(event) => setChosenSheet(event.target.value)} wrapperClassName="w-64">
                  {sheets.map((candidate) => (
                    <option key={candidate.name} value={candidate.name}>
                      {candidate.name}
                      {candidate.status === "failed" ? " (could not be read)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <Checkbox
                checked={applyToAll}
                onChange={(event) => {
                  setApplyChoice(event.target.checked);
                  onChange(setApplyToAll(preview.mapping, sheet.name, event.target.checked));
                }}
                label="Use these columns for every sheet"
              />
            </div>
          ) : null}

          {gaps.dateMissing || gaps.timesMissing ? (
            <Alert tone="danger" className="mb-5" announce>
              {gaps.dateMissing ? "No column has been chosen for the date. " : null}
              {gaps.timesMissing ? "No column has been chosen for any prayer time. " : null}
              Without {gaps.dateMissing && gaps.timesMissing ? "them" : "it"} this sheet cannot be imported.
            </Alert>
          ) : null}

          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
            {MAPPING_GROUPS.map((group) => {
              const highlight = (group.id === "date" && gaps.dateMissing) || (group.id !== "date" && group.id !== "note" && group.id !== "jumuah" && gaps.timesMissing);
              return (
                <fieldset key={group.id} className={cn("min-w-0 rounded-md", highlight && "outline-2 outline-offset-8 outline-danger-line")}>
                  <legend className="text-base font-semibold text-fg">{group.title}</legend>
                  <div className="mt-2 flex flex-col gap-2.5">
                    {group.targets.map((target) => {
                      const id = `mapping-${target}`;
                      const value = mapping[target];
                      return (
                        <div key={target} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
                          <label htmlFor={id} className="text-sm text-fg-muted">
                            <span aria-hidden="true">{mappingTargetLabel(target)}</span>
                            <span className="sr-only">{mappingTargetName(target)} comes from</span>
                          </label>
                          <Select
                            id={id}
                            value={value === null ? NO_COLUMN : String(value)}
                            onChange={(event) => choose(target, event.target.value)}
                            className={cn("text-sm", value === null && "text-fg-muted")}
                          >
                            <option value={NO_COLUMN}>Not in this file</option>
                            {sheet.columns.map((column) => (
                              <option key={column.index} value={column.index}>
                                {columnOptionLabel(column)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>

          <LeftoverColumns sheet={sheet} />
        </div>
      </details>
    </section>
  );
}
