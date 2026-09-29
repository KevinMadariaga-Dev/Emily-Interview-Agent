import "server-only";
import { env } from "@/lib/env";
import { NotFoundError } from "@/lib/errors";
import { getLlm } from "@/integrations/llm";
import { interviewRepository as repo } from "@/server/repositories/interview.repository";
import { buildSummaryPrompt } from "./prompts";
import { interviewSummarySchema, type InterviewSummary } from "./summary.schema";

/** Turns the raw transcript into a validated, structured summary ("se ordena"). */
export const summaryService = {
  async generate(sessionId: string) {
    const data = await repo.getSessionWithTemplate(sessionId);
    if (!data) throw new NotFoundError("Session not found");
    const turns = await repo.getTranscript(sessionId);
    const transcript = turns.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join("\n");

    const raw = await getLlm().completeJson({
      messages: [
        {
          role: "system",
          content: buildSummaryPrompt(data.template.objective, data.template.questions),
        },
        { role: "user", content: transcript || "(empty transcript)" },
      ],
    });
    const summary = interviewSummarySchema.parse(JSON.parse(raw));

    await repo.upsertSummary({
      sessionId,
      data: summary,
      markdown: toMarkdown(summary),
      model: env().LLM_MODEL,
    });
    await repo.updateSession(sessionId, { status: "processed" });
    return summary;
  },
};

export function toMarkdown(s: InterviewSummary): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  return [
    `## Executive summary\n${s.executiveSummary}`,
    `## Pain points\n${list(s.painPoints)}`,
    `## Insights\n${list(s.insights)}`,
    `## Quotes\n${list(s.quotes)}`,
    `## Next steps\n${list(s.nextSteps)}`,
    `**Sentiment:** ${s.sentiment} · **Objective met:** ${s.objectiveMet ? "yes" : "no"}`,
  ].join("\n\n");
}
