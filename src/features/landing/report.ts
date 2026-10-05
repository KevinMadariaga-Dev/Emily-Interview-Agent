"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { emailProviderName, getEmailProvider } from "@/integrations/email";
import { notionRequest } from "@/integrations/notion/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { InterviewSummary, Turn } from "./ai";
import { normalizeDraft, type Draft } from "./config";
import { renderInterviewEmail } from "./report-email";
import { NOTION_BATCH, toNotionInterviewPage } from "./report-notion";

export type ReportStatus =
  | { sent: true; to: string; via: "gmail" | "resend" }
  | {
      sent: false;
      reason: "no_recipient" | "not_configured" | "not_allowed" | "rate_limited" | "failed";
    };

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
  rawDraft: Draft,
  summary: InterviewSummary,
  history: Turn[],
): Promise<ReportStatus> {
  const draft = normalizeDraft(rawDraft);
  const to = z.email().safeParse(draft.reportEmail);
  if (!to.success) return { sent: false, reason: "no_recipient" };

  const via = emailProviderName();
  if (!via) return { sent: false, reason: "not_configured" };
  // TODO(security): with no login, the recipient comes from the browser — keep the allowlist +
  // rate limit until reports are sent from saved Emilys in the DB.
  if (!allowed(to.data)) return { sent: false, reason: "not_allowed" };
  if (!rateLimit(`report:${clientIp(await headers())}`, 5, 10 * 60_000))
    return { sent: false, reason: "rate_limited" };

  try {
    const at = new Date();
    const email = renderInterviewEmail({ draft, summary, history: history.slice(0, 80), at });
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
  rawDraft: Draft,
  summary: InterviewSummary,
  history: Turn[],
): Promise<NotionStatus> {
  const dataSourceId = env().NOTION_DATA_SOURCE_ID;
  if (!env().NOTION_API_KEY || !dataSourceId) return { saved: false, reason: "not_configured" };
  // TODO(security): public while there is no login — the rate limit caps abuse of the integration.
  if (!rateLimit(`notion:${clientIp(await headers())}`, 5, 10 * 60_000))
    return { saved: false, reason: "rate_limited" };

  try {
    const page = toNotionInterviewPage({
      dataSourceId,
      draft: normalizeDraft(rawDraft),
      summary,
      history,
      at: new Date(),
    });
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
