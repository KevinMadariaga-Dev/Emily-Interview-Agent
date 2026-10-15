import { z } from "zod";
import {
  flatten,
  hasBranches,
  classifyTimeline,
  normalizeQuestions,
  questionNodeSchema,
  PURPOSES,
  skipped,
  TIMELINES,
  URGENCY,
  type Branch,
  type Timeline,
  type Question,
  type QuestionKind,
} from "./question-tree";

export type { Question, QuestionKind } from "./question-tree";

/**
 * Emily's voices: female only, each validated in Spanish with gpt-4o-mini-tts + fixed language
 * instructions (48/48 clips transcribed back as Spanish, fidelity ≥ 0.94). tts-1-hd was dropped:
 * it guesses the language per line and switched to English/garbled phonetics mid-interview.
 */
export const voices = [
  // Marin: OpenAI's most natural voice for realtime conversation — the default for new Emilys.
  { id: "marin", name: "Marin", desc: { es: "Natural y cercana", en: "Natural and warm" } },
  { id: "coral", name: "Coral", desc: { es: "Cálida y cercana", en: "Warm and friendly" } },
  { id: "nova", name: "Nova", desc: { es: "Enérgica y clara", en: "Energetic and clear" } },
  { id: "shimmer", name: "Shimmer", desc: { es: "Suave y tranquila", en: "Soft and calm" } },
  {
    id: "sage",
    name: "Sage",
    desc: { es: "Serena y profesional", en: "Composed and professional" },
  },
] as const;
export type VoiceId = (typeof voices)[number]["id"];
export const voiceIds = voices.map((v) => v.id) as [VoiceId, ...VoiceId[]];

/** The landing's "Configura Emily" form state. */
export type Draft = {
  recipientName: string;
  company: string;
  project: string;
  objective: string;
  questions: Question[];
  voice: VoiceId;
  /** Where the interview report is emailed when it finishes ("" = only saved in Resultados). */
  reportEmail: string;
  areas: string[];
  locale: "es" | "en";
  status: "active" | "paused";
  expires: string; // YYYY-MM-DD or ""
  noExpiry: boolean;
};

/** What voice mode / presets may change. Every field optional: only what was mentioned. */
export const patchSchema = z.object({
  recipientName: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  project: z.string().max(160).optional(),
  objective: z.string().max(800).optional(),
  // LLMs return {text, kind, branches?}; templates and older paths return plain strings.
  questions: z.array(z.union([z.string().min(3).max(300), questionNodeSchema])).max(15).optional(),
  voice: z.enum(voiceIds).optional(),
  reportEmail: z.email().max(200).optional(),
  areas: z.array(z.string().min(1).max(60)).max(10).optional(),
  locale: z.enum(["es", "en"]).optional(),
  status: z.enum(["active", "paused"]).optional(),
  expires: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  noExpiry: z.boolean().optional(),
});
export type Patch = z.infer<typeof patchSchema>;

export const presets = [
  {
    id: "negocio",
    label: "Cómo funciona un negocio",
    desc: "Procesos, clientes, ventas y herramientas de un negocio.",
    context: "¿Qué tipo de negocio?",
    placeholder: "Tienda de ropa",
    en: {
      label: "How a business works",
      desc: "Processes, customers, sales and tools of a business.",
      context: "What kind of business?",
      placeholder: "Clothing store",
    },
  },
  {
    id: "descubrimiento",
    label: "Descubrimiento de clientes",
    desc: "Problemas reales, hábitos y lo que ya intentaron.",
    context: "¿Qué problema o mercado?",
    placeholder: "Agendamiento en clínicas dentales",
    en: {
      label: "Customer discovery",
      desc: "Real problems, habits and what they've already tried.",
      context: "Which problem or market?",
      placeholder: "Scheduling at dental clinics",
    },
  },
  {
    id: "producto",
    label: "Validar un producto",
    desc: "Si una idea resuelve un dolor y cuánto pagarían.",
    context: "¿Qué producto o idea?",
    placeholder: "App de recordatorios por WhatsApp",
    en: {
      label: "Validate a product",
      desc: "Whether an idea solves a real pain and what they'd pay.",
      context: "Which product or idea?",
      placeholder: "WhatsApp reminders app",
    },
  },
  {
    id: "digital",
    label: "Madurez digital",
    desc: "Sitio web, inventario y preparación para vender online.",
    context: "¿Qué negocio?",
    placeholder: "Ferretería de barrio",
    en: {
      label: "Digital maturity",
      desc: "Website, inventory and readiness to sell online.",
      context: "Which business?",
      placeholder: "Neighborhood hardware store",
    },
  },
  {
    id: "satisfaccion",
    label: "Satisfacción de clientes",
    desc: "Experiencia, lo que valoran y qué mejorar.",
    context: "¿Qué producto o servicio?",
    placeholder: "Servicio de soporte técnico",
    en: {
      label: "Customer satisfaction",
      desc: "Experience, what they value and what to improve.",
      context: "Which product or service?",
      placeholder: "Tech support service",
    },
  },
] as const;
export type PresetId = (typeof presets)[number]["id"];

