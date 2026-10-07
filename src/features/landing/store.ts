"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { InterviewSummary } from "./ai";
import { normalizeDraft, type Draft } from "./config";

// ponytail: created Emilys and their results live in this browser's localStorage until the DB is
// wired (createTemplateWithLink + sessions). Links therefore open only on the creating device.

export type SavedEmily = {
  slug: string;
  draft: Draft;
  createdAt: string;
  /** Card text translated to the other UI language (display only: the Emily keeps her language). */
  translations?: Partial<Record<Draft["locale"], { project: string; objective: string }>>;
};
export type SavedResult = {
  slug: string;
  project: string;
  at: string;
  summary: InterviewSummary;
  turns: number;
  /** Language of the interview (older results: taken from their Emily). */
  locale: Draft["locale"];
  /** The summary translated to the other UI language, cached so it's translated once. */
  translations?: Partial<Record<Draft["locale"], InterviewSummary>>;
};

const LIST = "emily:list"; // slugs, newest first
const VERSION = "emily:version"; // bumped on every write → cheap change signal
const cfgKey = (slug: string) => `emily:config:${slug}`;
const resKey = (slug: string) => `emily:results:${slug}`;
const CHANGE = "emily:store";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(VERSION, String(Number(localStorage.getItem(VERSION) ?? 0) + 1));
    window.dispatchEvent(new Event(CHANGE)); // same tab; other tabs get the "storage" event
  } catch {
    /* storage blocked (private mode): the in-page flows still work */
  }
}

/** `base`, or `base-2`, `base-3`… if another Emily already uses it. */
export function uniqueSlug(base: string) {
  const taken = new Set(read<string[]>(LIST, []));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function saveEmily(slug: string, draft: Draft) {
  write(cfgKey(slug), { slug, draft, createdAt: new Date().toISOString() } satisfies SavedEmily);
  write(LIST, [slug, ...read<string[]>(LIST, []).filter((s) => s !== slug)]);
}

export function saveEmilyTranslation(
  slug: string,
  lang: Draft["locale"],
  text: { project: string; objective: string },
) {
  const saved = read<SavedEmily | null>(cfgKey(slug), null);
  if (!saved || !("draft" in saved)) return; // older bare-draft entries: shown untranslated
  write(cfgKey(slug), { ...saved, translations: { ...saved.translations, [lang]: text } });
}

export function loadEmily(slug: string): Draft | null {
  const saved = read<SavedEmily | Draft | null>(cfgKey(slug), null);
  if (!saved) return null;
  return normalizeDraft("draft" in saved ? saved.draft : saved); // older entries: bare draft
}

export function deleteEmily(slug: string) {
  try {
    localStorage.removeItem(cfgKey(slug));
    localStorage.removeItem(resKey(slug));
  } catch {}
  write(
    LIST,
    read<string[]>(LIST, []).filter((s) => s !== slug),
  );
}

export function saveResult(
  slug: string,
  project: string,
  summary: InterviewSummary,
  turns: number,
  locale: Draft["locale"],
) {
  const r: SavedResult = { slug, project, at: new Date().toISOString(), summary, turns, locale };
  write(resKey(slug), [r, ...read<SavedResult[]>(resKey(slug), [])].slice(0, 50));
}

export function saveResultTranslation(
  slug: string,
  at: string,
  lang: Draft["locale"],
  summary: InterviewSummary,
) {
  write(
    resKey(slug),
    read<SavedResult[]>(resKey(slug), []).map((r) =>
      r.at === at ? { ...r, translations: { ...r.translations, [lang]: summary } } : r,
    ),
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Live list of saved Emilys and results (re-reads when anything is written, in any tab). */
export function useSavedEmilys() {
  const version = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(VERSION) ?? "0";
      } catch {
        return "0";
      }
    },
    () => "server",
  );
  return useMemo(() => {
    if (version === "server") return { ready: false, emilys: [], results: [] };
    const emilys = read<string[]>(LIST, [])
      .map((slug) => {
        const saved = read<SavedEmily | Draft | null>(cfgKey(slug), null);
        if (!saved) return null;
        return "draft" in saved
          ? { ...saved, draft: normalizeDraft(saved.draft) }
          : { slug, draft: normalizeDraft(saved), createdAt: "" };
      })
      .filter((e): e is SavedEmily => !!e);
    const results = emilys
      .flatMap((e) =>
        read<SavedResult[]>(resKey(e.slug), []).map((r) => ({
          ...r,
          locale: r.locale ?? e.draft.locale,
        })),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
    return { ready: true, emilys, results };
  }, [version]);
}
