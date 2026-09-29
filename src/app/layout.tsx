import type { Metadata } from "next";
// Self-hosted fonts (no build-time call to Google Fonts → reproducible CI builds).
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Emily — AI Interview Agent", template: "%s · Emily" },
  description:
    "Customer-discovery interviews by voice, through a shareable link. Structured insights in your inbox and Notion.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
