import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell/admin-shell";

/**
 * The frame of the signed-in admin pages. It is synchronous and static: it
 * is prerendered once and stays on screen while moving between pages.
 */
export default function ConsoleLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
