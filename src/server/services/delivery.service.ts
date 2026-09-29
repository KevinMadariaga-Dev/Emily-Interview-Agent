import "server-only";
import { env, requireEnv } from "@/lib/env";
import { NotFoundError } from "@/lib/errors";
import { getEmailProvider } from "@/integrations/email";
import { renderInterviewReport } from "@/integrations/email/templates/interview-report";
import { notionRequest } from "@/integrations/notion/client";
import { toNotionPage } from "@/integrations/notion/mapper";
import { interviewRepository as repo } from "@/server/repositories/interview.repository";
import { interviewSummarySchema } from "./summary.schema";

async function load(sessionId: string) {
  const data = await repo.getSessionWithTemplate(sessionId);
  const summaryRow = await repo.getSummary(sessionId);
  if (!data || !summaryRow) throw new NotFoundError("Session or summary not found");
  return { ...data, summaryRow, summary: interviewSummarySchema.parse(summaryRow.data) };
}

/** Delivers the processed interview to external systems ("se envía al correo y se guarda en Notion"). */
export const deliveryService = {
  async sendEmail(sessionId: string) {
    const { session, template, summaryRow, summary } = await load(sessionId);
    if (summaryRow.emailSentAt) return; // idempotent

    const to = env()
      .EMAIL_REPORT_TO.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (to.length === 0) throw new Error("EMAIL_REPORT_TO is empty");

    const report = renderInterviewReport({
      templateName: template.name,
      participantName: session.participantName,
      summary,
      adminUrl: `${env().NEXT_PUBLIC_APP_URL}/admin/sessions/${sessionId}`,
    });
    await getEmailProvider().send({ to, ...report }, `email:${sessionId}`);
    await repo.markSummary(sessionId, { emailSentAt: new Date() });
  },

  async syncNotion(sessionId: string) {
    const { session, template, summaryRow, summary } = await load(sessionId);
    if (summaryRow.notionPageId) return; // idempotent

    const page = toNotionPage({
      dataSourceId: requireEnv("NOTION_DATA_SOURCE_ID"),
      sessionId,
      templateName: template.name,
      participantName: session.participantName,
      locale: session.locale,
      completedAt: session.completedAt ?? new Date(),
      summary,
    });
    const created = await notionRequest<{ id: string }>("/pages", { method: "POST", body: page });
    await repo.markSummary(sessionId, { notionPageId: created.id, notionSyncedAt: new Date() });
  },
};
