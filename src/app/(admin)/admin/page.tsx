import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/features/demo/emily-orb";
import { DOMAIN, deliveryLabel, emilys, sessions, statusLabel } from "@/features/demo/mock";

export const metadata: Metadata = { title: "Panel", robots: { index: false, follow: false } };

/** Dashboard: KPIs, Emilys (interview links) and recent sessions. */
export default function AdminDashboard() {
  const total = emilys.reduce((n, e) => n + e.sessions, 0);
  const completed = emilys.reduce((n, e) => n + e.completed, 0);
  const stats = [
    { label: "Entrevistas", value: total },
    { label: "Completadas", value: `${Math.round((completed / total) * 100)}%` },
    { label: "Duración promedio", value: "13 min" },
    { label: "Emilys activas", value: emilys.filter((e) => e.active).length },
  ];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Panel</h1>
          <p className="text-muted text-sm">Tus entrevistas con Emily de un vistazo.</p>
        </div>
        <Link
          href="/admin/nueva"
          className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          + Nueva Emily
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-muted text-sm">{s.label}</p>
            <p className="mt-1 text-3xl font-semibold">{s.value}</p>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mis Emilys</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {emilys.map((e) => (
            <Card key={e.slug} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{e.name}</p>
                <Badge
                  className={
                    e.active
                      ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : "text-muted bg-stone-500/15"
                  }
                >
                  {e.active ? "Activa" : "Pausada"}
                </Badge>
              </div>
              <p className="text-muted line-clamp-2 text-sm">{e.objective}</p>
              <code className="bg-background block truncate rounded px-2 py-1 text-xs">
                {DOMAIN}/{e.slug}
              </code>
              <p className="text-muted text-xs">
                {e.questions.length} preguntas · {e.locale.toUpperCase()} · {e.completed}/
                {e.sessions} completadas
              </p>
              <div className="flex gap-3 text-sm">
                <Link href={`/admin/nueva?emily=${e.slug}`} className="text-accent">
                  Editar
                </Link>
                <Link href="/demo/entrevista" target="_blank" className="text-accent">
                  Probar ↗
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Entrevistas recientes</h2>
          <Link href="/admin/entrevistas" className="text-accent text-sm">
            Ver todas →
          </Link>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-muted border-border border-b text-xs uppercase">
              <tr>
                {["Participante", "Emily", "Estado", "Inicio", "Duración", "Email", "Notion"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-border hover:bg-background border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/entrevistas/${s.id}`}
                      className="font-medium hover:underline"
                    >
                      {s.participant}
                    </Link>
                  </td>
                  <td className="text-muted px-4 py-3">{s.emily}</td>
                  <td className="px-4 py-3">
                    <Badge className={statusLabel[s.status].className}>
                      {statusLabel[s.status].label}
                    </Badge>
                  </td>
                  <td className="text-muted px-4 py-3 whitespace-nowrap">{s.startedAt}</td>
                  <td className="text-muted px-4 py-3">{s.durationMin} min</td>
                  <td className={`px-4 py-3 ${deliveryLabel[s.email].className}`}>
                    {deliveryLabel[s.email].label}
                  </td>
                  <td className={`px-4 py-3 ${deliveryLabel[s.notion].className}`}>
                    {deliveryLabel[s.notion].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
