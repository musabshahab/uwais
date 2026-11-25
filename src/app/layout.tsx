import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Masjid Uwais",
  description: "Prayer times and community updates",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
