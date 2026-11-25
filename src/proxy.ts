/**
 * Proxy for the admin area: sends signed-out visitors to the sign-in page
 * before any admin page starts rendering, and signed-in visitors away from
 * the sign-in page.
 *
 * This is a convenience, not the lock. It only looks at the session cookie
 * and only redirects page loads; every admin page, Server Action and loader
 * checks the session itself with `requireAdmin()`. Form posts are let through
 * for exactly that reason: the action behind them answers with a proper
 * redirect, which a proxy cannot do for a Server Action call.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAdminConfig } from "@/lib/auth/config";
import {
  ADMIN_HOME_PATH,
  ADMIN_LOGIN_PATH,
  NEXT_PARAM,
  isLoginPath,
  safeAdminRedirect,
} from "@/lib/auth/paths";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

/** True for requests that load a page; only those are redirected. */
function isPageLoad(request: NextRequest): boolean {
  return request.method === "GET" || request.method === "HEAD";
}

/** A redirect to `path` (which may carry a query string) on the same site. */
function redirectTo(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}

/** The sign-in page address that returns the visitor to the page they asked for. */
function loginPathFor(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  const target = safeAdminRedirect(pathname + search);
  if (target === ADMIN_HOME_PATH) return ADMIN_LOGIN_PATH;
  return `${ADMIN_LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(target)}`;
}

/**
 * Guards `/admin/**`.
 *
 * The token is verified here, not merely looked for. If presence alone
 * counted, a visitor with an expired cookie would bounce forever between the
 * sign-in page ("you have a cookie, go to the dashboard") and the dashboard
 * ("that cookie is no good, go and sign in"). A cookie that fails the check
 * is removed on the way.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const admin = getAdminConfig();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const signedIn = admin.enabled && (await verifySessionToken(token, admin)) !== null;
  const onLoginPage = isLoginPath(request.nextUrl.pathname);

  let response: NextResponse;
  if (!isPageLoad(request) || signedIn !== onLoginPage) {
    response = NextResponse.next();
  } else if (signedIn) {
    response = redirectTo(request, safeAdminRedirect(request.nextUrl.searchParams.get(NEXT_PARAM)));
  } else {
    response = redirectTo(request, loginPathFor(request));
  }

  if (token !== undefined && !signedIn) response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

/** The proxy runs for the admin area only; the public site and the API never pay for it. */
export const config = {
  matcher: ["/admin/:path*"],
};
