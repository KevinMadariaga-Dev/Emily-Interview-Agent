import type { AnswerStatus, QuestionKind } from "./config";

/**
 * Labels of the emailed / Notion reports, in the Emily's language (draft.locale). Kept apart from
 * i18n.tsx because that one is a client module and reports are built on the server.
 */
const labels = {
  es: {
    anonymous: "Participante anónimo",
    participant: "Participante",
    completed: "Entrevista completada",
    verdict: { ok: "Éxito", mid: "Parcial", low: "Insuficiente" },
    status: { completa: "Completa", parcial: "Parcial", sin_respuesta: "Sin respuesta" },
    kind: { abierta: "abierta", cerrada: "cerrada" },
    met: "Objetivo cumplido.",
    notMet: "Objetivo no cumplido.",
    pctNote: "Porcentaje de la información obligatoria obtenida (completa = 1, parcial = ½).",
    pctLine: (pct: number) => `${pct}% de la información obtenida`,
    infoGot: "Información obtenida",
    data: "Datos de la entrevista",
    objective: "Objetivo",
    language: "Idioma",
    langName: "Español",
    questions: "Preguntas",
    nQuestions: (n: number) => `${n} ${n === 1 ? "pregunta" : "preguntas"}`,
    interviewQuestions: "Preguntas de la entrevista",
    summary: "Resumen",
    keyFacts: "Información clave",
    pains: "Dolores y problemas",
    insights: "Hallazgos",
    quotes: "Citas del participante",
    nextSteps: "Próximos pasos y oportunidades",
    perQuestion: "Respuestas por pregunta",
    qa: "Preguntas y respuestas",
    conversation: "Conversación completa",
    questionKind: (k: string) => `pregunta ${k}`,
    answerSummary: "Resumen de la respuesta: ",
    noAnswer: "Sin respuesta",
    said: "Lo que dijo:",
    footer: "Enviado automáticamente por Emily al terminar la entrevista.",
  },
  en: {
    anonymous: "Anonymous participant",
    participant: "Participant",
    completed: "Interview completed",
    verdict: { ok: "Success", mid: "Partial", low: "Insufficient" },
    status: { completa: "Complete", parcial: "Partial", sin_respuesta: "No answer" },
    kind: { abierta: "open", cerrada: "closed" },
    met: "Goal met.",
    notMet: "Goal not met.",
    pctNote: "Share of the required information obtained (complete = 1, partial = ½).",
    pctLine: (pct: number) => `${pct}% of the information gathered`,
    infoGot: "Information gathered",
    data: "Interview details",
    objective: "Goal",
    language: "Language",
    langName: "English",
    questions: "Questions",
    nQuestions: (n: number) => `${n} ${n === 1 ? "question" : "questions"}`,
    interviewQuestions: "Interview questions",
    summary: "Summary",
    keyFacts: "Key information",
    pains: "Pain points",
    insights: "Findings",
    quotes: "Participant quotes",
    nextSteps: "Next steps and opportunities",
    perQuestion: "Answers by question",
    qa: "Questions and answers",
    conversation: "Full conversation",
    questionKind: (k: string) => `${k} question`,
    answerSummary: "Answer summary: ",
    noAnswer: "No answer",
    said: "What they said:",
    footer: "Sent automatically by Emily when the interview ended.",
  },
} satisfies Record<"es" | "en", unknown>;

type ReportLabels = (typeof labels)["es"] & {
  status: Record<AnswerStatus, string>;
  kind: Record<QuestionKind, string>;
};
const byLocale: Record<"es" | "en", ReportLabels> = labels; // en must have every es label

export const reportLabels = (locale: "es" | "en") => byLocale[locale] ?? byLocale.es;
