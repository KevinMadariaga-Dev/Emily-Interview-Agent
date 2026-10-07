import type { InterviewSummary, Turn } from "./ai";
import { coverage, verdict, type AnswerStatus, type Draft } from "./config";
import schema from "./notion-schema.json";
import { reportLabels } from "./report-i18n";

/**
 * Columns of the "Emily · Entrevistas" database. Shared with `scripts/notion-setup.mjs`, which
 * creates the database; page properties below must use exactly these names.
 */
export const NOTION_PROPERTIES = schema;

/** Notion accepts at most 100 blocks per request; the rest is appended in batches. */
export const NOTION_BATCH = 100;

const statusIcon: Record<AnswerStatus, string> = {
  completa: "✅",
  parcial: "🟡",
  sin_respuesta: "🔴",
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
  const v = verdict(pct); // v.label (Spanish) only for the "Veredicto" select: it's the DB schema
  const L = reportLabels(draft.locale);
  const who = draft.recipientName || L.anonymous;

  // Participant turns tagged with the question they answer (older histories have no tag).
  const saidFor = (i: number) =>
    history.filter((t) => t.role === "participant" && t.q === i).map((t) => t.text);

  const qa = draft.questions.flatMap((q, i) => {
    const a = summary.answers[i];
    const said = saidFor(i);
    return [
      subheading(`${i + 1}. ${q.text}`),
      paragraph([
        ...rt(
          `${a ? `${statusIcon[a.status]} ${L.status[a.status]}` : `🔴 ${L.noAnswer}`} · ${L.questionKind(L.kind[q.kind])}`,
          true,
        ),
      ]),
      paragraph([...rt(L.answerSummary, true), ...rt(a?.answer || L.noAnswer)]),
      ...(said.length ? [paragraph(rt(L.said, true)), ...said.map(quote)] : []),
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
            ...rt(`${L.pctLine(pct)} · ${L.verdict[v.tone]}\n`, true),
            ...rt(`${summary.objective.met ? L.met : L.notMet} ${summary.objective.reason}`),
          ],
        },
      },
      heading(L.data),
      bullet(
        `${L.participant}: ${[draft.recipientName, draft.company].filter(Boolean).join(" · ") || L.anonymous}`,
      ),
      bullet(`${L.objective}: ${draft.objective}`),
      bullet(`${L.language}: ${L.langName} · ${L.nQuestions(draft.questions.length)}`),
      heading(L.summary),
      paragraph(rt(summary.summary)),
      ...section(L.keyFacts, summary.keyFacts, bullet),
      ...section(L.pains, summary.painPoints, bullet),
      ...section(L.insights, summary.insights, bullet),
      ...section(L.quotes, summary.quotes, quote),
      ...section(L.nextSteps, summary.nextSteps, todo),
      divider,
      heading(L.qa),
      ...qa,
      divider,
      heading(L.conversation),
      ...history.map((t) =>
        paragraph([...rt(`${t.role === "emily" ? "Emily" : who}: `, true), ...rt(t.text)]),
      ),
    ],
  };
}
