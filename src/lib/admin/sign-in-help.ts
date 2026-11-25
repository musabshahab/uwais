/**
 * What the sign-in page tells the person who runs the website when the admin
 * area is switched off. It names the setting to change and nothing else:
 * never a value, never anything else about the configuration.
 */

import type { AdminDisabledReason } from "@/lib/auth/config";

/** The explanation for one reason the admin area is switched off. */
export interface AdminDisabledHelp {
  title: string;
  /** What is wrong, in a sentence or two. */
  body: string;
  /** What to do about it, in order. */
  steps: string[];
}

const RESTART_STEP = "Restart or redeploy the website, then open this page again.";

/**
 * How to switch the admin area on.
 * @param reason            Why it is off.
 * @param minPasswordLength Shortest password the website accepts.
 * @param minSecretLength   Shortest session secret the website accepts.
 */
export function adminDisabledHelp(
  reason: AdminDisabledReason,
  minPasswordLength: number,
  minSecretLength: number,
): AdminDisabledHelp {
  switch (reason) {
    case "missing_password":
      return {
        title: "The admin area is not switched on yet",
        body: "Nobody can sign in until an admin password has been chosen for this website. It is set once, by whoever looks after the hosting.",
        steps: [
          "Open the hosting settings of the website and find its environment variables.",
          `Add one named ADMIN_PASSWORD and give it a password of at least ${minPasswordLength} characters.`,
          RESTART_STEP,
        ],
      };
    case "weak_password":
      return {
        title: "The admin password is too short",
        body: `The password set for this website has fewer than ${minPasswordLength} characters, so signing in is switched off to keep the timetable safe.`,
        steps: [
          `In the hosting settings, change ADMIN_PASSWORD to a password of at least ${minPasswordLength} characters.`,
          RESTART_STEP,
        ],
      };
    case "weak_session_secret":
      return {
        title: "The session secret is too short",
        body: `SESSION_SECRET is set for this website but has fewer than ${minSecretLength} characters, so signing in is switched off.`,
        steps: [
          `In the hosting settings, give SESSION_SECRET a value of at least ${minSecretLength} characters, or remove it altogether.`,
          RESTART_STEP,
        ],
      };
  }
}
