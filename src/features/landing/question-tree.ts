import { z } from "zod";

/**
 * Interview questions as a tree: a closed (yes/no) question can branch into different follow-up
 * questions for an affirmative or a negative answer, and Emily follows only the branch that
 * matches what the participant meant. Questions saved before branches existed are plain lists.
 * Only yes/no branches for now; `branches` is an object so other conditions can be added later.
 */
export type QuestionKind = "abierta" | "cerrada";
export type Branch = "yes" | "no";

/**
 * What a (branch) question is after: what they have ("discover"), whether they'd want it
 * ("interest"), how they'd want it ("vision"), by when ("timeline"), or why not ("reason").
 */
export const PURPOSES = ["discover", "interest", "vision", "timeline", "reason"] as const;
export type Purpose = (typeof PURPOSES)[number];
export type Question = {
  /** Stable id: answers in the summary point to it. */
  id: string;
  text: string;
  /** "cerrada" = yes/no (the only kind that can branch); "abierta" = open. */
  kind: QuestionKind;
  purpose?: Purpose;
  branches?: { yes?: Question[]; no?: Question[] };
};

/** A main question plus at most 2 nested levels of branches. */
export const MAX_DEPTH = 3;
export const MAX_BRANCH = 6; // questions per branch
export const MAX_NODES = 40; // in the whole interview

const text = z.string().trim().min(3).max(300);

/** One level of the tree; at MAX_DEPTH a question can't branch any further. */
/** A question as it comes in (LLM, editor): ids are optional, normalizeQuestions fills them. */
export type QuestionInput = {
  id?: string;
  text: string;
  kind: QuestionKind;
  purpose?: Purpose;
  branches?: { yes?: QuestionInput[]; no?: QuestionInput[] };
};

function nodeSchema(depth: number): z.ZodType<QuestionInput> {
  const base = z.object({
    id: z.string().max(40).optional(),
    text,
    kind: z.enum(["abierta", "cerrada"]),
    purpose: z.enum(PURPOSES).optional(),
  });
  if (depth >= MAX_DEPTH)
    return base.extend({
      branches: z
        .undefined({ error: `Máximo ${MAX_DEPTH} niveles de preguntas.` })
        .optional(),
    });
  const list = z.array(z.lazy(() => nodeSchema(depth + 1))).max(MAX_BRANCH);
  return base
    .extend({ branches: z.object({ yes: list.optional(), no: list.optional() }).optional() })
    .refine((q) => !q.branches || q.kind === "cerrada", {
      error: "Solo una pregunta cerrada (sí/no) puede tener ramas.",
    });
}

/** One main question (with its branches), as the LLM or the editor sends it. */
export const questionNodeSchema = nodeSchema(1);

/** Validates a question tree from the LLM or the editor (depth, sizes, branches only on yes/no). */
export const questionTreeSchema = z
  .array(questionNodeSchema)
  .max(15)
  .refine((qs) => count(qs as Question[]) <= MAX_NODES, {
    error: `Máximo ${MAX_NODES} preguntas en total.`,
  });

/** All questions of a tree, depth-first, in the order Emily could ask them. */
export function flatten(
  qs: Question[],
  depth = 1,
  parent?: { id: string; branch: Branch },
): { q: Question; depth: number; parent?: { id: string; branch: Branch } }[] {
  return qs.flatMap((q) => [
    { q, depth, parent },
    ...flatten(q.branches?.yes ?? [], depth + 1, { id: q.id, branch: "yes" }),
    ...flatten(q.branches?.no ?? [], depth + 1, { id: q.id, branch: "no" }),
  ]);
}

export const count = (qs: Question[]) => flatten(qs).length;
export const find = (qs: Question[], id: string) => flatten(qs).find((n) => n.q.id === id)?.q;
export const hasBranches = (q?: Question) =>
  !!(q?.branches?.yes?.length || q?.branches?.no?.length);

/** Index of the main question a node belongs to (-1 if unknown). */
export function topIndex(qs: Question[], id: string) {
  return qs.findIndex((q) => q.id === id || flatten([q]).some((n) => n.q.id === id));
}

/** The list a node sits in (main questions or one branch) and the node that owns that list. */
function siblings(qs: Question[], id: string): { list: Question[]; owner?: Question } {
  if (qs.some((q) => q.id === id)) return { list: qs };
  for (const { q } of flatten(qs))
    for (const b of ["yes", "no"] as const)
      if (q.branches?.[b]?.some((s) => s.id === id)) return { list: q.branches[b]!, owner: q };
  return { list: [] };
}

/**
 * The questions still ahead in a node's own list (its next siblings), and what comes after that
 * whole list once it's done (back up the tree to the next question; undefined = the end).
 */
export function ahead(qs: Question[], id: string): { rest: Question[]; after?: Question } {
  const { list, owner } = siblings(qs, id);
  const rest = list.slice(list.findIndex((q) => q.id === id) + 1);
  return { rest, after: owner ? next(qs, owner.id) : undefined };
}

/** The question after `id` when its branch (if any) is skipped or done: depth-first order. */
export function next(qs: Question[], id: string): Question | undefined {
  const { rest, after } = ahead(qs, id);
  return rest[0] ?? after;
}

/** Where the interview goes after the participant answers `id` with `branch`. */
export function nextAfter(qs: Question[], id: string, branch?: Branch): Question | undefined {
  const q = find(qs, id);
  return (branch && q?.branches?.[branch]?.[0]) || next(qs, id);
}