export type MissingField = "project" | "objective" | "questions";

/** Required before "Crear Emily" (keys; the UI words them in its language). */
export function missingFields(d: Draft): MissingField[] {
  const missing: MissingField[] = [];
  if (!d.project.trim()) missing.push("project");
  if (d.objective.trim().length < 10) missing.push("objective");
  if (!d.questions.some((q) => q.text.trim())) missing.push("questions");
  return missing;
}

// ── Local fallback (no OpenAI key): templated, context-substituted ───────────────────────────

const bank: Record<PresetId, { objective: string; questions: string[]; areas: string[] }> = {
  negocio: {
    objective: "Entender cómo funciona {c} por dentro: clientes, procesos, ventas y herramientas.",
    questions: [
      "Cuéntame sobre tu {c}: ¿desde cuándo existe y cuántas personas trabajan?",
      "¿Quién es tu cliente principal y cómo te encuentra?",
      "¿Cómo es un día normal de ventas, de principio a fin?",
      "¿Qué herramientas usas hoy para inventario, cobros y pedidos?",
      "¿Qué parte del proceso te quita más tiempo?",
      "¿Qué te gustaría mejorar en los próximos seis meses?",
    ],
    areas: ["Precios", "Proveedores", "Competencia", "Equipo"],
  },
  descubrimiento: {
    objective:
      "Descubrir cómo viven hoy el problema de {c}, qué han intentado y qué les costaría resolverlo.",
    questions: [
      "¿Cuándo fue la última vez que te enfrentaste a {c}? ¿Qué pasó?",
      "¿Cómo lo resuelves hoy?",
      "¿Qué has intentado antes y por qué no funcionó?",
      "¿Cuánto tiempo o dinero te cuesta esto al mes?",
      "Si pudieras cambiar una sola cosa, ¿cuál sería?",
    ],
    areas: ["Presupuesto", "Quién decide", "Urgencia"],
  },
  producto: {
    objective: "Validar si {c} resuelve un dolor real y qué haría falta para que lo usen y paguen.",
    questions: [
      "¿Cómo resuelves hoy lo que {c} promete resolver?",
      "¿Qué te parece la idea en una frase?",
      "¿En qué situación concreta la usarías?",
      "¿Qué te haría dudar antes de usarla?",
      "¿Cuánto estarías dispuesto a pagar por algo así?",
      "¿Qué le falta para que la uses desde mañana?",
    ],
    areas: ["Precio", "Alternativas", "Integraciones"],
  },
  digital: {
    objective: "Medir qué tan preparado está {c} para vender por internet y qué le frena.",
    questions: [
      "¿Tienen sitio web? ¿Quién lo administra?",
      "¿Usan algún sistema de inventario o lo llevan a mano?",
      "¿Han vendido alguna vez por internet o redes sociales?",
      "¿Qué tan cómodos se sienten usando herramientas digitales?",
      "¿Qué medios de pago aceptan hoy?",
      "¿Les interesaría implementar ventas por internet? ¿Qué les frena?",
    ],
    areas: ["Envíos", "Redes sociales", "Presupuesto"],
  },
  satisfaccion: {
    objective:
      "Entender la experiencia de los clientes con {c}: qué valoran y qué mejorar primero.",
    questions: [
      "¿Cómo ha sido tu experiencia con {c} hasta ahora?",
      "¿Qué es lo que más valoras?",
      "¿Hubo algún momento en que algo no salió como esperabas?",
      "¿Qué mejorarías primero?",
      "Del 0 al 10, ¿qué tan probable es que nos recomiendes? ¿Por qué?",
    ],
    areas: ["Soporte", "Precio", "Competencia"],
  },
};

export function presetFallback(id: PresetId, context: string): Patch {
  const c = context.trim() || "tu negocio";
  const fill = (s: string) => s.replaceAll("{c}", c);
  const preset = presets.find((p) => p.id === id)!;
  const b = bank[id];
  return {
    project: `${preset.label} · ${c.charAt(0).toUpperCase()}${c.slice(1)}`,
    objective: fill(b.objective),
    questions: b.questions.map(fill),
    areas: b.areas,
  };
}

