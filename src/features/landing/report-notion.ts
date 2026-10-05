import type { InterviewSummary, Turn } from "./ai";
import { coverage, verdict, type AnswerStatus, type Draft } from "./config";
import schema from "./notion-schema.json";

/**
 * Columns of the "Emily · Entrevistas" database. Shared with `scripts/notion-setup.mjs`, which
 * creates the database; page properties below must use exactly these names.
 */
export const NOTION_PROPERTIES = schema;

const statusText: Record<AnswerStatus, string> = {
  completa: "✅ Completa",
  parcial: "🟡 Parcial",
  sin_respuesta: "🔴 Sin respuesta",
};

// Notion caps rich_text at 2000 chars per object and 100 children per request.
const rt = (content: string, bold = false) => [
  { type: "text", text: { content: content.slice(0, 2000) }, annotations: { bold } },
];
const heading = (text: string) => ({ type: "heading_2", heading_2: { rich_text: rt(text) } });
const paragraph = (text: string) => ({ type: "paragraph", paragraph: { rich_text: rt(text) } });
const bullet = (text: string) => ({
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: rt(text) },
});
const numbered = (rich_text: ReturnType<typeof rt>) => ({
  type: "numbered_list_item",
  numbered_list_item: { rich_text },
});
const quote = (text: string) => ({ type: "quote", quote: { rich_text: rt(`“${text}”`) } });
const todo = (text: string) => ({ type: "to_do", to_do: { rich_text: rt(text), checked: false } });
/** Heading + items, or nothing when the list is empty. */
const section = <T>(title: string, items: string[] | undefined, block: (t: string) => T) =>
  items?.length ? [heading(title), ...items.map(block)] : [];

/** Same report as the email, as a Notion page: properties for filtering + ordered body blocks. */
export function toNotionInterviewPage({
  dataSourceId,
  draft,
  summary,
  history,
  at,
}: {
  dataSourceId: string;
  draft: Draft;
  summary: InterviewSummary;
  history: Turn[];
  at: Date;
}) {
  const pct = coverage(summary.answers);
  const v = verdict(pct);
  const who = draft.recipientName || "Participante anónimo";

  return {
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    icon: { type: "emoji", emoji: v.tone === "ok" ? "🟢" : v.tone === "mid" ? "🟡" : "🔴" },
    properties: {
      Entrevista: { title: rt(`${who} · ${draft.project}`) },
      Proyecto: { rich_text: rt(draft.project) },
      Participante: { rich_text: rt(who) },
      Empresa: { rich_text: rt(draft.company || "—") },
      Fecha: { date: { start: at.toISOString() } },
      "Información obtenida": { number: pct / 100 },
      Veredicto: { select: { name: v.label } },
      "Objetivo cumplido": { checkbox: summary.objective.met },
      Idioma: { select: { name: draft.locale === "es" ? "Español" : "English" } },
      Preguntas: { number: draft.questions.length },
    },
    children: [
      ...[
        {
          type: "callout",
          callout: {
            icon: { type: "emoji", emoji: "📊" },
            color:
              v.tone === "ok"
                ? "green_background"
                : v.tone === "mid"
                  ? "yellow_background"
                  : "red_background",
            rich_text: [
              ...rt(`${pct}% de la información obtenida · ${v.label}\n`, true),
              ...rt(
                `${summary.objective.met ? "Objetivo cumplido." : "Objetivo no cumplido."} ${summary.objective.reason}`,
              ),
            ],
          },
        },
        heading("Datos de la entrevista"),
        bullet(
          `Participante: ${[draft.recipientName, draft.company].filter(Boolean).join(" · ") || "Anónimo"}`,
        ),
        bullet(`Objetivo: ${draft.objective}`),
        bullet(`Idioma: ${draft.locale === "es" ? "Español" : "English"}`),
        heading("Preguntas de la entrevista"),
        ...draft.questions.map((q) => numbered([...rt(q.text), ...rt(`  · ${q.kind}`)])),
        heading("Resumen"),
        paragraph(summary.summary),
        ...section("Información clave", summary.keyFacts, bullet),
        ...section("Dolores y problemas", summary.painPoints, bullet),
        ...section("Hallazgos", summary.insights, bullet),
        ...section("Citas del participante", summary.quotes, quote),
        ...section("Próximos pasos y oportunidades", summary.nextSteps, todo),
        heading("Respuestas por pregunta"),
        ...summary.answers.map((a, i) => ({
          type: "toggle",
          toggle: {
            rich_text: [...rt(`${i + 1}. ${a.question}  `, true), ...rt(statusText[a.status])],
            children: [paragraph(a.answer)],
          },
        })),
      ].slice(0, 99), // Notion: max 100 blocks per request; the transcript always fits last
      {
        type: "toggle",
        toggle: {
          rich_text: rt("Conversación completa", true),
          children: history
            .slice(0, 100)
            .map((t) => paragraph(`${t.role === "emily" ? "Emily" : who}: ${t.text}`)),
        },
      },
    ],
  };
}
