"use client";

import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/control";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/actions/auth";
import { INITIAL_LOGIN_STATE, LOGIN_FORM_FIELDS } from "@/lib/actions/types";

/** Props of {@link LoginForm}. */
export interface LoginFormProps {
  /** The admin page to open after signing in; already checked on the server. */
  next: string;
}

/**
 * The password form of the sign-in page.
 *
 * The password is held in state, so it stays in the box after a wrong
 * attempt and can be corrected rather than typed again. While sign-in is
 * paused after repeated failures the message says how long to wait; the form
 * stays usable, because only the server knows when the pause is over.
 */
export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_LOGIN_STATE);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const locked = state.retryAfterSeconds !== undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name={LOGIN_FORM_FIELDS.next} value={next} />

      {state.error ? (
        <Alert id={errorId} tone={locked ? "warning" : "danger"} title={locked ? "Signing in is paused" : "Not signed in"} announce>
          {state.error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>Admin password</Label>
        <div className="relative">
          <input
            id={inputId}
            name={LOGIN_FORM_FIELDS.password}
            type={visible ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // The page has one purpose, so the field is ready to type into.
            autoFocus
            required
            aria-invalid={state.error !== null && !locked ? true : undefined}
            aria-describedby={state.error ? errorId : undefined}
            className={controlClasses("py-2 pr-20")}
          />
          <button
            type="button"
            aria-pressed={visible}
            aria-controls={inputId}
            onClick={() => setVisible((value) => !value)}
            className="absolute inset-y-0 right-0 flex min-w-16 items-center justify-center rounded-md px-3 text-sm font-semibold text-brand-fg hover:underline"
          >
            {visible ? "Hide" : "Show"}
            <span className="sr-only"> password</span>
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" fullWidth loading={pending} loadingLabel="Signing in">
        Sign in
      </Button>
    </form>
  );
}