// Closed = answerable with yes/no, a number, a frequency or a pick from options.
const CLOSED =
  /^¿?\s*(tienen|tiene|tienes|usan|usa|usas|han|ha|has|hay|es|son|está|están|cuánt[oa]s?|con qué frecuencia|del \d+ al \d+|prefieres|venden|vende|cuentan|do|does|did|is|are|have|has|how (many|much|often)|would you)\b/i;

/** Heuristic kind for questions that arrive without one (templates, manual edits). */
export const kindOf = (text: string): QuestionKind =>
  CLOSED.test(text.trim()) ? "cerrada" : "abierta";

/** Questions from any source (strings, {text, kind}, trees) → a valid tree with ids. */
export const toQuestions = (qs: unknown): Question[] => normalizeQuestions(qs, kindOf);

// ── Interview success ────────────────────────────────────────────────────────────────────────

/** "no_aplica": a question of the branch the participant's answer didn't lead to. */
export type AnswerStatus = "completa" | "parcial" | "sin_respuesta" | "no_aplica";

/**
 * % of the required information obtained: complete = 1, partial = ½, missing = 0. Questions that
 * don't apply (the other branch) don't count; sub-answers of a branch count like any question.
 */
export function coverage(
  top: { status: AnswerStatus; followUps?: { status: AnswerStatus }[] }[],
) {
  const answers = top.flatMap((a) => [a, ...(a.followUps ?? [])]).filter((a) => a.status !== "no_aplica");
  if (!answers.length) return 0;
  const points = answers.reduce(
    (n, a) => n + (a.status === "completa" ? 1 : a.status === "parcial" ? 0.5 : 0),
    0,
  );
  return Math.round((points / answers.length) * 100);
}

export function verdict(pct: number) {
  if (pct >= 80) return { label: "Éxito", tone: "ok" } as const;
  if (pct >= 50) return { label: "Parcial", tone: "mid" } as const;
  return { label: "Insuficiente", tone: "low" } as const;
}

/**
 * Accepts drafts saved by older versions (questions as plain strings, no voice…) and returns a
 * complete Draft. Used wherever a draft comes from storage or crosses the client/server line.
 */
/** A string field from untrusted input: anything else becomes "", long text is cut at `max`. */
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Accepts drafts from any source (browser, storage, older versions, the database) and returns a
 * well-typed Draft with bounded sizes: it's the trust boundary for every saved configuration.
 */
export function normalizeDraft(raw: unknown): Draft {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    recipientName: str(d.recipientName, 120),
    company: str(d.company, 120),
    project: str(d.project, 160),
    objective: str(d.objective, 800),
    questions: toQuestions(d.questions),
    // Any retired voice (male/neutral, or ones that failed validation) falls back to Marin.
    voice: voiceIds.includes(d.voice as VoiceId) ? (d.voice as VoiceId) : "marin",
    reportEmail: str(d.reportEmail, 254).trim(),
    areas: (Array.isArray(d.areas) ? d.areas : [])
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.slice(0, 60))
      .slice(0, 10),
    locale: d.locale === "en" ? "en" : "es",
    status: d.status === "paused" ? "paused" : "active",
    expires: str(d.expires, 10),
    noExpiry: d.noExpiry === true,
  };
}

// A summary is never rejected for being long (the model or the no-AI fallback can overshoot):
// texts and lists are cut to their limits instead, so an interview is always saved.
const text = (max: number) => z.string().transform((s) => s.slice(0, max));
const list = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).transform((a) => a.slice(0, max));

const answerSchema = z.object({
  questionId: text(40).optional(),
  question: text(400),
  answer: text(2000),
  status: z.enum(["completa", "parcial", "sin_respuesta", "no_aplica"]),
  // Optional labels: an unknown value (a model may translate or invent one) is dropped, never
  // a reason to reject the whole summary.
  /** A yes/no question with branches: the one taken ("n/a" = no yes/no decision). */
  branchTaken: z.enum(["yes", "no", "n/a"]).optional().catch(undefined),
  /** What the question was after (from the Emily's question). */
  purpose: z.enum(PURPOSES).optional().catch(undefined),
  /** By when they want it, when the answer is about wanting something new or an improvement. */
  timeline: z.enum(TIMELINES).optional().catch(undefined),
});

