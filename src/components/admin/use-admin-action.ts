"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ActionFailure, ActionResult } from "@/lib/actions/types";
import { UNREACHABLE_FAILURE, isSignedOut, loginHref } from "@/lib/admin/session";

/** Calls a Server Action and returns its result; see {@link useAdminAction}. */
export type RunAdminAction = <T extends object>(call: () => Promise<ActionResult<T>>) => Promise<ActionResult<T>>;

/**
 * Returns the function every admin screen calls its Server Actions through.
 * It adds the two things all of them need:
 *
 * - A call that never reaches the action (the connection dropped, the server
 *   refused the request) comes back as an ordinary failure with a plain
 *   message, instead of an exception.
 * - A result saying nobody is signed in any more sends the user to the
 *   sign-in page with the way back to this page. The page they were on stays
 *   alive in the background with everything they typed, so after signing in
 *   they can simply try again.
 */
export function useAdminAction(): RunAdminAction {
  const router = useRouter();
  return useCallback(
    async <T extends object>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
      let result: ActionResult<T>;
      try {
        result = await call();
      } catch {
        return UNREACHABLE_FAILURE;
      }
      if (isSignedOut(result)) {
        router.push(loginHref(window.location.pathname + window.location.search, { expired: true }));
      }
      return result;
    },
    [router],
  );
}

/** The message to show for a failed action, or null when it succeeded. */
export function failureMessage(result: { ok: true } | ActionFailure | null): string | null {
  if (result === null || result.ok) return null;
  return result.code === "unauthenticated"
    ? "You had been signed out, so nothing was changed. Once you have signed in again, press the button once more; what you entered is still here."
    : result.error;
}
