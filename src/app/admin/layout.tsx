import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Every admin page is private: search engines are told to stay away, and the
 * browser tab says "Admin" so it is never mistaken for the public site.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The root of the admin area. It adds nothing visible: the sign-in page
 * stands alone, and the signed-in pages get their frame from the layout of
 * the `(console)` group.
 */
export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
