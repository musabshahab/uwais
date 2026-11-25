/**
 * Admin authentication. Import from `@/lib/auth` in server code (pages,
 * Server Actions, Route Handlers).
 *
 * This entry point is server-only because it includes the session module.
 * Code that also runs elsewhere imports the specific file instead:
 * `@/lib/auth/paths` from client components, and `./config`, `./token` and
 * `./paths` from the proxy.
 */

import "server-only";

export {
  MIN_ADMIN_PASSWORD_LENGTH,
  MIN_SESSION_SECRET_LENGTH,
  getAdminConfig,
  readAdminConfig,
  type AdminConfig,
  type AdminDisabled,
  type AdminDisabledReason,
  type AdminEnabled,
} from "./config";
export { MAX_PASSWORD_LENGTH, constantTimeEqual, verifyPassword } from "./password";
export {
  ADMIN_HOME_PATH,
  ADMIN_LOGIN_PATH,
  NEXT_PARAM,
  isLoginPath,
  safeAdminRedirect,
} from "./paths";
export {
  DEFAULT_RATE_LIMIT,
  UNKNOWN_CLIENT,
  clientKeyFromHeaders,
  createLoginRateLimiter,
  getLoginRateLimiter,
  type LoginRateLimiter,
  type RateLimitDecision,
  type RateLimitOptions,
} from "./rate-limit";
export {
  createSession,
  destroySession,
  getAdminStatus,
  getSession,
  isSecureRequest,
  requireAdmin,
  sessionCookieOptions,
  type AdminStatus,
  type Session,
  type SessionCookieOptions,
} from "./session";
export { signIn, type SignInResult } from "./sign-in";
export {
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
  type SessionKeys,
} from "./token";
