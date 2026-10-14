"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getLlm } from "@/integrations/llm";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/server/auth/admin";
import { emilyRepository } from "@/server/repositories/emily.repository";
import { planFromText } from "@/features/demo/plan-fallback";
import {
  missingFields,
  patchSchema,
  presetFallback,
  presets,
  type Draft,
  type Patch,
  normalizeDraft,
  toQuestions,
  type PresetId,
  isOpen,
  summarySchema,
  type InterviewSummary,
} from "./config";

// Shared rules so every path writes questions the same way.
const QUESTION_RULES = `Reglas para las preguntas:
- Cada pregunta es un objeto {"text": string, "kind": "abierta" | "cerrada"}.
- Mezcla según el contexto: "cerrada" para datos concretos (sí/no, cantidades, frecuencia, elegir entre opciones); "abierta" para experiencias, motivos, procesos y problemas. Suele funcionar 60-70% abiertas.
- Una idea por pregunta, lenguaje simple y hablado (se hará por voz). Nada de preguntas dobles.
- Orden lógico: apertura → preguntas clave del objetivo → profundización → cierre.
- Si ya existen preguntas y hay información nueva: reformula las existentes para que sean más precisas, agrega las que falten para cubrir el objetivo y elimina duplicados. Conserva las que el usuario pidió explícitamente.
- Entre 5 y 10 preguntas en total.`;

/**
 * The interview's Emily, loaded from the database (public actions never trust a browser-sent
 * configuration: it would make them a free LLM endpoint). Paused or expired links are refused.
 */
async function openEmily(slug: string) {
  const row = /^[a-z0-9-]{1,90}$/.test(slug) ? await emilyRepository.find(slug) : null;
  const draft = row && normalizeDraft(row.draft);
  if (!draft || !isOpen(draft)) throw new Error("Esta Emily no está disponible.");
  return draft;
}

const hasLlm = () =>
  !!(env().LLM_PROVIDER === "anthropic" ? env().ANTHROPIC_API_KEY : env().OPENAI_API_KEY);

/** Which engines the landing can use: OpenAI voice (STT/TTS) and the LLM. */
export async function aiStatus() {
  const voice = !!env().OPENAI_API_KEY;
  return { voice, llm: hasLlm(), engine: voice ? env().VOICE_ENGINE : ("classic" as const) };
}

async function allow(kind: string) {
  // TODO(security): public while there is no login — keep the rate limit until auth exists.
  if (!rateLimit(`${kind}:${clientIp(await headers())}`, 20, 60_000))
    throw new Error("Demasiadas solicitudes, espera un momento.");
}

async function askJson<T>(system: string, user: string, schema: z.ZodType<T>) {
  const raw = await getLlm().completeJson({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.4,
  });
  return schema.parse(JSON.parse(raw));
}

const replySchema = z.object({
  patch: patchSchema,
  reply: z.string().min(1).max(400),
  done: z.boolean().default(false),
});

/**
 * Voice mode turn: what the user said + current draft → fields to update + Emily's next line.
 */
