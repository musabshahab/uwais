"use client";

import { PrinterIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { NEEDS_SCRIPT } from "../no-script";

/** Props of {@link PrintButton}. */
export interface PrintButtonProps {
  className?: string;
}

/**
 * Opens the browser's print dialog for the month on screen. The page prints
 * as one A4 landscape sheet. Without JavaScript the button is not shown; the
 * browser's own Print command gives the same sheet.
 */
export function PrintButton({ className }: PrintButtonProps) {
  return (
    <Button {...NEEDS_SCRIPT} variant="secondary" iconStart={<PrinterIcon />} className={className} onClick={() => window.print()}>
      Print
    </Button>
  );
}
