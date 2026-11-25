/**
 * What is left of a refused save while the user works through it.
 */

import type { ActionFailure } from "@/lib/actions/types";
import { plural } from "./text";

/**
 * A refused save after the user has edited some of the fields it was refused
 * for. The message under a field describes the value that was sent, so it
 * goes as soon as that field is edited; the summary is reworded to count
 * what is left; and once nothing is left there is no failure to show.
 * A failure that was not about particular fields is returned as it is.
 *
 * @param edited Whether a field name, as it keys `fieldErrors`, has just been edited.
 */
export function afterEditing(failure: ActionFailure | null, edited: (field: string) => boolean): ActionFailure | null {
  if (failure === null || failure.fieldErrors === undefined) return failure;
  const all = Object.entries(failure.fieldErrors);
  const left = all.filter(([name]) => !edited(name));
  if (left.length === all.length) return failure;
  if (left.length === 0) return null;
  return {
    ...failure,
    error: `${plural(left.length, "more field")} still ${left.length === 1 ? "needs" : "need"} correcting.`,
    fieldErrors: Object.fromEntries(left),
  };
}
