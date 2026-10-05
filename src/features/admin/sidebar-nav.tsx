"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Panel", icon: "▦" },
  { href: "/admin/nueva", label: "Nueva Emily", icon: "＋" },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙" },
  { href: "/admin/entrevistas", label: "Entrevistas", icon: "☰" },
];

/** Sidebar links with active state (needs the pathname → client component). */
export function SidebarNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
              active
                ? "bg-accent/10 text-accent font-medium"
                : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            <span aria-hidden className="w-4 text-center">
              {i.icon}
            </span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
