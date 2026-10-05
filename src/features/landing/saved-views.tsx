"use client";

import Link from "next/link";
import { useState } from "react";
import { DOMAIN } from "@/features/demo/mock";
import { coverage, verdict, voices } from "./config";
import { ArrowRight, CheckIcon, CopyIcon, MicIcon, PlusIcon, SparkIcon, XIcon } from "./icons";
import { InterviewLive, SuccessReport } from "./interview-live";
import { deleteEmily, type SavedEmily, type SavedResult } from "./store";
import { primary, quiet, type Msg } from "./ui";
import type { OrbMode } from "./voice-orb";

const date = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })
    : "";
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });

/** "Mis Emilys": every Emily created in this browser, saved under its project name. */
export function EmilyList({
  emilys,
  results,
  onMode,
  onFeed,
  onCreate,
}: {
  emilys: SavedEmily[];
  results: SavedResult[];
  onMode: (m: OrbMode | null) => void;
  onFeed: (m: Msg[]) => void;
  onCreate: () => void;
}) {
  const [testing, setTesting] = useState<SavedEmily | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (testing)
    return (
      <InterviewLive
        draft={testing.draft}
        slug={testing.slug}
        onMode={onMode}
        onFeed={onFeed}
        onExit={() => {
          onMode(null);
          onFeed([]);
          setTesting(null);
        }}
      />
    );

  if (!emilys.length)
    return (
      <div className="my-auto max-w-md space-y-4 py-16">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">Aún no creas ninguna Emily</h2>
        <p className="text-muted">
          Cada Emily que crees aparece aquí con el nombre de su proyecto, lista para probar o
          compartir.
        </p>
        <button className={primary} onClick={onCreate}>
          <PlusIcon className="h-4 w-4" /> Crear mi primera Emily
        </button>
      </div>
    );

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/e/${slug}`);
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">Mis Emilys</h2>
          <p className="text-muted text-sm">
            {emilys.length} {emilys.length === 1 ? "Emily creada" : "Emilys creadas"} en este
            navegador.
          </p>
        </div>
        <button className={primary} onClick={onCreate}>
          <PlusIcon className="h-4 w-4" /> Nueva Emily
        </button>
      </header>

      <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {emilys.map(({ slug, draft, createdAt }) => {
          const voice = voices.find((v) => v.id === draft.voice);
          const done = results.filter((r) => r.slug === slug).length;
          return (
            <li
              key={slug}
              className="border-border bg-card hover:border-accent/40 flex flex-col gap-4 rounded-2xl border p-5 transition-[border-color,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0"
            >
              <div className="space-y-1">
                <h3 className="text-lg font-semibold tracking-[-0.01em]">{draft.project}</h3>
                <p className="text-muted line-clamp-2 text-sm">{draft.objective}</p>
              </div>
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {[
                  `${draft.questions.length} preguntas`,
                  draft.locale === "es" ? "Español" : "English",
                  voice ? `Voz ${voice.name}` : "",
                  draft.recipientName || draft.company
                    ? `Para ${[draft.recipientName, draft.company].filter(Boolean).join(" · ")}`
                    : "Link abierto",
                  done ? `${done} ${done === 1 ? "entrevista" : "entrevistas"}` : "",
                  draft.reportEmail ? `Resultados a ${draft.reportEmail}` : "",
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <li
                      key={t}
                      className="bg-accent-soft/70 text-accent rounded-full px-2.5 py-1 font-medium"
                    >
                      {t}
                    </li>
                  ))}
              </ul>
              <p className="text-muted font-mono text-xs">
                {DOMAIN}/{slug} · {date(createdAt)}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  className={`${primary} px-4 py-2 text-sm`}
                  onClick={() => setTesting({ slug, draft, createdAt })}
                >
                  <MicIcon className="h-4 w-4" /> Probar
                </button>
                <Link href={`/e/${slug}`} target="_blank" className={`${quiet} px-4 py-2`}>
                  Abrir <ArrowRight className="h-4 w-4" />
                </Link>
                <button className={`${quiet} px-4 py-2`} onClick={() => void copy(slug)}>
                  {copied === slug ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                  {copied === slug ? "Copiado" : "Link"}
                </button>
                {confirming === slug ? (
                  <button
                    className={`${quiet} border-red-500/40 px-4 py-2 text-red-600 hover:border-red-500 hover:text-red-600 dark:text-red-400`}
                    onClick={() => {
                      deleteEmily(slug);
                      setConfirming(null);
                    }}
                    onBlur={() => setConfirming(null)}
                  >
                    ¿Eliminar? Confirmar
                  </button>
                ) : (
                  <button
                    className={`${quiet} px-3 py-2`}
                    aria-label={`Eliminar ${draft.project}`}
                    onClick={() => setConfirming(slug)}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Resultados": summaries of every interview completed with a saved Emily (newest first). */
export function ResultsList({
  results,
  onCreate,
}: {
  results: SavedResult[];
  onCreate: () => void;
}) {
  if (!results.length)
    return (
      <div className="my-auto max-w-md space-y-4 py-16">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">Sin entrevistas todavía</h2>
        <p className="text-muted">
          Cuando alguien complete una entrevista con una de tus Emilys (o la pruebes tú), el resumen
          aparece aquí.
        </p>
        <button className={quiet} onClick={onCreate}>
          Ir a Mis Emilys <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );

  return (
    <div className="space-y-6 py-8">
      <header className="space-y-1">
        <h2 className="text-3xl font-semibold tracking-[-0.03em]">Resultados</h2>
        <p className="text-muted text-sm">
          {results.length}{" "}
          {results.length === 1 ? "entrevista completada" : "entrevistas completadas"}.
        </p>
      </header>
      <ul className="space-y-4">
        {results.map((r) => (
          <li key={r.slug + r.at} className="border-border bg-card rounded-2xl border p-5">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-accent text-xs font-medium">
                    {r.project} · {dateTime(r.at)}
                  </p>
                  <p className="leading-relaxed">{r.summary.summary}</p>
                </div>
                {r.summary.objective && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                      {
                        ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                        mid: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                        low: "bg-red-500/15 text-red-700 dark:text-red-300",
                      }[verdict(coverage(r.summary.answers)).tone]
                    }`}
                  >
                    {coverage(r.summary.answers)}% · {verdict(coverage(r.summary.answers)).label}
                  </span>
                )}
                <span className="text-muted text-sm group-open:hidden">Ver detalle</span>
                <span className="text-muted hidden text-sm group-open:inline">Ocultar</span>
              </summary>
              <div className="mt-5">
                {r.summary.objective ? (
                  <SuccessReport summary={r.summary} />
                ) : (
                  <div className="grid gap-6 xl:grid-cols-2">
                    {r.summary.insights.length > 0 && (
                      <ul className="space-y-2">
                        {r.summary.insights.map((x) => (
                          <li key={x} className="flex gap-2 text-sm">
                            <SparkIcon className="text-accent mt-0.5 h-4 w-4 shrink-0" /> {x}
                          </li>
                        ))}
                      </ul>
                    )}
                    <dl className="divide-border divide-y">
                      {r.summary.answers.map((a) => (
                        <div key={a.question} className="space-y-1 py-3 first:pt-0">
                          <dt className="text-muted text-sm">{a.question}</dt>
                          <dd className="text-sm">{a.answer}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
