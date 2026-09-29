import type { InterviewSummary } from "@/server/services/summary.schema";

/**
 * Plain HTML template (no extra deps). Upgrade path: React Email (`@react-email/components`)
 * rendering to HTML with the same inputs.
 */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderInterviewReport(input: {
  templateName: string;
  participantName: string | null;
  summary: InterviewSummary;
  adminUrl: string;
}) {
  const { summary } = input;
  const who = input.participantName ?? "Anonymous participant";
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;color:#111">
    <h2>New interview completed — ${esc(input.templateName)}</h2>
    <p><strong>Participant:</strong> ${esc(who)}</p>
    <h3>Summary</h3><p>${esc(summary.executiveSummary)}</p>
    <h3>Key pain points</h3>${list(summary.painPoints)}
    <h3>Insights</h3>${list(summary.insights)}
    <h3>Notable quotes</h3>${list(summary.quotes)}
    <p><strong>Sentiment:</strong> ${esc(summary.sentiment)} · <strong>Objective met:</strong> ${summary.objectiveMet ? "Yes" : "No"}</p>
    <p><a href="${esc(input.adminUrl)}">Open full transcript in the admin panel →</a></p>
  </div>`;

  const text = [
    `New interview completed — ${input.templateName}`,
    `Participant: ${who}`,
    "",
    summary.executiveSummary,
    "",
    "Pain points:",
    ...summary.painPoints.map((p) => `- ${p}`),
    "",
    `Full transcript: ${input.adminUrl}`,
  ].join("\n");

  return { subject: `[Emily] Interview completed: ${who} — ${input.templateName}`, html, text };
}