export async function fillFromSpeech(
  transcript: string,
  draft: Draft,
): Promise<{ patch: Patch; reply: string; done: boolean; source: "ai" | "local" }> {
  draft = normalizeDraft(draft);
  await requireAdmin();
  await allow("fill");
  const said = z.string().trim().min(2).max(4000).parse(transcript);

  if (hasLlm()) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lang = draft.locale === "en" ? "inglés (English)" : "español";
      const { patch, reply, done } = await askJson(
        `Eres Emily, una entrevistadora con IA. Estás ayudando a configurar una entrevista por voz.
Recibes el borrador actual (JSON) y lo que el usuario acaba de decir (transcripción de voz, puede tener errores).
Devuelve SOLO JSON: {"patch": {...}, "reply": string, "done": boolean}.
- patch: solo los campos que el usuario mencionó o que se deducen con claridad. Campos posibles:
  recipientName, company, project, objective, questions (lista COMPLETA resultante), areas (lista completa), reportEmail (solo si lo dicta claramente), status ("active"|"paused"), expires ("YYYY-MM-DD"; hoy es ${today}), noExpiry (boolean).
- En cuanto el objetivo esté claro, redacta el objective y formula el set de preguntas. Si el usuario da más información y ya había preguntas, reformúlalas o agrega nuevas para lograr una mejor entrevista.
${QUESTION_RULES}
- reply: 1 o 2 frases habladas, cálidas y breves, SIEMPRE en ${lang} (aunque el usuario hable otro idioma): confirma lo que anotaste y pide UNA cosa que falte, en este orden: destinatario (nombre/empresa), proyecto, objetivo; luego propone las preguntas.
- NUNCA pidas el correo para los resultados: se agrega después en la configuración.
- IDIOMA ÚNICO: objective, questions y areas SIEMPRE en ${lang}, aunque el usuario hable en otro idioma (tradúcelos). Solo nombres propios, empresas y marcas quedan como son. Nunca mezcles idiomas en un mismo texto.
- Cuando ya hay proyecto, objetivo y preguntas (y ya preguntaste para quién es), termina reply preguntando si necesita agregar o preguntar algo más, o si eso es todo (por ejemplo: "${draft.locale === "en" ? "Is there anything else you'd like Emily to ask, or is that all?" : "¿Quieres que Emily pregunte algo más o eso es todo?"}").
  - Si el usuario pide más preguntas o cambios: aplícalos (questions = lista completa actualizada), confirma en una frase y vuelve a preguntar si hay algo más. done=false.
  - done: true SOLO cuando, después de esa pregunta, el usuario dice que no hay nada más ("es todo", "no", "ya está", "that's all"…). Entonces patch={} y reply es una palabra de confirmación ("¡Perfecto!" / "Great!").`,
        JSON.stringify({ draft, said }),
        replySchema,
      );
      return { patch, reply, done, source: "ai" };
    } catch (err) {
      logger.error("fillFromSpeech LLM failed, using local fallback", { err: String(err) });
    }
  }

  // Local fallback: "that's all" closes once the essentials exist; else organize the request.
  const en = draft.locale === "en";
  if (!missingFields(draft).length && isThatAll(said))
    return { patch: {}, reply: en ? "Great!" : "¡Perfecto!", done: true, source: "local" };
  const plan = planFromText(said);
  const patch: Patch = {
    project: draft.project || plan.name,
    objective: draft.objective || plan.objective,
    questions: [
      ...draft.questions.filter((q) => q.text.trim()),
      ...toQuestions(plan.questions.map((q) => q.text)),
    ].slice(0, 15),
  };
  const names = en
    ? { project: "the project", objective: "the goal", questions: "the questions" }
    : { project: "el proyecto", objective: "el objetivo", questions: "las preguntas" };
  const missing = missingFields({ ...draft, ...patch } as Draft).map((m) => names[m]);
  const n = patch.questions!.length;
  const reply = missing.length
    ? en
      ? `Got it. Now tell me ${missing.join(" and ")}.`
      : `Anotado. Ahora cuéntame ${missing.join(" y ")}.`
    : en
      ? `Done, I organized ${n} questions. Is there anything else you'd like Emily to ask, or is that all?`
      : `Listo, organicé ${n} preguntas. ¿Quieres que Emily pregunte algo más o eso es todo?`;
  return { patch, reply, done: false, source: "local" };
}

/** "Es todo" / "that's all": the user has nothing more to add (local fallback without the LLM). */
const isThatAll = (text: string) =>
  /^\W*((no|ok(ay)?|s[ií]|yes|yeah)\W+)?(no|nop|nope|nada( más)?|es todo|eso es todo|eso ser[ií]a todo|ya est[aá]|ya es todo|listo|that'?s (all|it|everything)|that would be all|nothing( else| more)?|no more|all good|we'?re (good|done)|i'?m (good|done)|done)\W*(gracias|thanks|thank you)?\W*$/i.test(
    text.trim(),
  );

