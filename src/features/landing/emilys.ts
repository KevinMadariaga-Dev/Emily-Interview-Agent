"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/server/auth/admin";
import { emilyRepository } from "@/server/repositories/emily.repository";
import { translateDraft } from "./ai";
import {
  freeSlug,
  mixesLanguages,
  normalizeDraft,
  summarySchema,
  toSlug,
  transcriptSchema,
  type Draft,
  type InterviewSummary,
  type Transcript,
} from "./config";
import type { SavedEmily, SavedResult } from "./store";

// Emilys and their results, stored in Postgres (Supabase). Admin actions require the site
// password (requireAdmin); the participant's link only reads one Emily and adds its result.

const slugSchema = z.string().regex(/^[a-z0-9-]{1,90}$/);
const langSchema = z.enum(["es", "en"]);
const cardSchema = z.object({ project: z.string().max(160), objective: z.string().max(800) });

const toSaved = (row: Awaited<ReturnType<typeof emilyRepository.list>>[number]): SavedEmily => ({
  slug: row.slug,
  draft: normalizeDraft(row.draft),
  createdAt: row.createdAt.toISOString(),
  translations: row.translations,
});

/** "Mis Emilys" + "Resultados" (newest first). */
export async function listSaved(): Promise<{ emilys: SavedEmily[]; results: SavedResult[] }> {
  await requireAdmin();
  const [emilys, results] = await Promise.all([
    emilyRepository.list(),
    emilyRepository.listResults(),
  ]);
  return {
    emilys: emilys.map(toSaved),
    results: results.map((r) => ({
      id: r.id,
      slug: r.emilySlug,
      project: r.project,
      at: r.createdAt.toISOString(),
      summary: r.summary,
      turns: r.turns,
      locale: r.locale,
      translations: r.translations,
      transcript: r.transcript,
    })),
  };
}

/**
 * Emily speaks one language: if the goal/questions/areas were written (partly) in the other one,
 * they're translated before saving, so the spoken and on-screen text never mix languages.
 * Without AI (or if translation fails) the draft is saved as typed.
 */
async function inOneLanguage(draft: Draft): Promise<Draft> {
  if (!mixesLanguages(draft)) return draft;
  const tr = await translateDraft(draft, draft.locale).catch(() => null);
  return tr ? normalizeDraft({ ...draft, ...tr }) : draft;
}

/** Saves a new Emily under a free slug from its project name; returns the slug. */
export async function createEmily(rawDraft: Draft): Promise<string> {
  await requireAdmin();
  const draft = await inOneLanguage(normalizeDraft(rawDraft));
  const base = toSlug(draft.project) || "entrevista";
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = freeSlug(base, await emilyRepository.slugsLike(base));
    if (await emilyRepository.create({ slug, draft })) return slug;
  }
  throw new Error("No pude reservar el link de esta Emily, inténtalo de nuevo.");
}

export async function deleteEmily(slug: string) {
  await requireAdmin();
  await emilyRepository.remove(slugSchema.parse(slug));
}

export async function saveEmilyTranslation(
  slug: string,
  lang: Draft["locale"],
  text: { project: string; objective: string },
) {
  await requireAdmin();
  await emilyRepository.setTranslation(
    slugSchema.parse(slug),
    langSchema.parse(lang),
    cardSchema.parse(text),
  );
}

export async function saveResultTranslation(
  id: string,
  lang: Draft["locale"],
  summary: InterviewSummary,
) {
  await requireAdmin();
  await emilyRepository.setResultTranslation(
    z.uuid().parse(id),
    langSchema.parse(lang),
    summarySchema.parse(summary),
  );
}

/**
 * Public (the participant's link): stores the finished interview under its Emily. Project and
 * language come from the saved Emily, never from the browser.
 */
export async function saveInterviewResult(
  slug: string,
  summary: InterviewSummary,
  history: Transcript,
) {
  if (!rateLimit(`result:${clientIp(await headers())}`, 10, 10 * 60_000))
    throw new Error("Demasiadas solicitudes, espera un momento.");
  const emily = await emilyRepository.find(slugSchema.parse(slug));
  if (!emily) throw new Error("Esta Emily ya no existe.");
  const draft = normalizeDraft(emily.draft);
  const transcript = transcriptSchema.safeParse(history);
  if (!transcript.success) throw new Error("Conversación inválida.");
  await emilyRepository.addResult({
    emilySlug: emily.slug,
    project: draft.project,
    summary: summarySchema.parse(summary),
    transcript: transcript.data,
    turns: transcript.data.length,
    locale: draft.locale,
  });
}

const legacyResultSchema = z.object({
  at: z.string(),
  summary: summarySchema,
  turns: z.number().int().min(0).max(500),
  locale: langSchema.optional(),
});

const importSchema = z
  .array(
    z.object({
      slug: slugSchema,
      draft: z.unknown(),
      createdAt: z.string().optional(),
      translations: z.record(langSchema, cardSchema).optional(),
      results: z.array(z.unknown()).max(50).default([]),
    }),
  )
  .max(200);

/** One-time import of the Emilys saved in this browser before the database existed. */
export async function importBrowserEmilys(items: unknown): Promise<number> {
  await requireAdmin();
  let imported = 0;
  for (const item of importSchema.parse(items)) {
    const draft = normalizeDraft(item.draft);
    const date = (s?: string) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : new Date());
    const row = await emilyRepository.create({
      slug: item.slug,
      draft,
      translations: item.translations ?? {},
      createdAt: date(item.createdAt),
    });
    if (!row) continue; // already in the database
    imported++;
    for (const raw of item.results) {
      const parsed = legacyResultSchema.safeParse(raw);
      if (!parsed.success) continue; // very old result format: skipped, the Emily still imports
      const r = parsed.data;
      await emilyRepository.addResult({
        emilySlug: item.slug,
        project: draft.project,
        summary: r.summary,
        turns: r.turns,
        locale: r.locale ?? draft.locale,
        createdAt: date(r.at),
      });
    }
  }
  return imported;
}
