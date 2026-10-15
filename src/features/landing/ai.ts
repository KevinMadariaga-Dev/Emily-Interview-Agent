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
  settleBranches,
  summarySchema,
  type InterviewSummary,
} from "./config";
import { flatten, hasBranches, questionNodeSchema, type QuestionInput } from "./question-tree";
import { BRANCH_RULES, describeQuestions, PLAZO_RULES } from "./realtime-prompt";

// Shared rules so every path writes questions the same way.
const QUESTION_RULES = `Reglas para las preguntas:
- Cada pregunta es un objeto {"text": string, "kind": "abierta" | "cerrada"}.
- Mezcla según el contexto: "cerrada" para datos concretos (sí/no, cantidades, frecuencia, elegir entre opciones); "abierta" para experiencias, motivos, procesos y problemas. Suele funcionar 60-70% abiertas.
- Una idea por pregunta, lenguaje simple y hablado (se hará por voz). Nada de preguntas dobles.
- Orden lógico: apertura → preguntas clave del objetivo → profundización → cierre.
- Si ya existen preguntas y hay información nueva: reformula las existentes para que sean más precisas, agrega las que falten para cubrir el objetivo y elimina duplicados. Conserva las que el usuario pidió explícitamente.
- Entre 5 y 10 preguntas en total.
- Si una pregunta cerrada ya trae "branches" ({"yes": [...], "no": [...]}: preguntas distintas según responda que sí o que no), CONSÉRVALAS con su estructura (puedes mejorar su redacción). No inventes ramas nuevas salvo que te lo pidan.`;

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

