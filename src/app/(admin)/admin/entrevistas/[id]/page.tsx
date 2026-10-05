import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/features/demo/emily-orb";
import { deliveryLabel, sessionDetail, statusLabel, transcript } from "@/features/demo/mock";

export const metadata: Metadata = { title: "Entrevista", robots: { index: false, follow: false } };

const severity: Record<string, string> = {
  Alta: "bg-red-500/15 text-red-700 dark:text-red-400",
  Media: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Baja: "bg-stone-500/15 text-muted",
};

/** Demo session detail: LLM summary, insights, per-question answers, transcript, delivery. */
export default async function SessionPage(props: PageProps<"/admin/entrevistas/[id]">) {
  const { id } = await props.params;
  // ponytail: every id shows the same mock session until the DB query is wired.
  const s = { ...sessionDetail, id };

  return (
    <div className="space-y-6">
      <Link href="/admin/entrevistas" className="text-muted text-sm hover:underline">
        ← Entrevistas
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{s.participant}</h1>
          <p className="text-muted text-sm">
            {s.emily} · {s.startedAt} · {s.durationMin} min · {s.locale.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusLabel[s.status].className}>{statusLabel[s.status].label}</Badge>
          <Badge className="bg-green-500/15 text-green-700 dark:text-green-400">
            Sentimiento: {s.sentiment}
          </Badge>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 font-semibold">Resumen</h2>
            <p className="text-sm leading-relaxed">{s.summary}</p>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Pain points</h2>
            <ul className="space-y-2">
              {s.painPoints.map((p) => (
                <li key={p.text} className="flex items-start justify-between gap-3 text-sm">
                  {p.text}
                  <Badge className={severity[p.severity]}>{p.severity}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Respuestas por pregunta</h2>
            <dl className="space-y-4">
              {s.answers.map((a, i) => (
                <div key={a.q}>
                  <dt className="text-muted text-sm">
                    {i + 1}. {a.q}
                  </dt>
                  <dd className="mt-1 text-sm">{a.a}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Transcripción</h2>
            <ol className="space-y-3 text-sm">
              {transcript.map((t, i) => (
                <li key={i} className="grid grid-cols-[3rem_1fr] gap-2">
                  <span className="text-muted font-mono text-xs">{t.at}</span>
                  <p>
                    <strong className={t.role === "agent" ? "text-accent" : ""}>
                      {t.role === "agent" ? "Emily" : s.participant}:
                    </strong>{" "}
                    {t.text}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">Insights</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {s.insights.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Citas destacadas</h2>
            <div className="space-y-3">
              {s.quotes.map((q) => (
                <blockquote key={q} className="border-accent border-l-2 pl-3 text-sm italic">
                  {q}
                </blockquote>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">Entrega</h2>
            {(
              [
                ["Email a carlos@neoera.com", s.email],
                ["Página en Notion", s.notion],
              ] as const
            ).map(([label, st]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                {label}
                <span className={deliveryLabel[st].className}>{deliveryLabel[st].label}</span>
              </div>
            ))}
            <Button variant="secondary" className="w-full">
              ↻ Reintentar envíos
            </Button>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-semibold">Acciones</h2>
            <Button variant="secondary" className="w-full">
              ⬇ Descargar transcripción
            </Button>
            <Button variant="secondary" className="w-full">
              ▶ Escuchar grabación
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
