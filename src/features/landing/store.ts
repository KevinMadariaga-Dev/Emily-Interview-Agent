"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Draft, InterviewSummary } from "./config";
import {
  createEmily,
  deleteEmily as deleteEmilyAction,
  importBrowserEmilys as importAction,
  listSaved,
  saveEmilyTranslation as saveEmilyTranslationAction,
  saveInterviewResult,
  saveResultTranslation as saveResultTranslationAction,
} from "./emilys";

// Client cache of the Emilys and results stored in the database (see ./emilys server actions).

type Lang = Draft["locale"];

export type SavedEmily = {
  slug: string;
  draft: Draft;
  createdAt: string;
  /** Card text translated to the other UI language (display only: the Emily keeps her language). */
  translations?: Partial<Record<Lang, { project: string; objective: string }>>;
};
export type SavedResult = {
  id: string;
  slug: string;
  project: string;
  at: string;
  summary: InterviewSummary;
  turns: number;
  /** Language of the interview. */
  locale: Lang;
  /** The summary translated to the other UI language, cached so it's translated once. */
  translations?: Partial<Record<Lang, InterviewSummary>>;
};

type Saved = { ready: boolean; error: string; emilys: SavedEmily[]; results: SavedResult[] };
const EMPTY: Saved = { ready: false, error: "", emilys: [], results: [] };

let snapshot = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = (next: Saved) => {
  snapshot = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Re-reads Emilys and results from the database. */
export function reloadSaved() {
  loading = listSaved()
    .then((d) => emit({ ready: true, error: "", ...d }))
    .catch((err) =>
      emit({ ...snapshot, ready: true, error: err instanceof Error ? err.message : String(err) }),
    )
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Live list of saved Emilys and results (loaded on first use). */
export function useSavedEmilys() {
  const saved = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
  useEffect(() => {
    if (!snapshot.ready && !loading) void reloadSaved();
  }, []);
  return saved;
}

/** Saves a new Emily; the server picks a free slug from the project name and returns it. */
export async function saveEmily(draft: Draft) {
  const slug = await createEmily(draft);
  void reloadSaved();
  return slug;
}

export async function deleteEmily(slug: string) {
  emit({
    ...snapshot,
    emilys: snapshot.emilys.filter((e) => e.slug !== slug),
    results: snapshot.results.filter((r) => r.slug !== slug),
  });
  await deleteEmilyAction(slug).finally(reloadSaved);
}

export async function saveEmilyTranslation(
  slug: string,
  lang: Lang,
  text: { project: string; objective: string },
) {
  await saveEmilyTranslationAction(slug, lang, text);
  emit({
    ...snapshot,
    emilys: snapshot.emilys.map((e) =>
      e.slug === slug ? { ...e, translations: { ...e.translations, [lang]: text } } : e,
    ),
  });
}

export async function saveResultTranslation(id: string, lang: Lang, summary: InterviewSummary) {
  await saveResultTranslationAction(id, lang, summary);
  emit({
    ...snapshot,
    results: snapshot.results.map((r) =>
      r.id === id ? { ...r, translations: { ...r.translations, [lang]: summary } } : r,
    ),
  });
}

/** Stores a finished interview (also from the participant's public link). */
export async function saveResult(slug: string, summary: InterviewSummary, turns: number) {
  await saveInterviewResult(slug, summary, turns);
  if (snapshot.ready) void reloadSaved(); // admin views open: show it in "Resultados"
}

// ── Emilys saved in this browser before the database (one-time import) ────────────────────────

const LEGACY_LIST = "emily:list";
const IMPORTED = "emily:imported";
const legacyKey = (kind: "config" | "results", slug: string) => `emily:${kind}:${slug}`;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The pre-database Emilys of this browser, in the shape importBrowserEmilys expects. */
export function browserEmilys() {
  if (readLocal(IMPORTED, false)) return [];
  return readLocal<string[]>(LEGACY_LIST, []).flatMap((slug) => {
    const saved = readLocal<Record<string, unknown> | null>(legacyKey("config", slug), null);
    if (!saved) return [];
    const isWrapped = "draft" in saved; // older entries stored the bare draft
    return [
      {
        slug,
        draft: isWrapped ? saved.draft : saved,
        createdAt: isWrapped ? saved.createdAt : undefined,
        translations: isWrapped ? saved.translations : undefined,
        results: readLocal<unknown[]>(legacyKey("results", slug), []),
      },
    ];
  });
}

const subscribeStorage = (l: () => void) => {
  window.addEventListener("storage", l);
  return () => window.removeEventListener("storage", l);
};

/** How many pre-database Emilys this browser still has to import (0 on the server). */
export function useBrowserEmilyCount() {
  return useSyncExternalStore(
    subscribeStorage,
    () => browserEmilys().length,
    () => 0,
  );
}

/** Copies this browser's Emilys and results to the database (kept locally as a backup). */
export async function importBrowserEmilys() {
  const n = await importAction(browserEmilys());
  try {
    localStorage.setItem(IMPORTED, "true");
    window.dispatchEvent(new StorageEvent("storage"));
  } catch {}
  await reloadSaved();
  return n;
}
