"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject, type SyntheticEvent } from "react";
import { CloseIcon } from "@/components/brand/icons";
import { cn } from "./cn";
import { IconButton } from "./icon-button";

/** Width of the dialog on screens wide enough to show it. */
export type DialogSize = "sm" | "md" | "lg";

const SIZES: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Chooses what to focus when the dialog opens.
 *
 * Left alone, the browser focuses the first focusable element, which is the
 * close button: a keyboard user would then have to tab past it every time,
 * and Enter would dismiss a form they came to fill in. The first control of
 * the body is where they want to be; a dialog with nothing but buttons starts
 * on the first footer button, which is the safe choice when the primary
 * action is placed last.
 */
function findInitialFocus(dialog: HTMLElement): HTMLElement | null {
  return (
    dialog.querySelector<HTMLElement>("[data-autofocus]") ??
    dialog.querySelector<HTMLElement>("[data-dialog-body]")?.querySelector<HTMLElement>(FOCUSABLE) ??
    dialog.querySelector<HTMLElement>("[data-dialog-footer]")?.querySelector<HTMLElement>(FOCUSABLE) ??
    null
  );
}

/** Props of {@link Dialog}. */
export interface DialogProps {
  /** Whether the dialog is showing. The parent owns this state. */
  open: boolean;
  /** Called when the user asks to close: Escape, the close button, or a click outside. */
  onClose: () => void;
  /** The heading; it also names the dialog for screen readers. */
  title: ReactNode;
  /** One or two sentences under the title. */
  description?: ReactNode;
  /** Buttons, right-aligned at the bottom. Put the primary action last. */
  footer?: ReactNode;
  /** Defaults to `md`. */
  size?: DialogSize;
  /**
   * Set to false for a step the user must answer (confirming a deletion that
   * is already in flight): Escape, the outside click and the close button
   * are then disabled, so provide your own way out in `footer`.
   */
  dismissible?: boolean;
  /**
   * Element to focus on opening. Without it focus goes to an element marked
   * `data-autofocus`, else the first control in the body, else the first
   * button in the footer.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children?: ReactNode;
}

/**
 * A modal dialog built on the native `<dialog>` element.
 *
 * The browser provides the hard parts: the rest of the page becomes inert,
 * Tab stays inside, Escape closes, and focus returns to the element that
 * opened it. The content is mounted only while the dialog is open, so a
 * form inside starts fresh every time.
 *
 * @example
 * <Dialog open={editing} onClose={() => setEditing(false)} title="Edit Friday 6 March"
 *   footer={<><Button variant="ghost" onClick={cancel}>Cancel</Button><Button type="submit" form="day">Save times</Button></>}>
 *   <form id="day">...</form>
 * </Dialog>
 */
export function Dialog({ open, onClose, title, description, footer, size = "md", dismissible = true, initialFocus, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      (initialFocus?.current ?? findInitialFocus(dialog))?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  // Escape. The parent's state stays the single source of truth, so the
  // native close is cancelled and requested through onClose instead.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (dismissible) onClose();
  };

  // The browser can still close the dialog on its own (a second Escape, a
  // form with method="dialog"); report it so `open` does not go stale.
  const handleNativeClose = () => {
    if (open) onClose();
  };

  // A click counts as "outside" only if it both started and ended on the
  // backdrop; otherwise dragging a text selection out of the dialog closes it.
  const handleMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    pressStartedOnBackdrop.current = event.target === event.currentTarget;
  };
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissible && pressStartedOnBackdrop.current && event.target === event.currentTarget) onClose();
    pressStartedOnBackdrop.current = false;
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-line bg-surface-raised p-0 text-fg shadow-lg backdrop:bg-scrim open:flex open:animate-dialog-in",
        SIZES[size],
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[calc(100dvh-2rem)] w-full flex-col">
          <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <IconButton label="Close" size="sm" className="-mt-1 -mr-2" onClick={onClose}>
                <CloseIcon />
              </IconButton>
            ) : null}
          </header>
          {children ? (
            <div data-dialog-body="" className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {children}
            </div>
          ) : (
            <div className="h-5" />
          )}
          {footer ? (
            <footer data-dialog-footer="" className="flex flex-wrap justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
