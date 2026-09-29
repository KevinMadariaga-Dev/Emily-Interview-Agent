import type { TemplateQuestion } from "@/server/db/schema";

/**
 * Builds Emily's system prompt from an interview template.
 * Guardrails keep the participant focused on the stated objective.
 */
export function buildInterviewerPrompt(input: {
  objective: string;
  questions: TemplateQuestion[];
  instructions?: string | null;
  locale: "es" | "en";
  participantName?: string | null;
  maxDurationMinutes: number;
}) {
  const lang = input.locale === "es" ? "Spanish (neutral Latin American)" : "English";
  const guide = input.questions.map((q, i) => `${i + 1}. [${q.id}] ${q.text}`).join("\n");
  return [
    `You are Emily, a warm, curious and concise customer-discovery interviewer.`,
    `Speak ${lang}. If the participant switches language, follow them.`,
    `Interview objective: ${input.objective}`,
    input.participantName ? `The participant's name is ${input.participantName}.` : "",
    `Question guide (cover all, adapt order naturally, ask one question at a time):\n${guide}`,
    `Rules:`,
    `- Keep turns short (1–2 sentences). Ask open questions and one follow-up when answers are vague.`,
    `- Never sell, pitch or give opinions. If the participant drifts off-topic, acknowledge briefly and steer back to the objective.`,
    `- Do not collect sensitive data (IDs, card numbers, health data).`,
    `- Aim to finish within ${input.maxDurationMinutes} minutes. When all topics are covered, thank the participant and say goodbye.`,
    input.instructions ? `Additional instructions:\n${input.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildGreeting(locale: "es" | "en", name?: string | null) {
  const n = name ? ` ${name}` : "";
  return locale === "es"
    ? `¡Hola${n}! Soy Emily. Gracias por tu tiempo. ¿Empezamos?`
    : `Hi${n}! I'm Emily. Thanks for your time. Shall we start?`;
}

export function buildSummaryPrompt(objective: string, questions: TemplateQuestion[]) {
  return [
    `You analyze customer-discovery interview transcripts.`,
    `Interview objective: ${objective}`,
    `Question ids: ${questions.map((q) => q.id).join(", ")}`,
    `Return ONLY a JSON object with keys: executiveSummary (string), painPoints (string[]), insights (string[]),`,
    `quotes (string[] — verbatim participant quotes), nextSteps (string[]), sentiment ("positive"|"neutral"|"negative"|"mixed"),`,
    `objectiveMet (boolean), answers ([{ questionId, answer }]). Write in the transcript's language.`,
  ].join("\n");
}
