import type { InterviewSummary, Turn } from "./ai";
import { coverage, verdict, type AnswerStatus, type Draft } from "./config";
import schema from "./notion-schema.json";

/**
 * Columns of the "Emily · Entrevistas" database. Shared with `scripts/notion-setup.mjs`, which
 * creates the database; page properties below must use exactly these names.
 */
export const NOTION_PROPERTIES = schema;

/** Notion accepts at most 100 blocks per request; the rest is appended in batches. */
export const NOTION_BATCH = 100;

const statusText: Record<AnswerStatus, string> = {
  completa: "✅ Completa",
  parcial: "🟡 Parcial",
  sin_respuesta: "🔴 Sin respuesta",
};

type RichText = { type: "text"; text: { content: string }; annotations: { bold: boolean } };

/**
 * Full text as rich_text: Notion caps each text object at 2000 chars, so long text is split
 * into consecutive pieces instead of being cut (up to 100 pieces ≈ 200k chars per block).
 */
const rt = (content: string, bold = false): RichText[] => {
  const pieces: RichText[] = [];
  for (let i = 0; i < Math.max(content.length, 1) && pieces.length < 100; i += 2000)
    pieces.push({
      type: "text",
      text: { content: content.slice(i, i + 2000) },
      annotations: { bold },
    });
  return pieces;
};
const heading = (text: string) => ({ type: "heading_2", heading_2: { rich_text: rt(text) } });
const subheading = (text: string) => ({ type: "heading_3", heading_3: { rich_text: rt(text) } });
const paragraph = (rich_text: RichText[]) => ({ type: "paragraph", paragraph: { rich_text } });
const bullet = (text: string) => ({
  type: "bulleted_list_item",
  bulleted_list_item: { rich_text: rt(text) },
});
const quote = (text: string) => ({ type: "quote", quote: { rich_text: rt(`“${text}”`) } });
const todo = (text: string) => ({ type: "to_do", to_do: { rich_text: rt(text), checked: false } });
const divider = { type: "divider", divider: {} };
/** Heading + items, or nothing when the list is empty. */
const section = <T>(title: string, items: string[] | undefined, block: (t: string) => T) =>
  items?.length ? [heading(title), ...items.map(block)] : [];

/**
 * The whole interview as a Notion page, everything visible (no collapsed toggles, no cut text):
 * score, data, summary, each question with Emily's summary of the answer and the participant's
 * own words, extracted insights, and the full conversation. `children` may exceed 100 blocks:
 * send the first NOTION_BATCH with the page and append the rest (see saveInterviewToNotion).
 */
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

  // Participant turns tagged with the question they answer (older histories have no tag).
  const saidFor = (i: number) =>
    history.filter((t) => t.role === "participant" && t.q === i).map((t) => t.text);

  const qa = draft.questions.flatMap((q, i) => {
    const a = summary.answers[i];
    const said = saidFor(i);
    return [
      subheading(`${i + 1}. ${q.text}`),
      paragraph([
        ...rt(`${a ? statusText[a.status] : "🔴 Sin respuesta"} · pregunta ${q.kind}`, true),
      ]),
      paragraph([...rt("Resumen de la respuesta: ", true), ...rt(a?.answer || "Sin respuesta")]),
      ...(said.length ? [paragraph(rt("Lo que dijo:", true)), ...said.map(quote)] : []),
    ];
  });

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
      bullet(
        `Idioma: ${draft.locale === "es" ? "Español" : "English"} · ${draft.questions.length} preguntas`,
      ),
      heading("Resumen"),
      paragraph(rt(summary.summary)),
      ...section("Información clave", summary.keyFacts, bullet),
      ...section("Dolores y problemas", summary.painPoints, bullet),
      ...section("Hallazgos", summary.insights, bullet),
      ...section("Citas del participante", summary.quotes, quote),
      ...section("Próximos pasos y oportunidades", summary.nextSteps, todo),
      divider,
      heading("Preguntas y respuestas"),
      ...qa,
      divider,
      heading("Conversación completa"),
      ...history.map((t) =>
        paragraph([...rt(`${t.role === "emily" ? "Emily" : who}: `, true), ...rt(t.text)]),
      ),
    ],
  };
}