/** What ChatGPT returns at the end of an interview (also validates results saved in the DB). */
export const summarySchema = z.object({
  summary: text(1500),
  insights: list(text(300), 8),
  answers: list(
      answerSchema.extend({
        /** Path followed, in short words: "Tiene web → funciones → problemas". */
        route: text(300).optional(),
        /** When Emily had to interpret or clarify the answer to choose the branch. */
        ambiguityNote: text(400).optional(),
        /** Branch questions (both branches; the one not taken as "no_aplica"). */
        followUps: list(answerSchema, 40).optional(),
      }),
    20,
  ),
  objective: z.object({ met: z.boolean(), reason: text(400) }),
  // Relevant information extracted from the conversation (default [] keeps older saved results valid).
  keyFacts: list(text(300), 12).default([]),
  painPoints: list(text(300), 8).default([]),
  quotes: list(text(400), 6).default([]),
  nextSteps: list(text(300), 6).default([]),
  /** Everything they want to have or improve, with by when ("Oportunidades y plazos"). */
  opportunities: list(
      z.object({
        item: text(200),
        timeline: z.enum(TIMELINES).catch("unknown"),
        /** Their words on the timing ("para antes de diciembre"). */
        detail: text(200).optional(),
      }),
    10,
  ).default([]),
});
export type InterviewSummary = z.infer<typeof summarySchema>;

/**
 * Puts the summary's answers in the shape of the Emily's question tree: one answer per main
 * question (in order, with its id), and under a question with branches every branch question —
 * the ones of the branch the participant's answer didn't lead to marked "no_aplica" (never
 * "sin_respuesta"), the rest as the model graded them (or "sin_respuesta" if missing).
 */
export function settleBranches(
  questions: Question[],
  answers: InterviewSummary["answers"],
  locale: "es" | "en",
): InterviewSummary["answers"] {
  const all = answers.flatMap((a) => [a, ...(a.followUps ?? [])]);
  const byId = new Map(all.filter((a) => a.questionId).map((a) => [a.questionId!, a]));
  const taken: Record<string, Branch> = {};
  for (const a of all)
    if (a.questionId && (a.branchTaken === "yes" || a.branchTaken === "no"))
      taken[a.questionId] = a.branchTaken;
  const out = skipped(questions, taken);
  const none = locale === "es" ? "Sin respuesta" : "No answer";
  const na = locale === "es" ? "No aplica" : "Doesn't apply";
  return questions.map((q, i) => {
    const main = byId.get(q.id) ?? answers[i] ?? { question: q.text, answer: none, status: "sin_respuesta" as const };
    if (!hasBranches(q)) return { ...main, questionId: q.id, followUps: undefined };
    const subs = flatten([...(q.branches?.yes ?? []), ...(q.branches?.no ?? [])]).map(({ q: s }) => {
      // Not on the path: the other branch, or any branch of a question never decided.
      const apart = out.has(s.id) || !onPath(questions, s.id, taken);
      if (apart) return { questionId: s.id, question: s.text, answer: na, status: "no_aplica" as const };
      const a = byId.get(s.id);
      const answered = !!a && a.status !== "sin_respuesta";
      return {
        questionId: s.id,
        question: s.text,
        answer: a?.answer ?? none,
        status: a?.status ?? ("sin_respuesta" as const),
        ...(a?.branchTaken && { branchTaken: a.branchTaken }),
        ...(s.purpose && { purpose: s.purpose }),
        // A "by when" answer always gets its timeline (the local reading if the model gave none).
        ...((a?.timeline || (s.purpose === "timeline" && answered)) && {
          timeline: a?.timeline ?? classifyTimeline(a!.answer),
        }),
      };
    });
    return { ...main, questionId: q.id, branchTaken: taken[q.id] ?? "n/a", followUps: subs };
  });
}

/** What they want to have or improve, most urgent first ("asap" … "unknown"). */
export const byUrgency = <T extends { timeline: Timeline }>(items: T[]) =>
  [...items].sort((a, b) => URGENCY[a.timeline] - URGENCY[b.timeline]);

/** "Oportunidades y plazos" as lines, most urgent first: "Sistema de inventario — Lo antes posible («para este mes»)". */
export function opportunityLines(
  s: Partial<Pick<InterviewSummary, "opportunities">>,
  labels: Record<Timeline, string>,
) {
  return byUrgency(s.opportunities ?? []).map(
    (o) => `${o.item} — ${labels[o.timeline]}${o.detail ? ` («${o.detail}»)` : ""}`,
  );
}

/** The most urgent timeline in an interview (Notion's "Urgencia"); null = nothing wanted. */
export function mostUrgent(s: Pick<InterviewSummary, "opportunities">): Timeline | null {
  return byUrgency(s.opportunities)[0]?.timeline ?? null;
}

