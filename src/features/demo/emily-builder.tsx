"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "./emily-orb";
import { EmilyVoiceCreator } from "./emily-voice-creator";
import { EmilyWizard } from "./emily-wizard";
import { DOMAIN, emilys as initialEmilys, type Emily, type EmilyConfig } from "./mock";

// ponytail: list lives in client state; load from DB and revalidate after create/update when integrating.

type View =
  { kind: "list" } | { kind: "create" } | { kind: "create-form" } | { kind: "edit"; slug: string };

const activeBadge = (active: boolean) =>
  active ? "bg-green-500/15 text-green-700 dark:text-green-400" : "text-muted bg-stone-500/15";

/** "Nueva Emily": grid of Emilys, "+" opens the wizard, a card opens its detail/edit view. */
export function EmilyBuilder({ openSlug }: { openSlug?: string }) {
  const [list, setList] = useState<Emily[]>(initialEmilys);
  const [view, setView] = useState<View>(
    openSlug && initialEmilys.some((e) => e.slug === openSlug)
      ? { kind: "edit", slug: openSlug }
      : { kind: "list" },
  );
  const [highlight, setHighlight] = useState<string | null>(null);

  function create(c: EmilyConfig) {
    const fresh: Emily = {
      ...c,
      sessions: 0,
      completed: 0,
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setList((l) => [fresh, ...l.filter((x) => x.slug !== c.slug)]);
    setHighlight(c.slug);
    setView({ kind: "list" });
  }

  function update(oldSlug: string, patch: Partial<Emily>) {
    setList((l) => l.map((e) => (e.slug === oldSlug ? { ...e, ...patch } : e)));
    if (patch.slug && patch.slug !== oldSlug) setView({ kind: "edit", slug: patch.slug });
  }

  const back = (
    <button
      onClick={() => setView({ kind: "list" })}
      className="text-muted hover:text-foreground text-sm"
    >
      ← Mis Emilys
    </button>
  );

  if (view.kind === "create" || view.kind === "create-form")
    return (
      <div className="space-y-6">
        <header className="flex items-center gap-4">
          {back}
          <h1 className="text-2xl font-semibold">Nueva Emily</h1>
        </header>
        {view.kind === "create" ? (
          <EmilyVoiceCreator onSave={create} onUseForm={() => setView({ kind: "create-form" })} />
        ) : (
          <EmilyWizard onSave={create} />
        )}
      </div>
    );

  const editing = view.kind === "edit" ? list.find((e) => e.slug === view.slug) : undefined;
  if (editing)
    return (
      <div className="space-y-6">
        {back}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{editing.name}</h1>
              <Badge className={activeBadge(editing.active)}>
                {editing.active ? "Activa" : "Pausada"}
              </Badge>
            </div>
            <p className="text-muted mt-1 max-w-2xl text-sm">{editing.objective}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/demo/entrevista"
              target="_blank"
              className="border-border bg-card hover:bg-background rounded-lg border px-4 py-2 text-sm"
            >
              Probar ↗
            </Link>
            <button
              onClick={() => update(editing.slug, { active: !editing.active })}
              className="border-border bg-card hover:bg-background rounded-lg border px-4 py-2 text-sm"
            >
              {editing.active ? "⏸ Pausar" : "▶ Activar"}
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Entrevistas" value={editing.sessions} />
          <Stat
            label="Completadas"
            value={
              editing.sessions
                ? `${Math.round((editing.completed / editing.sessions) * 100)}%`
                : "—"
            }
          />
          <Stat label="Creada" value={editing.createdAt} />
          <Card className="p-5">
            <p className="text-muted text-sm">Link</p>
            <code className="mt-2 block truncate text-sm">
              {DOMAIN}/{editing.slug}
            </code>
            <Link
              href={`/admin/entrevistas?emily=${encodeURIComponent(editing.name)}`}
              className="text-accent mt-2 inline-block text-xs"
            >
              Ver sus entrevistas →
            </Link>
          </Card>
        </section>

        <EmilyWizard key={editing.slug} initial={editing} onSave={(c) => update(editing.slug, c)} />
      </div>
    );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Mis Emilys</h1>
        <p className="text-muted text-sm">
          Cada Emily es una entrevista con su propio objetivo y link. Entra en una para ver su
          detalle o ajustarla.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          onClick={() => setView({ kind: "create" })}
          className="border-accent/40 text-accent hover:bg-accent/5 group flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition"
        >
          <span className="bg-accent text-accent-foreground grid h-14 w-14 place-items-center rounded-full text-3xl transition group-hover:scale-110">
            +
          </span>
          <span className="font-medium">Crear nueva Emily</span>
        </button>

        {list.map((e) => (
          <button
            key={e.slug}
            onClick={() => setView({ kind: "edit", slug: e.slug })}
            className={`border-border bg-card hover:border-accent/50 group flex min-h-56 flex-col rounded-xl border p-5 text-left transition hover:shadow-md ${
              highlight === e.slug ? "ring-accent motion-safe:animate-reveal ring-2" : ""
            }`}
          >
            <span className="flex w-full items-start justify-between gap-2">
              <span className="bg-accent/15 text-accent grid h-10 w-10 place-items-center rounded-full font-semibold">
                E
              </span>
              <Badge className={activeBadge(e.active)}>
                {highlight === e.slug ? "Nueva" : e.active ? "Activa" : "Pausada"}
              </Badge>
            </span>
            <span className="mt-3 font-semibold">{e.name}</span>
            <span className="text-muted text-xs font-medium tracking-wide uppercase">Objetivo</span>
            <span className="mt-1 line-clamp-3 flex-1 text-sm">{e.objective}</span>
            <code className="bg-background mt-3 block w-full truncate rounded px-2 py-1 text-xs">
              {DOMAIN}/{e.slug}
            </code>
            <span className="text-muted mt-2 flex w-full justify-between text-xs">
              {e.questions.length} preguntas · {e.locale.toUpperCase()} · {e.sessions} entrevistas
              <span className="text-accent opacity-0 transition group-hover:opacity-100">
                Ver →
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-muted text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}
