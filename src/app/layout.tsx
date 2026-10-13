import type { Metadata } from "next";
import { cookies } from "next/headers";
// Self-hosted fonts (no build-time call to Google Fonts → reproducible CI builds).
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { LANG_COOKIE, parseLang } from "@/features/landing/lang-cookie";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Emily — AI Interview Agent", template: "%s · Emily" },
  description:
    "Customer-discovery interviews by voice, through a shareable link. Structured insights in your inbox and Notion.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
