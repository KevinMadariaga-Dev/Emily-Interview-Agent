import type { InterviewSummary } from "@/server/services/summary.schema";

/**
 * Maps an interview summary to Notion page properties + body blocks.
 * Expected properties in the "Emily Interviews" database (names must match exactly):
 *   Name (title) · Template (select) · Participant (rich_text) · Language (select)
 *   Date (date) · Sentiment (select) · Objective met (checkbox) · Session ID (rich_text)
 */
const rt = (content: string) => [{ type: "text", text: { content: content.slice(0, 2000) } }];

export function toNotionPage(input: {
  dataSourceId: string;
  sessionId: string;
  templateName: string;
  participantName: string | null;
  locale: string;
  completedAt: Date;
  summary: InterviewSummary;
}) {
  const s = input.summary;
  const bullet = (text: string) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: rt(text) },
  });
  const heading = (text: string) => ({
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: rt(text) },
  });

  return {
    parent: { type: "data_source_id", data_source_id: input.dataSourceId },
    properties: {
      Name: { title: rt(`${input.participantName ?? "Anonymous"} — ${input.templateName}`) },
      Template: { select: { name: input.templateName.slice(0, 100) } },
      Participant: { rich_text: rt(input.participantName ?? "Anonymous") },
      Language: { select: { name: input.locale.toUpperCase() } },
      Date: { date: { start: input.completedAt.toISOString() } },
      Sentiment: { select: { name: s.sentiment } },
      "Objective met": { checkbox: s.objectiveMet },
      "Session ID": { rich_text: rt(input.sessionId) },
    },
    children: [
      heading("Executive summary"),
      { object: "block", type: "paragraph", paragraph: { rich_text: rt(s.executiveSummary) } },
      heading("Pain points"),
      ...s.painPoints.map(bullet),
      heading("Insights"),
      ...s.insights.map(bullet),
      heading("Quotes"),
      ...s.quotes.map(bullet),
      heading("Next steps"),
      ...s.nextSteps.map(bullet),
    ],
  };
}