/** Questions of the branch NOT taken at each decided yes/no (reported as "doesn't apply"). */
export function skipped(qs: Question[], taken: Record<string, Branch>): Set<string> {
  const out = new Set<string>();
  for (const { q } of flatten(qs)) {
    const b = taken[q.id];
    if (!b) continue;
    for (const n of flatten(q.branches?.[b === "yes" ? "no" : "yes"] ?? [])) out.add(n.q.id);
  }
  return out;
}

const newId = () => `q${Math.random().toString(36).slice(2, 8)}`;

/**
 * Accepts questions from any source (database, browser, LLM, older versions: plain strings or
 * {text, kind} without ids) and returns a valid tree: ids filled in and unique, sizes and depth
 * bounded, branches kept only on closed questions. Missing ids are derived from the position
 * (q1, q1y2, q1n1…), so a saved Emily gets the same ids on every read.
 */
export function normalizeQuestions(
  raw: unknown,
  kindOf: (text: string) => QuestionKind,
  depth = 1,
  path = "q",
  seen = new Set<string>(),
): Question[] {
  if (!Array.isArray(raw)) return [];
  const out: Question[] = [];
  for (const item of raw.slice(0, depth === 1 ? 15 : MAX_BRANCH)) {
    if (seen.size >= MAX_NODES) break;
    const o = (typeof item === "string" ? { text: item } : item) as Partial<Question> | null;
    const t = typeof o?.text === "string" ? o.text.trim().slice(0, 300) : "";
    if (!t) continue;
    const pos = `${path}${out.length + 1}`;
    let id = typeof o?.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : pos;
    if (seen.has(id)) id = seen.has(pos) ? newId() : pos;
    seen.add(id);
    // Plain strings get a guessed kind; an object with an unknown kind is treated as open.
    const kind: QuestionKind =
      typeof item === "string" ? kindOf(t) : o?.kind === "cerrada" ? "cerrada" : "abierta";
    const q: Question = { id, text: t, kind };
    if (PURPOSES.includes(o?.purpose as Purpose)) q.purpose = o!.purpose;
    if (kind === "cerrada" && depth < MAX_DEPTH && o?.branches && typeof o.branches === "object") {
      const yes = normalizeQuestions(o.branches.yes, kindOf, depth + 1, `${pos}y`, seen);
      const no = normalizeQuestions(o.branches.no, kindOf, depth + 1, `${pos}n`, seen);
      if (yes.length || no.length) q.branches = { ...(yes.length && { yes }), ...(no.length && { no }) };
    }
    out.push(q);
  }
  return out;
}

/** A fresh id for a question added in the editor. */
export const questionId = newId;

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9ñ]{4,}/g) ?? [];

/**
 * Which question Emily actually asked, from what she said: the one whose words appear most in it
 * (at least 60% of them). The model's own report can name a question it skipped, so the app
 * trusts what was heard. undefined = no clear match.
 */
export function matchAsked(qs: Question[], said: string): string | undefined {
  const heard = new Set(words(said));
  let best: { id: string; score: number } | undefined;
  for (const { q } of flatten(qs)) {
    const w = [...new Set(words(q.text))];
    if (!w.length) continue;
    const score = w.filter((x) => heard.has(x)).length / w.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { id: q.id, score };
  }
  return best?.id;
}

// ── Timelines: by when the participant wants something new or an improvement ─────────────────

export const TIMELINES = ["asap", "short", "long", "not_now", "unknown"] as const;
export type Timeline = (typeof TIMELINES)[number];

/** Most urgent first (the report's order, and Notion's "Urgencia"). */
export const URGENCY: Record<Timeline, number> = { asap: 0, short: 1, long: 2, not_now: 3, unknown: 4 };

/**
 * A spoken answer about "by when" → its timeline. Rough, local (no LLM): the summary model
 * classifies too; this fills in when it doesn't and keeps the categories honest.
 */
export function classifyTimeline(text: string): Timeline {
  const t = ` ${text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `;
  if (/\b(por ahora no|no lo necesito|no es prioridad|no es urgente para nada|not now|not a priority|don'?t need it)\b/.test(t))
    return "not_now";
  if (/\b(no se|no sabria|ni idea|no estoy segur|depende|don'?t know|not sure|no idea)\b/.test(t)) return "unknown";
  if (/\b(ya mismo|ya\b|lo antes posible|cuanto antes|lo mas pronto|urgente|para ayer|este mes|esta semana|asap|right away|as soon as possible|this (month|week)|urgent)/.test(t))
    return "asap";
  if (/\b(otro ano|proximo ano|ano que viene|seis meses|6 meses|unos meses|cuando tenga (plata|dinero|presupuesto)|mas adelante|algun dia|next year|six months|later on|someday|down the road|when i have (the )?money)\b/.test(t))
    return "long";
  if (/\b(un mes|uno o dos meses|dos meses|2 meses|tres meses|3 meses|antes de (diciembre|fin de ano|navidad)|pronto|semanas|next month|a month or two|couple of months|soon|in a few weeks|before (christmas|the end of the year))\b/.test(t))
    return "short";
  return "unknown";
}

/** They say they want something ("me gustaría…", "quiero…", "I'd love…"), not just a complaint. */
export const wishes = (text: string) =>
  /\b(me gustar[ií]a|quisiera|quiero|queremos|me encantar[ií]a|nos gustar[ií]a|necesito|necesitamos|ojal[aá]|i'?d (like|love)|i want|we want|i wish|would (like|love)|we need|i need)\b/i.test(
    text,
  );