/** Preset + context ("tienda de ropa") → project, objective, questions and areas. */
export async function generateFromPreset(
  presetId: PresetId,
  context: string,
  locale: "es" | "en",
): Promise<{ patch: Patch; source: "ai" | "local" }> {
  await requireAdmin();
  await allow("preset");
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) throw new Error("Plantilla desconocida");
  const ctx = z.string().trim().max(200).parse(context);

  if (hasLlm()) {
    try {
      const patch = await askJson(
        `Diseñas entrevistas de investigación con clientes que hará una IA por voz.
Devuelve SOLO JSON: {"project": string corto, "objective": string (1-2 frases), "questions": [...], "areas": string[] (3 a 5 temas de seguimiento opcionales, 1-3 palabras)}.
${QUESTION_RULES}
Idioma: ${locale === "es" ? "español" : "English"}.`,
        `Tipo de entrevista: ${preset.label} (${preset.desc}). Contexto: ${ctx || "general"}.`,
        patchSchema,
      );
      return { patch, source: "ai" };
    } catch (err) {
      logger.error("generateFromPreset LLM failed, using local fallback", { err: String(err) });
    }
  }
  return { patch: presetFallback(presetId, ctx), source: "local" };
}

const refineSchema = z.object({
  questions: patchSchema.shape.questions.unwrap(),
  note: z.string().max(300),
});

/**
 * Writes (no questions yet) or improves (questions exist) the question set for the current
 * objective and context, mixing open and closed questions. Returns a one-line note of what changed.
 */
export async function refineQuestions(
  draft: Draft,
): Promise<{ questions: Patch["questions"]; note: string; source: "ai" | "local" }> {
  draft = normalizeDraft(draft);
  await requireAdmin();
  await allow("refine");
  if (draft.objective.trim().length < 10) throw new Error("Primero escribe el objetivo.");

  if (hasLlm()) {
    try {
      const { questions, note } = await askJson(
        `Diseñas entrevistas de investigación que una IA hará por voz. Idioma: ${draft.locale === "es" ? "español" : "English"}.
${QUESTION_RULES}
Devuelve SOLO JSON: {"questions": [...], "note": una frase breve explicando qué hiciste (p. ej. "Reformulé 2 y agregué 3 cerradas sobre inventario")}.`,
        JSON.stringify({
          proyecto: draft.project,
          objetivo: draft.objective,
          destinatario: [draft.recipientName, draft.company].filter(Boolean).join(", "),
          areas_opcionales: draft.areas,
          preguntas_actuales: draft.questions,
        }),
        refineSchema,
      );
      return { questions, note, source: "ai" };
    } catch (err) {
      logger.error("refineQuestions LLM failed, using local fallback", { err: String(err) });
    }
  }

  const plan = planFromText(`${draft.objective}. ${draft.project}`);
  const existing = draft.questions.filter((q) => q.text.trim());
  const extra = toQuestions(plan.questions.map((q) => q.text)).filter(
    (q) => !existing.some((e) => e.text.toLowerCase() === q.text.toLowerCase()),
  );
  return {
    questions: [...existing, ...extra].slice(0, 10),
    note: `Agregué ${Math.min(extra.length, 10 - existing.length)} preguntas sugeridas (sin IA).`,
    source: "local",
  };
}

const translationSchema = z.object({
  project: z.string().max(160),
  objective: z.string().max(800),
  questions: z
    .array(z.object({ text: z.string().max(300), kind: z.enum(["abierta", "cerrada"]) }))
    .max(15),
  areas: z.array(z.string().max(60)).max(10),
});
export type DraftTranslation = z.infer<typeof translationSchema>;