async function askJson<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  reasoningEffort?: "none" | "low",
) {
  const raw = await getLlm().completeJson({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.4,
    reasoningEffort,
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

const branchingSchema = z.object({
  question: questionNodeSchema.refine(
    (q) => q.kind === "cerrada" && !!(q.branches?.yes?.length && q.branches?.no?.length),
    { error: "Se esperaba una pregunta sí/no con preguntas en ambas ramas." },
  ),
  /** Id of an existing question about the same thing, which the new one replaces. */
  replaces: z.string().max(40).nullable().default(null),
  /** Ids of existing questions that only make sense in one branch: now inside it. */
  absorbs: z.array(z.string().max(40)).max(15).default([]),
});

/**
 * "Generar ramificación con IA": the admin's intent ("quiero saber si tiene página web") → a
 * yes/no main question with an affirmative and a negative branch, consistent with the goal.
 * The result is validated with the tree schema (depth, sizes); an invalid one is an error.
 */
export async function generateBranching(
  intent: string,
  draft: Draft,
): Promise<{ question: QuestionInput; replaces: string | null; absorbs: string[] }> {
  draft = normalizeDraft(draft);
  await requireAdmin();
  await allow("branch");
  const want = z.string().trim().min(5).max(300).parse(intent);
  if (!hasLlm()) throw new Error("La generación con IA no está disponible.");
  const es = draft.locale === "es";
  try {
    return await askJson(
      `Diseñas UNA pregunta con ramificación para una entrevista de investigación que una IA hará por voz. Idioma: ${es ? "español" : "English"} (todo el texto en ese idioma).
Tono: amigable y conversacional, como una charla y no un interrogatorio. Preguntas cortas, una idea cada una, lenguaje simple. Coherentes con el objetivo de la entrevista.
A partir de la intención del administrador, la pregunta principal es cerrada (sí/no), del tipo "¿Tienes / usas / cuentas con X?", y se ramifica con ESTE patrón (cada sub-pregunta con su "purpose"):
- "branches.yes" — conocer lo que tiene ("purpose": "discover"), en este orden:
  1. Identificación: cómo se llama, cuál es o dónde está (puede empezar con un reconocimiento cálido, p. ej. "¡Qué bien! ¿Cómo se llama tu web o cuál es la dirección?").
  2. Antigüedad: hace cuánto lo tiene o lo usa.
  3. Uso / funciones: qué hace, para qué lo usa (con ejemplos breves entre paréntesis si ayudan).
  4. Resultado: si le funciona, si sus clientes lo usan, cómo llegan a él.
  5. Mejora: pregunta CERRADA "¿Hay algo que le quisieras mejorar o agregar?" ("purpose": "interest") con "branches.yes" = [la pregunta de plazo de esa mejora ("purpose": "timeline"), p. ej. "¿Para cuándo te gustaría tener esa mejora: lo más pronto posible, en unos meses, o más adelante?"].
- "branches.no" — explorar interés:
  1. Interés: pregunta CERRADA "¿Te gustaría tener uno/una?" ("purpose": "interest"), con:
     · "branches.yes": visión ("purpose": "vision": cómo se lo imagina, qué le gustaría que hiciera), referencias ("purpose": "vision": algún ejemplo que le guste) y SIEMPRE el plazo ("purpose": "timeline", con opciones abiertas: "lo antes posible, en unos meses, o más adelante").
     · "branches.no": motivo ("purpose": "reason": por qué no, cómo lo resuelve hoy) y un plazo suave ("purpose": "timeline": "¿Es algo que considerarías más adelante, o por ahora no lo ves necesario?").
Máximo 3 niveles (la principal, sus ramas y las ramas de éstas). Nunca preguntes por algo que dijo no tener en la rama negativa.
- "replaces": si entre las preguntas actuales hay una que pregunta lo mismo que la pregunta principal (quedaría duplicada), su "id"; si no, null.
- "absorbs": los "id" de las preguntas actuales que SOLO tienen sentido en una de las ramas (p. ej. "¿Qué hacen los clientes en tu web?" solo si tiene web). Inclúyelas, o su equivalente, dentro de esa rama; se quitarán de la lista principal para no preguntarlas a quien no corresponde. [] si no hay.
Responde SOLO JSON: {"question": {"text": string, "kind": "cerrada", "branches": {"yes": [{"text": string, "kind": "abierta"|"cerrada", "purpose": "discover"|"interest"|"vision"|"timeline"|"reason", "branches"?: {...}}], "no": [...]}}, "replaces": string | null, "absorbs": string[]}.`,
      JSON.stringify({
        intencion: want,
        proyecto: draft.project,
        objetivo: draft.objective,
        preguntas_actuales: draft.questions.map((q) => ({ id: q.id, text: q.text })),
      }),
      branchingSchema,
    );
  } catch (err) {
    logger.error("generateBranching failed", { err: String(err) });
    throw new Error(
      es
        ? "No pude generar una ramificación válida. Prueba a escribirlo de otra forma."
        : "I couldn't generate a valid branching. Try phrasing it differently.",
    );
  }
}

const translationSchema = z.object({
  project: z.string().max(160),
  objective: z.string().max(800),
  questions: z.array(questionNodeSchema).max(15),
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
- Las preguntas deben sonar naturales al decirse en voz alta; conserva el tipo ("abierta"/"cerrada") de cada una, su orden, su "id" y sus "branches" (las preguntas de cada rama, traducidas, con la misma estructura).
- Si algo ya está en el idioma destino, déjalo igual. No agregues ni quites elementos.
Responde SOLO JSON: {"project": string, "objective": string, "questions": [{"id": string, "text": string, "kind": "abierta"|"cerrada", "branches"?: {"yes"?: [...], "no"?: [...]}}], "areas": string[]}.`,
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
        route: out.answers[i]?.route || a.route,
        ambiguityNote: out.answers[i]?.ambiguityNote || a.ambiguityNote,
        followUps: a.followUps?.map((f, j) => ({
          ...f,
          question: out.answers[i]?.followUps?.[j]?.question || f.question,
          answer: out.answers[i]?.followUps?.[j]?.answer || f.answer,
        })),
      })),
      objective: { met: input.objective.met, reason: out.objective.reason },
      // Timelines are copied, never re-decided; only the words are translated.
      opportunities: input.opportunities.map((o, i) => ({
        ...o,
        item: out.opportunities[i]?.item || o.item,
        detail: out.opportunities[i]?.detail || o.detail,
      })),
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
  // Branch questions add turns: the safety stop counts every question that could be asked.
  const tooLong = emilyTurns > flatten(draft.questions).length * 2 + 3;
  const branched = draft.questions.some(hasBranches);

  if (hasLlm() && !tooLong) {
    try {
      const next = await askJson(
        `Eres Emily, entrevistadora con IA de NEOera. Conduces una entrevista POR VOZ.
Proyecto: ${draft.project}
Objetivo: ${draft.objective}
Participante: ${[draft.recipientName, draft.company].filter(Boolean).join(", ") || "desconocido"}
Preguntas (las principales en orden; las de una rama solo si la respuesta lleva a ella):
${describeQuestions(draft.questions, true)}
Áreas opcionales para profundizar si surge: ${draft.areas.join(", ") || "ninguna"}
Reglas:
- Idioma: ${es ? "español" : "English"}. Frases cortas y naturales para ser habladas (1 a 3 frases), sin listas, markdown, emojis ni símbolos.
- Preséntate solo en el primer turno; sin muletillas ni relleno ("déjame revisar", "un momento", "excelente pregunta"); no repitas literalmente lo que dijo el participante.
- Escribe SIEMPRE en ${es ? "español" : "English"}, aunque el participante use palabras en otro idioma; nunca mezcles idiomas en una misma frase. Escribe los números con cifras.
- Si alguna pregunta, el objetivo o el proyecto están escritos en otro idioma, dilos traducidos al ${es ? "español" : "English"} (conserva solo nombres propios y marcas).
- Si el participante responde en otro idioma, sigue hablando en ${es ? "español" : "English"}: no cambies de idioma.
- Si el historial está vacío: SOLO preséntate (eres Emily, de NEOera), di el propósito en palabras simples y que serán ${qs.length} preguntas cortas. NO hagas ninguna pregunta todavía. asking = -1.
- Después haz las preguntas principales EN ORDEN, una por turno, casi textuales (y, tras una pregunta sí/no con ramas, las de la rama que corresponde). Reconoce brevemente la respuesta anterior sin repetirla.
${PLAZO_RULES}
${branched ? BRANCH_RULES : ""}
- Si una respuesta es vaga, haz como mucho UNA repregunta sobre esa misma pregunta antes de avanzar.
- asking = índice (desde 0) de la pregunta PRINCIPAL a la que corresponde lo que preguntas ahora (también en repreguntas y en preguntas de sus ramas).
- Si el participante se desvía, reencauza con amabilidad hacia el objetivo.
- Cuando estén cubiertas todas, cierra agradeciendo: done = true, asking = -1.
Responde SOLO JSON: {"say": string, "done": boolean, "covered": número de preguntas principales ya respondidas, "asking": número}.`,
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

export type AnswerRead = {
  intent: "yes" | "no" | "unclear" | null;
  answered: string[];
  /** The last answer to the current question is too vague (one gentle follow-up). */
  vague: boolean;
  /** Something new or an improvement they want, with no "by when" yet. */
  wants: string | null;
};

/**
 * Reads the answer to a question with branches (or inside one) with the text model, more
 * reliable than the voice model: what a yes/no answer meant (mixed answers like "No, sí tengo,
 * pero está vieja" included) and which questions of that main question's branches are already
 * answered in what they said (a timeline said in passing too), so Emily is given only the
 * branch that applies and only what's still missing. `said` = everything the participant said
 * since the main question. null = couldn't read it (the voice model decides on its own).
 */
export async function readAnswer(
  slug: string,
  questionId: string,
  said: string,
): Promise<AnswerRead | null> {
  await allow("interview");
  const draft = await openEmily(slug);
  const main = draft.questions.find((m) => flatten([m]).some((n) => n.q.id === questionId));
  const q = main && flatten([main]).find((n) => n.q.id === questionId)?.q;
  const text = z.string().trim().min(1).max(3000).parse(said);
  if (!main || !q || !hasLlm()) return null;
  try {
    const out = await askJson(
      `Analizas lo que respondió un participante en una entrevista por voz (transcripción, puede tener errores).
1. "intent": ${hasBranches(q) ? `la INTENCIÓN de su respuesta a la pregunta sí/no "${q.text}", por su sentido completo y no por palabras sueltas ni por la primera palabra.` : "null (la pregunta actual no es de sí/no con ramas)."}
- "yes": "sí", "tengo", "ya tengo una", "claro", "pues sí", "hace rato la tenemos", "tenemos una en Wix", "yes", "we do", "I've got one". Si describe cómo es o cómo está eso (viejo, lento, desactualizado, "no funciona bien"), es que lo tiene: "yes" aunque empiece con "no".
- "no": "no", "todavía no", "aún no", "nunca hemos tenido", "no, solo Instagram", "nada de eso", "not yet", "we don't".
- "unclear": "más o menos", "tengo una pero no funciona", "la estoy haciendo", "tenía pero la quité", "un amigo me la está montando", "creo que sí", "puede ser", "no sé".
- Mixtas, por el sentido final: "No, sí tengo, pero está vieja" = yes; "Sí… bueno, no, solo Facebook" = no. Si hubo una aclaración después, decide con ella.
2. "answered": los "id" de las preguntas de la lista que lo que YA dijo responde con claridad, aunque sea con otras palabras o de pasada (p. ej. "la usamos de catálogo y para WhatsApp" responde para qué la usa; "la quiero para este mes" responde para cuándo). No incluyas las que solo toca vagamente.
3. "vague": true si su ÚLTIMA respuesta a la pregunta actual es demasiado vaga para servir (p. ej. a "¿para cuándo?" respondió solo "pronto" o "más adelante", sin semanas ni meses). false si no.
4. "wants": SOLO si en su ÚLTIMA respuesta dijo explícitamente que quiere, le gustaría o necesita algo nuevo o una mejora ("me gustaría agregar pagos", "quiero una web", "I'd like faster checkout") y NO dijo para cuándo: qué quiere en pocas palabras. Una queja o un problema ("la app es lenta", "el envío es caro") NO es querer algo: null.
Responde SOLO JSON: {"intent": "yes" | "no" | "unclear" | null, "answered": string[], "vague": boolean, "wants": string | null}.`,
      JSON.stringify({
        preguntas: describeQuestions([main], true),
        pregunta_actual: `[${q.id}] ${q.text}`,
        lo_que_dijo: text,
      }),
      z.object({
        intent: z.enum(["yes", "no", "unclear"]).nullable().catch(null),
        answered: z.array(z.string().max(40)).max(40).catch([]),
        vague: z.boolean().catch(false),
        wants: z.string().max(120).nullable().catch(null),
      }),
      "none", // mid-conversation: Emily is waiting on it
    );
    logger.info("readAnswer", { questionId, ...out });
    const ids = new Set(flatten([main]).map((n) => n.q.id));
    return {
      intent: hasBranches(q) ? out.intent : null,
      answered: out.answered.filter((id) => ids.has(id) && id !== main.id),
      vague: out.vague,
      wants: out.wants?.trim() || null,
    };
  } catch (err) {
    logger.error("readAnswer failed", { err: String(err) });
    return null;
  }
}

export type { InterviewSummary };

/** Structured result of the test interview (what the team would receive by email/Notion). */
export async function summarizeInterview(slug: string, history: Turn[]): Promise<InterviewSummary> {
  await allow("summary");
  const draft = await openEmily(slug);
  const turns = historySchema.parse(history);
  const qs = draft.questions.map((q) => q.text).filter((q) => q.trim());
  const branched = draft.questions.some(hasBranches);
  const none = draft.locale === "es" ? "Sin respuesta" : "No answer";

  if (hasLlm()) {
    try {
      const result = await askJson(
        `Resume una entrevista de investigación. Escribe TODO el texto (summary, insights, answers, reason, listas) en ${draft.locale === "es" ? "español" : "inglés (English)"}; las citas, tal como las dijo.
Objetivo: ${draft.objective}.
Preguntas (con id; las de una rama "Si AFIRMATIVA"/"Si NEGATIVA" solo aplican si la respuesta llevó ahí):
${describeQuestions(draft.questions, true)}
Evalúa con rigor si se obtuvo la información de CADA pregunta principal${branched ? " y de cada pregunta de la rama que se recorrió" : ""}:
- "completa": respondió con información concreta y útil para el objetivo.
- "parcial": respondió vago, incompleto o solo una parte.
- "sin_respuesta": no se preguntó, no respondió o evadió.
Extrae también la información importante para el objetivo, SOLO lo que el participante dijo (no inventes):
- "keyFacts": datos concretos (cifras, herramientas, nombres, fechas, procesos, precios). Frases cortas.
- "painPoints": problemas, frustraciones o necesidades que expresó.
- "quotes": 1-4 citas textuales, literales y cortas, que capturen su punto de vista.
- "nextSteps": oportunidades o próximos pasos recomendados para el equipo a partir de lo dicho.
- "opportunities": TODO lo que el participante dijo querer tener, crear o mejorar (en cualquier pregunta), cada cosa con "item" (qué, corto), "timeline" (para cuándo) y "detail" (sus palabras sobre el plazo, si las dijo). [] si no quiere nada nuevo.
- "timeline" (también en la respuesta de cada pregunta sobre "para cuándo", y en cualquier respuesta donde diga cuándo quiere algo nuevo o una mejora):
  · "asap": "ya", "lo antes posible", "este mes", "urgente", "para ayer".
  · "short": "en uno o dos meses", "antes de diciembre", "pronto", semanas.
  · "long": "el otro año", "en unos seis meses", "cuando tenga plata", "más adelante".
  · "not_now": "por ahora no", "no lo necesito todavía", "no es prioridad".
  · "unknown": no sabe o no lo dijo.
Listas vacías si no hay información suficiente.
${
  branched
    ? `Para cada pregunta sí/no con ramas: "branchTaken" = "yes" si la respuesta fue afirmativa por su sentido (aunque no dijera "sí"), "no" si fue negativa, "n/a" si no se llegó a responder; si hubo que interpretar o aclarar, explícalo en "ambiguityNote" (1 frase). "route": la ruta seguida en palabras cortas (p. ej. "Tiene web → funciones → problemas"). En "followUps", una entrada por cada pregunta de la rama recorrida (con su questionId); las de la otra rama NO las incluyas.
`
    : ""
}Responde SOLO JSON: {"summary": 2-4 frases, "insights": 2-5 hallazgos accionables, "answers": [{"questionId": id de la pregunta principal, "question": pregunta principal (una por cada una, en orden), "answer": lo que respondió en 1-2 frases o "${none}", "status": "completa"|"parcial"|"sin_respuesta"${branched ? `, "branchTaken"?: "yes"|"no"|"n/a", "route"?: string, "ambiguityNote"?: string, "followUps"?: [{"questionId": string, "question": string, "answer": string, "status": "completa"|"parcial"|"sin_respuesta", "branchTaken"?: "yes"|"no"|"n/a", "timeline"?: "asap"|"short"|"long"|"not_now"|"unknown"}]` : ""}, "timeline"?: "asap"|"short"|"long"|"not_now"|"unknown"}], "objective": {"met": boolean (¿la entrevista cumplió el objetivo?), "reason": 1 frase}, "keyFacts": [], "painPoints": [], "quotes": [], "nextSteps": [], "opportunities": [{"item": string, "timeline": "asap"|"short"|"long"|"not_now"|"unknown", "detail"?: string}]}.`,
        JSON.stringify({ history: turns }),
        summarySchema,
      );
      // The model often wraps quotes in quotation marks; the templates add their own.
      const unquote = (q: string) => q.replace(/^[\s"“”'«»]+|[\s"“”'«»]+$/g, "");
      return {
        ...result,
        answers: settleBranches(draft.questions, result.answers, draft.locale),
        quotes: result.quotes.map(unquote).filter(Boolean),
      };
    } catch (err) {
      logger.error("summarizeInterview LLM failed, using local fallback", { err: String(err) });
    }
  }

  // Local fallback: answers in order; length as a rough proxy for completeness.
  const said = turns.filter((t) => t.role === "participant").map((t) => t.text);
  const answers = qs.map((q, i) => {
    const a = said[i]?.trim() ?? "";
    const status = !a ? "sin_respuesta" : a.split(/\s+/).length >= 6 ? "completa" : "parcial";
    return { questionId: draft.questions[i]?.id, question: q, answer: a || none, status } as const;
  });
  const met = answers.filter((a) => a.status === "completa").length >= Math.ceil(qs.length * 0.8);
  return {
    summary: "Resumen generado sin IA: estas son las respuestas en orden.",
    insights: [],
    keyFacts: answers.filter((a) => a.status === "completa").map((a) => a.answer),
    painPoints: [],
    quotes: said.filter((t) => t.split(/\s+/).length >= 8).slice(0, 3),
    nextSteps: [],
    opportunities: [],
    answers: settleBranches(draft.questions, answers, draft.locale),
    objective: {
      met,
      reason: met
        ? "Se respondieron la mayoría de las preguntas con detalle."
        : "Faltan respuestas o fueron muy breves.",
    },
  };
}
