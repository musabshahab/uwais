"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { commitImportAction, previewImportAction } from "@/lib/actions/import";
import type { ImportCommitData, ImportMappingOverrides, ImportPreviewData } from "@/lib/actions/types";
import {
  INITIAL_IMPORT_OPTIONS,
  buildImportFormData,
  checkSelectedFile,
  isYearReady,
  type ImportOptionsState,
} from "@/lib/admin/import-wizard";
import type { TimeFormat } from "@/lib/types";
import { failureMessage, useAdminAction } from "../use-admin-action";
import { useLeaveGuard } from "../use-leave-guard";
import { DoneStep } from "./done-step";
import { ReviewStep } from "./review-step";
import { UploadStep } from "./upload-step";
import { WizardSteps } from "./wizard-steps";

/** How long to wait after the last change to the options before the preview is run again. */
const REFRESH_DELAY_MS = 450;

/** Props of {@link ImportWizard}. */
export interface ImportWizardProps {
  /** Largest file the server accepts, in bytes. */
  maxFileBytes: number;
  timeFormat: TimeFormat;
  /** The years the stored timetable covers, for the download links on the first step. */
  years: readonly number[];
}

/**
 * The import wizard: upload, review, publish.
 *
 * The file never leaves this component's state between the steps, and the
 * review and the publish are sent the very same file with the very same
 * choices, so what is published is what was reviewed. Nothing is saved
 * before the Publish button is pressed, and it cannot be pressed twice.
 */
export function ImportWizard({ maxFileBytes, timeFormat, years }: ImportWizardProps) {
  const run = useAdminAction();
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ImportOptionsState>(INITIAL_IMPORT_OPTIONS);
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportCommitData | null>(null);
  const [previewing, startPreview] = useTransition();
  const [publishing, startPublish] = useTransition();
  /** True between a change to the options and the start of the preview it causes. */
  const [waiting, setWaiting] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Numbers the preview requests, so an answer that has been overtaken is dropped. */
  const latestRequest = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  useLeaveGuard(file !== null && done === null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const requestPreview = (target: File, withOptions: ImportOptionsState) => {
    const request = ++latestRequest.current;
    startPreview(async () => {
      const result = await run(() => previewImportAction(buildImportFormData(target, withOptions)));
      if (request !== latestRequest.current) return;
      setWaiting(false);
      if (result.ok) {
        setPreview(result);
        setUploadError(null);
        setRefreshError(null);
        // New findings need a new confirmation.
        setAcknowledged(false);
        setPublishError(null);
      } else if (preview === null) {
        setFile(null);
        setUploadError(failureMessage(result));
      } else {
        setRefreshError(failureMessage(result));
      }
    });
  };

  const chooseFile = (chosen: File) => {
    const problem = checkSelectedFile(chosen, maxFileBytes);
    if (problem !== null) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    setFile(chosen);
    setOptions(INITIAL_IMPORT_OPTIONS);
    requestPreview(chosen, INITIAL_IMPORT_OPTIONS);
  };

  const changeOptions = (patch: Partial<ImportOptionsState>) => {
    if (file === null) return;
    const next = { ...options, ...patch };
    setOptions(next);
    if (timer.current !== null) clearTimeout(timer.current);
    // Half a year ("20") is not worth sending; wait for the rest.
    if (!isYearReady(next.year)) return;
    setWaiting(true);
    timer.current = setTimeout(() => requestPreview(file, next), REFRESH_DELAY_MS);
  };

  const startAgain = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    latestRequest.current += 1;
    setFile(null);
    setOptions(INITIAL_IMPORT_OPTIONS);
    setPreview(null);
    setUploadError(null);
    setRefreshError(null);
    setAcknowledged(false);
    setPublishError(null);
    setWaiting(false);
    setDone(null);
  };

  const publish = () => {
    if (file === null || preview === null || publishing || previewing || waiting) return;
    startPublish(async () => {
      const result = await run(() => commitImportAction(buildImportFormData(file, options, acknowledged)));
      if (result.ok) {
        setDone(result);
        setPublishError(null);
        topRef.current?.scrollIntoView({ block: "start" });
      } else {
        setPublishError(failureMessage(result));
      }
    });
  };

  const refreshing = preview !== null && (previewing || waiting);

  return (
    <div ref={topRef} className="scroll-mt-6">
      <WizardSteps current={done !== null ? "publish" : preview === null ? "upload" : publishing ? "publish" : "review"} finished={done !== null} />
      {done !== null ? (
        <DoneStep result={done} onAnother={startAgain} />
      ) : preview === null || file === null ? (
        <UploadStep
          maxFileBytes={maxFileBytes}
          readingName={file !== null && previewing ? file.name : null}
          error={uploadError}
          years={years}
          onFile={chooseFile}
        />
      ) : (
        <ReviewStep
          preview={preview}
          options={options}
          timeFormat={timeFormat}
          refreshing={refreshing}
          refreshError={refreshError}
          acknowledged={acknowledged}
          publishing={publishing}
          publishError={publishError}
          onOptions={changeOptions}
          onMapping={(mapping: ImportMappingOverrides) => changeOptions({ mapping })}
          onAcknowledge={setAcknowledged}
          onPublish={publish}
          onChooseAnother={startAgain}
        />
      )}
    </div>
  );
}
