import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/features/demo/emily-orb";
import {
  deliveryLabel,
  emilys,
  sessions,
  statusLabel,
  type SessionStatus,
} from "@/features/demo/mock";

export const metadata: Metadata = { title: "Entrevistas" };

const input = "rounded-md border border-border bg-card px-3 py-2 text-sm";

/** All interviews with search + filters (plain GET form → works without JS). */
export default async function InterviewsPage(props: PageProps<"/admin/entrevistas">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : "";
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const emily = typeof sp.emily === "string" ? sp.emily : "";

  // ponytail: in-memory filter over mock rows; becomes a WHERE clause in the repository.
  const rows = sessions.filter(
    (s) =>
      (!q || s.participant.toLowerCase().includes(q)) &&
      (!estado || s.status === estado) &&
      (!emily || s.emily === emily),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Entrevistas</h1>
          <p className="text-muted text-sm">
            {rows.length} de {sessions.length} entrevistas
          </p>
        </div>
        <button className="border-border bg-card hover:bg-background rounded-lg border px-4 py-2 text-sm">
          ⬇ Exportar CSV
        </button>
      </header>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar participante…"
          aria-label="Buscar participante"
          className={`${input} min-w-48 flex-1`}
        />
        <select name="estado" defaultValue={estado} aria-label="Estado" className={input}>
          <option value="">Todos los estados</option>
          {(Object.keys(statusLabel) as SessionStatus[]).map((k) => (
            <option key={k} value={k}>
              {statusLabel[k].label}
            </option>
          ))}
        </select>
        <select name="emily" defaultValue={emily} aria-label="Emily" className={input}>
          <option value="">Todas las Emilys</option>
          {emilys.map((e) => (
            <option key={e.slug}>{e.name}</option>
          ))}
        </select>
        <button className="bg-accent text-accent-foreground rounded-md px-4 py-2 text-sm font-medium">
          Filtrar
        </button>
        {(q || estado || emily) && (
          <Link
            href="/admin/entrevistas"
            className="text-muted self-center text-sm hover:underline"
          >
            Limpiar
          </Link>
        )}
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-muted border-border border-b text-xs uppercase">
            <tr>
              {[
                "Participante",
                "Emily",
                "Estado",
                "Inicio",
                "Duración",
                "Sentimiento",
                "Email",
                "Notion",
              ].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-border hover:bg-background border-b last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/entrevistas/${s.id}`} className="font-medium hover:underline">
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
                <td className="text-muted px-4 py-3">{s.sentiment}</td>
                <td className={`px-4 py-3 ${deliveryLabel[s.email].className}`}>
                  {deliveryLabel[s.email].label}
                </td>
                <td className={`px-4 py-3 ${deliveryLabel[s.notion].className}`}>
                  {deliveryLabel[s.notion].label}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-muted px-4 py-10 text-center">
                  No hay entrevistas con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
