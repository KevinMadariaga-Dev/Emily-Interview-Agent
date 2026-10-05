"use server";

import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getLlm } from "@/integrations/llm";
import { planFromText, planSchema, type InterviewPlan } from "@/features/demo/plan-fallback";

const SYSTEM = `Eres Emily, asistente que diseña entrevistas de descubrimiento de clientes.
El administrador te describe (a veces dictado por voz, con errores) qué quiere averiguar.
1. Detecta el propósito de la entrevista y el contexto (rubro/negocio).
2. Convierte cada cosa que pidió preguntar en una pregunta clara, abierta y en el idioma del texto.
3. Agrega de 3 a 6 preguntas extra relevantes al contexto (marcadas suggested=true), empezando por una de apertura.
4. Orden lógico: apertura → preguntas del admin → profundización → cierre.
Responde SOLO JSON: {"name": string corto, "objective": string (1-2 frases), "context": string, "questions": [{"text": string, "required": boolean, "suggested": boolean}]}.
Las preguntas pedidas por el admin son required=true y suggested=false.`;

/**
 * Organizes the admin's spoken/typed request into an interview plan.
 * Uses the configured LLM when its key exists; otherwise the local rule-based organizer.
 */
export async function planInterview(
  input: string,
): Promise<{ plan: InterviewPlan; source: "ai" | "local" }> {
  // TODO(security): public while there is no login — add auth or rate limiting before adding an LLM key in production.
  const text = z.string().trim().min(10).max(4000).parse(input);

  const key = env().LLM_PROVIDER === "anthropic" ? env().ANTHROPIC_API_KEY : env().OPENAI_API_KEY;
  if (key) {
    try {
      const raw = await getLlm().completeJson({
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
        temperature: 0.4,
      });
      return { plan: planSchema.parse(JSON.parse(raw)), source: "ai" };
    } catch (err) {
      logger.error("planInterview LLM failed, using local fallback", { err: String(err) });
    }
  }
  return { plan: planFromText(text), source: "local" };
}
