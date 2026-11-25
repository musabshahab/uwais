"use client";

import { AdminErrorNotice } from "@/components/admin/shell/admin-error";

/**
 * The outer error boundary of the admin area: for the sign-in page and for a
 * failure of the admin frame itself. Nothing of the admin area is around it,
 * so the way out leads to the public site.
 */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center">
      <AdminErrorNotice error={error} retry={retry} homeHref="/" homeLabel="Go to the website" />
    </main>
  );
}
