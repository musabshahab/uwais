"use client";

import { useRef, useState, type DragEvent } from "react";
import { UploadIcon } from "@/components/brand/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/spinner";
import { FILE_ACCEPT } from "@/lib/admin/import-wizard";
import { formatBytes } from "@/lib/admin/text";
import { FileGuidance } from "./file-guidance";

/** Props of {@link UploadStep}. */
export interface UploadStepProps {
  /** Largest file the server accepts, in bytes. */
  maxFileBytes: number;
  /** Name of the file being read, while its first preview is on the way. */
  readingName: string | null;
  /** Why the last file could not be used, if it could not. */
  error: string | null;
  /** The years the stored timetable covers, for the download links. */
  years: readonly number[];
  onFile: (file: File) => void;
}

/**
 * Step one: choosing the file. It can be dropped onto the page or picked
 * with the button; nothing is saved by uploading it.
 */
export function UploadStep({ maxFileBytes, readingName, error, years, onFile }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const reading = readingName !== null;

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined && !reading) onFile(file);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-80 flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-fast",
            dragging ? "border-primary bg-brand-soft" : "border-line-strong bg-surface",
          )}
        >
          {reading ? (
            <div role="status" className="flex flex-col items-center gap-3">
              <Spinner size={32} label={null} className="text-brand-fg" />
              <p className="text-lg font-semibold break-all text-fg">Reading {readingName}</p>
              <p className="text-base text-fg-muted">Nothing is saved yet. You will see every change first.</p>
            </div>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="mb-4 grid size-14 place-items-center bg-accent-soft text-accent-fg [clip-path:polygon(29.3%_0,70.7%_0,100%_29.3%,100%_70.7%,70.7%_100%,29.3%_100%,0_70.7%,0_29.3%)]"
              >
                <UploadIcon size={24} />
              </span>
              <h2 className="text-2xl text-fg">Choose your timetable file</h2>
              <p className="mt-2 max-w-prose text-base text-fg-muted">
                Drop it here, or pick it from your device. Uploading saves nothing: you will see exactly what would
                change before you publish.
              </p>
              <Button size="lg" className="mt-5" iconStart={<UploadIcon />} onClick={() => inputRef.current?.click()}>
                Choose a file
              </Button>
              <p className="mt-3 text-sm text-fg-muted">
                Excel (.xlsx) or CSV, up to {formatBytes(maxFileBytes)}. One file at a time.
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={FILE_ACCEPT}
            aria-label="Timetable file"
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clearing the field lets the same file be chosen again after it has been corrected.
              event.target.value = "";
              if (file !== undefined) onFile(file);
            }}
          />
        </div>
        {error ? (
          <Alert tone="danger" title="That file cannot be used" announce>
            {error}
          </Alert>
        ) : null}
      </div>
      <FileGuidance years={years} />
    </div>
  );
}
