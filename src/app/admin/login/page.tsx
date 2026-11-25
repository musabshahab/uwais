import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/admin/login/login-form";
import { TEXT_LINK } from "@/components/admin/shell/styles";
import { Lattice } from "@/components/brand/lattice";
import { LogoMark } from "@/components/brand/logo";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { readLoginQuery, type QueryValue } from "@/lib/admin/session";
import { adminDisabledHelp } from "@/lib/admin/sign-in-help";
import { MIN_ADMIN_PASSWORD_LENGTH, MIN_SESSION_SECRET_LENGTH, getAdminStatus } from "@/lib/auth";
import { loadSettings } from "@/lib/server/data";

export const metadata: Metadata = { title: "Sign in" };

/** What Next.js passes to the page: the query string, known only at request time. */
interface LoginPageProps {
  searchParams: Promise<Record<string, QueryValue>>;
}

/** The mosque's name under the heading. Request-time: rendered inside `<Suspense>`. */
async function MosqueName() {
  const settings = await loadSettings();
  return <>{settings.mosqueName}</>;
}

/**
 * The part of the page that depends on the request: the password form, or,
 * when the admin area is switched off, how to switch it on.
 */
async function LoginPanel({ searchParams }: LoginPageProps) {
  const [status, query] = await Promise.all([getAdminStatus(), searchParams]);
  const { next, expired } = readLoginQuery(query);

  if (!status.enabled) {
    const help = adminDisabledHelp(status.reason, MIN_ADMIN_PASSWORD_LENGTH, MIN_SESSION_SECRET_LENGTH);
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="warning" title={help.title}>
          {help.body}
        </Alert>
        <div>
          <h2 className="text-lg text-fg">How to switch it on</h2>
          <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-base text-fg-muted marker:font-semibold marker:text-fg">
            {help.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-fg-muted">The public website and the TV display keep working in the meantime.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {expired ? (
        <Alert tone="info" title="You were signed out">
          Sign in again to carry on. You will be taken back to the page you were on.
        </Alert>
      ) : null}
      <LoginForm next={next} />
    </div>
  );
}

/** The outline of the password form while the request-time part streams in. */
function LoginPanelSkeleton() {
  return (
    <div role="status" aria-label="Loading the sign-in form" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-11 rounded-md" />
      </div>
      <Skeleton className="h-13 rounded-md" />
    </div>
  );
}

/**
 * The sign-in page, `/admin/login?next=/admin/…`. The frame is static; the
 * form streams in because whether the admin area is switched on, and where
 * to go afterwards, are only known when the request arrives.
 */
export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="relative isolate overflow-hidden bg-brand pt-12 pb-28 text-on-brand">
        <Lattice className="absolute inset-0 -z-10" tone="accent" opacity={0.22} fade="down" />
        <div className="mx-auto flex w-full max-w-form flex-col items-center px-gutter text-center">
          <LogoMark size={56} tone="mono" />
          <p className="mt-4 min-h-7 font-display text-xl leading-tight font-semibold tracking-tight">
            <Suspense fallback={<span aria-hidden="true" className="mx-auto block h-6 w-44 animate-skeleton rounded-sm bg-brand-hover" />}>
              <MosqueName />
            </Suspense>
          </p>
        </div>
      </div>

      <main className="mx-auto -mt-16 w-full max-w-form flex-1 px-gutter pb-section">
        <div className="relative rounded-xl border border-line bg-surface-raised px-5 py-6 shadow-md sm:px-8 sm:py-8">
          <h1 className="text-2xl text-fg">Sign in to the admin area</h1>
          <p className="mt-1.5 mb-6 text-base text-fg-muted">
            For the volunteers who keep the prayer times, announcements and TV display up to date.
          </p>
          <Suspense fallback={<LoginPanelSkeleton />}>
            <LoginPanel searchParams={searchParams} />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-base">
          <Link href="/" className={TEXT_LINK}>
            Back to the website
          </Link>
        </p>
      </main>
    </div>
  );
}