/**
 * The ES/EN switch: translates what the admin already wrote (project, goal, questions, follow-up
 * areas) so Emily asks it in the new language. Names and brands are kept. null = no AI available.
 */
export async function translateDraft(
  draft: Draft,
  to: "es" | "en",
): Promise<DraftTranslation | null> {
  draft = normalizeDraft(draft);
  await requireAdmin();
  await allow("translate");
  if (!hasLlm()) return null;
  try {
    const result = await askJson(
      `Traduce el contenido de una entrevista al ${to === "es" ? "español latinoamericano neutro" : "inglés (EE. UU.)"}.
- Conserva nombres propios, empresas, marcas y productos tal cual.
- Las preguntas deben sonar naturales al decirse en voz alta; conserva el tipo ("abierta"/"cerrada") de cada una y su orden.
- Si algo ya está en el idioma destino, déjalo igual. No agregues ni quites elementos.
Responde SOLO JSON: {"project": string, "objective": string, "questions": [{"text": string, "kind": "abierta"|"cerrada"}], "areas": string[]}.`,
      JSON.stringify({
        project: draft.project,
        objective: draft.objective,
        questions: draft.questions,
        areas: draft.areas,
      }),
      translationSchema,
    );
    return result;
  } catch (err) {
    logger.error("translateDraft failed", { err: String(err) });
    return null;
  }
}

/**
 * "Resultados" in the other UI language: translates a saved summary's texts. Grading (status,
 * objective met) is copied from the original, never re-decided by the model.
 */
export async function translateSummary(
  summary: InterviewSummary,
  to: "es" | "en",
): Promise<InterviewSummary | null> {
  const input = summarySchema.parse(summary);
  await requireAdmin();
  await allow("translate");
  if (!hasLlm()) return null;
  try {
    const out = await askJson(
      `Traduce al ${to === "es" ? "español latinoamericano neutro" : "inglés (EE. UU.)"} el resumen de una entrevista (JSON).
- Traduce solo los textos; conserva claves, orden y cantidad de elementos de cada lista.
- No cambies "status" ni "met". Conserva nombres propios, empresas, marcas y cifras.
- Si algo ya está en el idioma destino, déjalo igual.
Responde SOLO el JSON traducido, con las mismas claves.`,
      JSON.stringify(input),
      summarySchema,
    );
    return {
      ...out,
      answers: input.answers.map((a, i) => ({
        ...a,
        question: out.answers[i]?.question || a.question,
        answer: out.answers[i]?.answer || a.answer,
      })),
      objective: { met: input.objective.met, reason: out.objective.reason },
    };
  } catch (err) {
    logger.error("translateSummary failed", { err: String(err) });
    return null;
  }
}

// ── Test interview: Emily runs the configured interview by voice ────────────────────────────

const turnSchema = z.object({
  role: z.enum(["emily", "participant"]),
  text: z.string().max(4000),
  /** Required question this participant turn answers (shown under it in Notion). */
  q: z.number().int().min(-1).max(19).optional(),
});
export type Turn = z.infer<typeof turnSchema>;
const historySchema = z.array(turnSchema).max(80);

const nextSchema = z.object({
  say: z.string().min(1).max(600),
  done: z.boolean(),
  covered: z.number().int().min(0).max(20),
  /** Index of the required question this turn is about; -1 = presentation or closing. */
  asking: z.number().int().min(-1).max(19),
});
export type NextTurn = z.infer<typeof nextSchema>;

/**
 * Emily's next line: first a presentation (no question), then the required questions in order
 * (one per turn, at most one follow-up each), then a closing (`done`).
 */
