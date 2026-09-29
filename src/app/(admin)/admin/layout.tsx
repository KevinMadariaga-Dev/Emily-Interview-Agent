import Link from "next/link";
import { logout } from "@/features/admin/actions";

/** Admin shell. Auth is enforced by src/proxy.ts and requireAdmin() in each page. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1">
      <aside className="border-border hidden w-56 shrink-0 border-r p-6 md:block">
        <Link href="/admin" className="text-lg font-semibold">
          Emily Admin
        </Link>
        <nav className="mt-8 flex flex-col gap-3 text-sm">
          <Link href="/admin">Sessions</Link>
          <Link href="/admin/templates">Templates & links</Link>
          <form action={logout}>
            <button className="text-muted">Sign out</button>
          </form>
        </nav>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
