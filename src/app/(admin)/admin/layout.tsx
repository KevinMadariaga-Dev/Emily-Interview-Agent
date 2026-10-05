import Link from "next/link";
import { SidebarNav } from "@/features/admin/sidebar-nav";

/** Admin shell. No login for now (see src/proxy.ts). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-border bg-card flex flex-col gap-4 border-b p-4 md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0 md:p-6">
        <Link href="/" className="text-lg font-semibold">
          Emily <span className="text-accent">·</span> NEOera
        </Link>
        <SidebarNav />
      </aside>
      <main className="flex-1 px-4 py-8 md:px-10">{children}</main>
    </div>
  );
}