/** Whether every yes/no above a branch question was decided toward it. */
function onPath(questions: Question[], id: string, taken: Record<string, Branch>) {
  const nodes = flatten(questions);
  let n = nodes.find((x) => x.q.id === id);
  while (n?.parent) {
    if (taken[n.parent.id] !== n.parent.branch) return false;
    const parentId = n.parent.id;
    n = nodes.find((x) => x.q.id === parentId);
  }
  return true;
}

/** URL-safe slug from a project name ("Boutique Luna" → "boutique-luna"). */
export const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** `base`, or `base-2`, `base-3`… when another Emily already uses it. */
export function freeSlug(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Whether the Emily's link takes interviews now: not paused and not past its expiry day. */
export function isOpen(d: Draft, now = new Date()) {
  if (d.status === "paused") return false;
  if (d.noExpiry || !/^\d{4}-\d{2}-\d{2}$/.test(d.expires)) return true;
  return now <= new Date(`${d.expires}T23:59:59`);
}

/** A spoken confirmation: "sí"/"yes" → yes, "no" → no, anything else → null (treat as a correction). */
export function answerKind(text: string): "yes" | "no" | null {
  const s = text.trim().toLowerCase();
  const yes =
    /^\W*(s[ií]+|claro|correcto|exacto|as[ií] es|perfecto|ok(ay)?|vale|de acuerdo|est[aá] bien|yes|yeah|yep|yup|sure|correct|exactly|absolutely|right|that'?s (right|correct|it)|it is|sounds good|looks good)(?!\p{L})/u;
  const no =
    /^\W*(no|nop|nope|incorrecto|negativo|est[aá] mal|wrong|not (really|quite|right)|that'?s (wrong|not right))(?!\p{L})/u;
  if (yes.test(s)) return "yes";
  if (no.test(s)) return "no";
  return null;
}

/**
 * Splits a long spoken line into a few chunks of whole sentences, each synthesized on its own:
 * the first one sounds sooner and a stalled request only costs that chunk. Chunks are kept long
 * (≥ minChars) so there are few joins — short lines stay in one piece.
 */
export function splitSentences(text: string, minChars = 90): string[] {
  const raw =
    text
      .match(/[^.!?…]+(?:[.!?…]+["”»)]*|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
  const out: string[] = [];
  for (const s of raw) {
    const last = out.at(-1);
    if (last !== undefined && last.length < minChars) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out.length ? out : [text.trim()];
}

/**
 * How an Emily's link is shown: "<host>/e" (+ "/<slug>"). From NEXT_PUBLIC_APP_URL, inlined at
 * build time; copying a link always uses the page's real origin.
 */
export const LINK_BASE = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://emily.neoerasystems.com")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "")}/e`;

// Rough ES/EN detector for the "never mix languages" rule (no LLM needed). Counts each language's
// marks and very common words; null when there's too little text to tell.
const ES_MARKS = /[¿¡ñáéíóú]/g;
const ES_WORDS =
  /(?<!\p{L})(que|qué|de|la|el|los|las|por|para|cómo|como|cuál|cuántos|tienen|tiene|usted|su|sus|una|un|con|es|son|hay|le|les|se|en|del|al|y|o|tu|tus|si|cuando|nos|mi|mis|este|esta|sobre|quién|nuestro|nuestra|cuánto|dónde|también)(?!\p{L})/gu;
const EN_WORDS =
  /(?<!\p{L})(the|what|how|which|do|does|did|you|your|is|are|was|of|and|with|would|have|has|to|in|for|on|it|an|or|any|they|we|our|my|can|will|that|this|from|about|their|if|when|why|who|where|much|many|learn|currently)(?!\p{L})/gu;

export function detectLang(text: string): "es" | "en" | null {
  const t = text.toLowerCase();
  const es = (t.match(ES_MARKS)?.length ?? 0) * 2 + (t.match(ES_WORDS)?.length ?? 0);
  const en = t.match(EN_WORDS)?.length ?? 0;
  if (es + en < 2) return null;
  if (es >= en * 1.5) return "es";
  if (en >= es * 1.5) return "en";
  return null;
}

/** True when some of the Emily's spoken content (goal, questions, areas) is in the other language. */
export function mixesLanguages(d: Draft) {
  const texts = [d.objective, ...d.questions.map((q) => q.text), ...d.areas];
  return texts.some((t) => {
    const lang = detectLang(t);
    return lang !== null && lang !== d.locale;
  });
}

/** A whole interview conversation, as saved with its result (and sent to email/Notion). */
export const transcriptSchema = z
  .array(
    z.object({
      role: z.enum(["emily", "participant"]),
      text: z.string().max(4000),
      q: z.number().int().optional(), // the required question a participant turn answers
    }),
  )
  .max(200);
export type Transcript = z.infer<typeof transcriptSchema>;
