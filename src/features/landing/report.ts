"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { emailProviderName, getEmailProvider } from "@/integrations/email";
import { notionRequest } from "@/integrations/notion/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { InterviewSummary, Turn } from "./ai";
import { emilyRepository } from "@/server/repositories/emily.repository";
import { normalizeDraft, summarySchema } from "./config";
import { renderInterviewEmail } from "./report-email";
import { NOTION_BATCH, toNotionInterviewPage } from "./report-notion";

export type ReportStatus =
  | { sent: true; to: string; via: "gmail" | "resend" }
  | {
      sent: false;
      reason: "no_recipient" | "not_configured" | "not_allowed" | "rate_limited" | "failed";
    };

const historySchema = z
  .array(
    z.object({
      role: z.enum(["emily", "participant"]),
      text: z.string().max(4000),
      q: z.number().int().optional(),
    }),
  )
  .max(200);

/**
 * The report's inputs: the Emily is loaded from the database by slug (so the recipient and
 * questions are the saved ones, never the browser's) and the summary/history are validated.
 */
async function reportInput(slug: string, summary: InterviewSummary, history: Turn[]) {
  const emily = await emilyRepository.find(z.string().max(90).parse(slug));
  if (!emily) return null;
  return {
    draft: normalizeDraft(emily.draft),
    summary: summarySchema.parse(summary),
    history: historySchema.parse(history).slice(0, 80) as Turn[],
  };
}

/** Recipient allowed by REPORT_EMAIL_ALLOWLIST (exact emails or @domains); empty list = any. */
function allowed(to: string) {
  const list = env()
    .REPORT_EMAIL_ALLOWLIST.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return true;
  const email = to.toLowerCase();
  return list.some((rule) => (rule.startsWith("@") ? email.endsWith(rule) : email === rule));
}

/** Emails the finished interview (summary, grades, answers, transcript) to the Emily's report address. */
export async function sendInterviewReport(
  slug: string,
  rawSummary: InterviewSummary,
  rawHistory: Turn[],
): Promise<ReportStatus> {
  const input = await reportInput(slug, rawSummary, rawHistory);
  if (!input) return { sent: false, reason: "no_recipient" };
  const { draft, summary, history } = input;
  const to = z.email().safeParse(draft.reportEmail);
  if (!to.success) return { sent: false, reason: "no_recipient" };

  const via = emailProviderName();
  if (!via) return { sent: false, reason: "not_configured" };
  // The recipient is the saved Emily's; the allowlist + rate limit still cap abuse of the link.
  if (!allowed(to.data)) return { sent: false, reason: "not_allowed" };
  if (!rateLimit(`report:${clientIp(await headers())}`, 5, 10 * 60_000))
    return { sent: false, reason: "rate_limited" };

  try {
    const at = new Date();
    const email = renderInterviewEmail({ draft, summary, history, at });
    await getEmailProvider().send(
      { to: [to.data], subject: email.subject, html: email.html, text: email.text },
      `emily-${draft.project}-${at.getTime()}`,
    );
    return { sent: true, to: to.data, via };
  } catch (err) {
    logger.error("sendInterviewReport failed", { err: String(err), via });
    return { sent: false, reason: "failed" };
  }
}

export type NotionStatus =
  | { saved: true; url: string }
  | { saved: false; reason: "not_configured" | "rate_limited" | "failed" };

/** Saves the finished interview as a page in the "Emily · Entrevistas" Notion database. */
export async function saveInterviewToNotion(
  slug: string,
  rawSummary: InterviewSummary,
  rawHistory: Turn[],
): Promise<NotionStatus> {
  const dataSourceId = env().NOTION_DATA_SOURCE_ID;
  if (!env().NOTION_API_KEY || !dataSourceId) return { saved: false, reason: "not_configured" };
  // TODO(security): public while there is no login — the rate limit caps abuse of the integration.
  if (!rateLimit(`notion:${clientIp(await headers())}`, 5, 10 * 60_000))
    return { saved: false, reason: "rate_limited" };

  try {
    const input = await reportInput(slug, rawSummary, rawHistory);
    if (!input) return { saved: false, reason: "failed" };
    const page = toNotionInterviewPage({ dataSourceId, ...input, at: new Date() });
    // Notion takes ≤100 blocks per request: create the page with the first batch, then append
    // the rest in order so long interviews keep every line.
    const [first, ...rest] = chunks(page.children, NOTION_BATCH);
    const created = await notionRequest<{ id: string; url: string }>("/pages", {
      method: "POST",
      body: { ...page, children: first ?? [] },
    });
    for (const batch of rest)
      await notionRequest(`/blocks/${created.id}/children`, {
        method: "PATCH",
        body: { children: batch },
      });
    return { saved: true, url: created.url };
  } catch (err) {
    logger.error("saveInterviewToNotion failed", { err: String(err) });
    return { saved: false, reason: "failed" };
  }
}

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
