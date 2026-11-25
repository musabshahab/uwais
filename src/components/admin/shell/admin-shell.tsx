import { Suspense, type ReactNode } from "react";
import { LogoutIcon } from "@/components/brand/icons";
import { cn } from "@/components/ui/cn";
import { logoutAction } from "@/lib/actions/auth";
import { loadSettings } from "@/lib/server/data";
import { AdminHeader } from "./admin-header";
import { ADMIN_WIDTH, HEADER_ACTION } from "./styles";

/** Id of the main content, the target of the skip link. */
const MAIN_ID = "admin-main";

/** The mosque's name from the settings. Request-time: rendered inside `<Suspense>`. */
async function MosqueName() {
  const settings = await loadSettings();
  return <>{settings.mosqueName}</>;
}

/** Signs the admin out. A plain form, so it also works before the page's scripts have loaded. */
function SignOutForm() {
  return (
    <form action={logoutAction}>
      <button type="submit" className={cn(HEADER_ACTION, "max-lg:w-full")}>
        <LogoutIcon />
        Sign out
      </button>
    </form>
  );
}

/**
 * The frame of every signed-in admin page: skip link, header with the menu,
 * and the page.
 *
 * The frame is static and is prerendered once. The mosque's name is the only
 * part that needs data; it streams into a placeholder of its own size.
 * Whether somebody is signed in is not decided here: every page's data
 * component checks that itself before it renders anything private.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href={`#${MAIN_ID}`}
        // The visible state is spelled out under `focus-visible`, after the reset that undoes `sr-only`.
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:inline-flex focus-visible:min-h-control focus-visible:items-center focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:font-semibold focus-visible:text-on-primary focus-visible:shadow-md print:hidden"
      >
        Skip to the page content
      </a>
      <AdminHeader
        mosqueName={
          <Suspense
            fallback={<span aria-hidden="true" className="block h-5 w-36 animate-skeleton rounded-sm bg-brand-hover" />}
          >
            <MosqueName />
          </Suspense>
        }
        signOut={<SignOutForm />}
      />
      <main id={MAIN_ID} tabIndex={-1} className={cn(ADMIN_WIDTH, "flex-1 pt-8 pb-section focus:outline-none")}>
        {children}
      </main>
    </div>
  );
}
