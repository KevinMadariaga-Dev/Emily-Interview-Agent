import { z } from "zod";

export type QuestionKind = "abierta" | "cerrada";
export type Question = { text: string; kind: QuestionKind };

/**
 * Emily's voices: female only, each validated in Spanish with gpt-4o-mini-tts + fixed language
 * instructions (48/48 clips transcribed back as Spanish, fidelity ≥ 0.94). tts-1-hd was dropped:
 * it guesses the language per line and switched to English/garbled phonetics mid-interview.
 */
export const voices = [
  { id: "coral", name: "Coral", desc: "Cálida y cercana" },
  { id: "nova", name: "Nova", desc: "Enérgica y clara" },
  { id: "shimmer", name: "Shimmer", desc: "Suave y tranquila" },
  { id: "sage", name: "Sage", desc: "Serena y profesional" },
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
  // LLMs return {text, kind}; templates and older paths return plain strings.
  questions: z
    .array(
      z.union([
        z.string().min(3).max(300),
        z.object({ text: z.string().min(3).max(300), kind: z.enum(["abierta", "cerrada"]) }),
      ]),
    )
    .max(15)
    .optional(),
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
  },
  {
    id: "descubrimiento",
    label: "Descubrimiento de clientes",
    desc: "Problemas reales, hábitos y lo que ya intentaron.",
    context: "¿Qué problema o mercado?",
    placeholder: "Agendamiento en clínicas dentales",
  },
  {
    id: "producto",
    label: "Validar un producto",
    desc: "Si una idea resuelve un dolor y cuánto pagarían.",
    context: "¿Qué producto o idea?",
    placeholder: "App de recordatorios por WhatsApp",
  },
  {
    id: "digital",
    label: "Madurez digital",
    desc: "Sitio web, inventario y preparación para vender online.",
    context: "¿Qué negocio?",
    placeholder: "Ferretería de barrio",
  },
  {
    id: "satisfaccion",
    label: "Satisfacción de clientes",
    desc: "Experiencia, lo que valoran y qué mejorar.",
    context: "¿Qué producto o servicio?",
    placeholder: "Servicio de soporte técnico",
  },
] as const;
export type PresetId = (typeof presets)[number]["id"];

/** Required before "Crear Emily". */
export function missingFields(d: Draft) {
  const missing: string[] = [];
  if (!d.project.trim()) missing.push("el proyecto");
  if (d.objective.trim().length < 10) missing.push("el objetivo");
  if (!d.questions.some((q) => q.text.trim())) missing.push("las preguntas");
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

export function toQuestions(qs: NonNullable<Patch["questions"]>): Question[] {
  return qs.map((q) => (typeof q === "string" ? { text: q, kind: kindOf(q) } : q));
}

// ── Interview success ────────────────────────────────────────────────────────────────────────

export type AnswerStatus = "completa" | "parcial" | "sin_respuesta";

/** % of the required information obtained: complete = 1, partial = ½, missing = 0. */
export function coverage(answers: { status: AnswerStatus }[]) {
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
export function normalizeDraft(raw: unknown): Draft {
  const d = (raw ?? {}) as Omit<Partial<Draft>, "questions"> & { questions?: unknown[] };
  const qs = (d.questions ?? []).filter(
    (q): q is string | Question =>
      typeof q === "string" || (!!q && typeof (q as Question).text === "string"),
  );
  return {
    recipientName: d.recipientName ?? "",
    company: d.company ?? "",
    project: d.project ?? "",
    objective: d.objective ?? "",
    questions: toQuestions(qs as NonNullable<Patch["questions"]>).filter((q) => q.text.trim()),
    // Any retired voice (male/neutral, or ones that failed validation) falls back to Coral.
    voice: voiceIds.includes(d.voice as VoiceId) ? (d.voice as VoiceId) : "coral",
    reportEmail: typeof d.reportEmail === "string" ? d.reportEmail.trim() : "",
    areas: d.areas ?? [],
    locale: d.locale === "en" ? "en" : "es",
    status: d.status === "paused" ? "paused" : "active",
    expires: d.expires ?? "",
    noExpiry: d.noExpiry ?? false,
  };
}