export async function interviewTurn(slug: string, history: Turn[]): Promise<NextTurn> {
  await allow("interview");
  const draft = await openEmily(slug);
  const turns = historySchema.parse(history);
  const qs = draft.questions.map((q) => q.text).filter((q) => q.trim());
  const es = draft.locale === "es";
  const emilyTurns = turns.filter((t) => t.role === "emily").length;
  const tooLong = emilyTurns > qs.length * 2 + 3;

  if (hasLlm() && !tooLong) {
    try {
      const next = await askJson(
        `Eres Emily, entrevistadora con IA de NEOera. Conduces una entrevista POR VOZ.
Proyecto: ${draft.project}
Objetivo: ${draft.objective}
Participante: ${[draft.recipientName, draft.company].filter(Boolean).join(", ") || "desconocido"}
Preguntas obligatorias (en orden, índice desde 0): ${qs.map((q, i) => `[${i}] ${q}`).join(" ")}
Áreas opcionales para profundizar si surge: ${draft.areas.join(", ") || "ninguna"}
Reglas:
- Idioma: ${es ? "español" : "English"}. Frases cortas y naturales para ser habladas (1 a 3 frases), sin listas, markdown, emojis ni símbolos.
- Preséntate solo en el primer turno; sin muletillas ni relleno ("déjame revisar", "un momento", "excelente pregunta"); no repitas literalmente lo que dijo el participante.
- Escribe SIEMPRE en ${es ? "español" : "English"}, aunque el participante use palabras en otro idioma; nunca mezcles idiomas en una misma frase. Escribe los números con cifras.
- Si alguna pregunta, el objetivo o el proyecto están escritos en otro idioma, dilos traducidos al ${es ? "español" : "English"} (conserva solo nombres propios y marcas).
- Si el participante responde en otro idioma, sigue hablando en ${es ? "español" : "English"}: no cambies de idioma.
- Si el historial está vacío: SOLO preséntate (eres Emily, de NEOera), di el propósito en palabras simples y que serán ${qs.length} preguntas cortas. NO hagas ninguna pregunta todavía. asking = -1.
- Después haz las preguntas obligatorias EN ORDEN, una por turno, casi textuales. Reconoce brevemente la respuesta anterior sin repetirla.
- Si una respuesta es vaga, haz como mucho UNA repregunta sobre esa misma pregunta antes de avanzar.
- asking = índice de la pregunta obligatoria a la que corresponde lo que preguntas ahora (también en repreguntas).
- Si el participante se desvía, reencauza con amabilidad hacia el objetivo.
- Cuando estén cubiertas todas, cierra agradeciendo: done = true, asking = -1.
Responde SOLO JSON: {"say": string, "done": boolean, "covered": número de preguntas obligatorias ya respondidas, "asking": número}.`,
        JSON.stringify({ history: turns }),
        nextSchema,
      );
      // The first turn is always the presentation (the model sometimes labels it question 0).
      if (emilyTurns === 0) return { ...next, done: false, covered: 0, asking: -1 };
      return { ...next, asking: Math.min(next.asking, qs.length - 1) };
    } catch (err) {
      logger.error("interviewTurn LLM failed, using local fallback", { err: String(err) });
    }
  }

  // Local fallback (or safety stop): presentation, the questions in order, closing.
  if (emilyTurns === 0)
    return {
      say: es
        ? `¡Hola${draft.recipientName ? `, ${draft.recipientName}` : ""}! Soy Emily, de NEOera. Te haré ${qs.length} preguntas cortas sobre ${draft.project}; responde con tus palabras.`
        : `Hi${draft.recipientName ? `, ${draft.recipientName}` : ""}! I'm Emily from NEOera. I'll ask you ${qs.length} short questions about ${draft.project}.`,
      done: false,
      covered: 0,
      asking: -1,
    };
  const i = emilyTurns - 1;
  if (i >= qs.length || tooLong)
    return {
      say: es
        ? "Eso es todo. ¡Muchas gracias por tu tiempo, me ayudaste muchísimo!"
        : "That's all. Thank you so much for your time!",
      done: true,
      covered: qs.length,
      asking: -1,
    };
  return {
    say: i === 0 ? qs[0]! : `${es ? "Gracias." : "Thanks."} ${qs[i]}`,
    done: false,
    covered: i,
    asking: i,
  };
}

