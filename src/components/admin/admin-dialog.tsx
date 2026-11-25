"use client";

import { useLayoutEffect, useRef } from "react";
import { Dialog, type DialogProps } from "@/components/ui/dialog";

/**
 * The dialog used throughout the admin area: the shared `Dialog`, made safe
 * for pages that are kept alive in the background.
 *
 * When the user leaves a page, Next.js hides it instead of removing it, so
 * that what they typed is still there when they come back. A modal dialog
 * that is left open inside a hidden page keeps the whole browser tab inert:
 * the next page can be seen but not clicked. This wrapper closes the native
 * dialog at the moment its page is hidden, without telling its owner, so the
 * owner's state still says "open" and the dialog reappears, with its
 * contents, when the page is shown again.
 */
export function AdminDialog({ onClose, ...rest }: DialogProps) {
  const holder = useRef<HTMLDivElement>(null);
  const closedForHiding = useRef(false);

  // Layout effects are cleaned up synchronously when the page is hidden.
  useLayoutEffect(() => {
    const node = holder.current;
    return () => {
      const dialog = node?.querySelector("dialog");
      if (dialog?.open) {
        closedForHiding.current = true;
        dialog.close();
      }
    };
  }, []);

  const handleClose = () => {
    // The close this wrapper caused is not the user's decision: swallow it.
    if (closedForHiding.current) {
      closedForHiding.current = false;
      return;
    }
    onClose();
  };

  return (
    <div ref={holder} className="contents">
      <Dialog onClose={handleClose} {...rest} />
    </div>
  );
}
