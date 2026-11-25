"use client";

import { AdminErrorNotice } from "@/components/admin/shell/admin-error";

/** The error boundary of the signed-in admin pages. It replaces the page only; the header and menu stay. */
export default function ConsoleError({ error, retry }: { error: unknown; retry: () => void }) {
  return <AdminErrorNotice error={error} retry={retry} />;
}