export type { InterviewSummary };

/** Structured result of the test interview (what the team would receive by email/Notion). */
export async function summarizeInterview(slug: string, history: Turn[]): Promise<InterviewSummary> {
  await allow("summary");
  const draft = await openEmily(slug);
  const turns = historySchema.parse(history);
  const qs = draft.questions.map((q) => q.text).filter((q) => q.trim());

  if (hasLlm()) {
    try {
      const result = await askJson(
        `Resume una entrevista de investigación. Escribe TODO el texto (summary, insights, answers, reason, listas) en ${draft.locale === "es" ? "español" : "inglés (English)"}; las citas, tal como las dijo.
Objetivo: ${draft.objective}. Preguntas obligatorias: ${qs.join(" | ")}.
Evalúa con rigor si se obtuvo la información de CADA pregunta obligatoria:
- "completa": respondió con información concreta y útil para el objetivo.
- "parcial": respondió vago, incompleto o solo una parte.
- "sin_respuesta": no se preguntó, no respondió o evadió.
Extrae también la información importante para el objetivo, SOLO lo que el participante dijo (no inventes):
- "keyFacts": datos concretos (cifras, herramientas, nombres, fechas, procesos, precios). Frases cortas.
- "painPoints": problemas, frustraciones o necesidades que expresó.
- "quotes": 1-4 citas textuales, literales y cortas, que capturen su punto de vista.
- "nextSteps": oportunidades o próximos pasos recomendados para el equipo a partir de lo dicho.
Listas vacías si no hay información suficiente.
Responde SOLO JSON: {"summary": 2-4 frases, "insights": 2-5 hallazgos accionables, "answers": [{"question": pregunta obligatoria (una por cada una, en orden), "answer": lo que respondió en 1-2 frases o "${draft.locale === "es" ? "Sin respuesta" : "No answer"}", "status": "completa"|"parcial"|"sin_respuesta"}], "objective": {"met": boolean (¿la entrevista cumplió el objetivo?), "reason": 1 frase}, "keyFacts": [], "painPoints": [], "quotes": [], "nextSteps": []}.`,
        JSON.stringify({ history: turns }),
        summarySchema,
      );
      // The model often wraps quotes in quotation marks; the templates add their own.
      const unquote = (q: string) => q.replace(/^[\s"“”'«»]+|[\s"“”'«»]+$/g, "");
      return { ...result, quotes: result.quotes.map(unquote).filter(Boolean) };
    } catch (err) {
      logger.error("summarizeInterview LLM failed, using local fallback", { err: String(err) });
    }
  }

  // Local fallback: answers in order; length as a rough proxy for completeness.
  const said = turns.filter((t) => t.role === "participant").map((t) => t.text);
  const answers = qs.map((q, i) => {
    const a = said[i]?.trim() ?? "";
    const status = !a ? "sin_respuesta" : a.split(/\s+/).length >= 6 ? "completa" : "parcial";
    return {
      question: q,
      answer: a || (draft.locale === "es" ? "Sin respuesta" : "No answer"),
      status,
    } as const;
  });
  const met = answers.filter((a) => a.status === "completa").length >= Math.ceil(qs.length * 0.8);
  return {
    summary: "Resumen generado sin IA: estas son las respuestas en orden.",
    insights: [],
    keyFacts: answers.filter((a) => a.status === "completa").map((a) => a.answer),
    painPoints: [],
    quotes: said.filter((t) => t.split(/\s+/).length >= 8).slice(0, 3),
    nextSteps: [],
    answers,
    objective: {
      met,
      reason: met
        ? "Se respondieron la mayoría de las preguntas con detalle."
        : "Faltan respuestas o fueron muy breves.",
    },
  };
}
