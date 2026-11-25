"use server";

/**
 * Signing in and out of the admin area.
 */

import { RedirectType, redirect, unstable_rethrow } from "next/navigation";
import { ADMIN_LOGIN_PATH, safeAdminRedirect } from "@/lib/auth/paths";
import { destroySession } from "@/lib/auth/session";
import { signIn, type SignInResult } from "@/lib/auth/sign-in";
import { isFormData } from "./core/form";
import { LOGIN_SERVER_PROBLEM, loginFailureState } from "./core/login";
import { LOGIN_FORM_FIELDS, type LoginState } from "./types";

/**
 * Signs the admin in, for `useActionState(loginAction, INITIAL_LOGIN_STATE)`.
 *
 * `signIn()` applies the rate limit, checks the password and sets the session
 * cookie, in that order. On success the browser is sent to the page named in
 * the form's `next` field when that is a path inside the admin area, and to
 * the dashboard otherwise; the action then never returns. On failure it
 * returns a deliberately unspecific message, with `retryAfterSeconds` while
 * sign-in is locked after repeated failures.
 *
 * This is the one action that does not require a session: it creates it.
 *
 * @param _previous The form state before this attempt (unused).
 * @param formData  Fields `password` and, optionally, `next`.
 */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const form = isFormData(formData) ? formData : null;
  let outcome: SignInResult;
  try {
    outcome = await signIn(form?.get(LOGIN_FORM_FIELDS.password));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[action] login failed", error);
    return { error: LOGIN_SERVER_PROBLEM };
  }
  if (!outcome.ok) return loginFailureState(outcome);
  // Outside the try block: redirect() works by throwing. `replace` keeps the
  // sign-in form out of the history, so Back does not return to it.
  redirect(safeAdminRedirect(form?.get(LOGIN_FORM_FIELDS.next)), RedirectType.replace);
}

/**
 * Signs the admin out and shows the sign-in page. Usable directly as a form
 * action: `<form action={logoutAction}>`.
 *
 * No session check: removing the cookie needs no privilege, and an expired
 * session must be removable too.
 */
export async function logoutAction(): Promise<void> {
  try {
    await destroySession();
  } catch (error) {
    unstable_rethrow(error);
    // The visitor is sent on regardless; with the cookie still in place the
    // proxy returns them to the dashboard, which shows the sign-out did not happen.
    console.error("[action] logout failed", error);
  }
  redirect(ADMIN_LOGIN_PATH);
}
