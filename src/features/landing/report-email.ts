import type { InterviewSummary, Turn } from "./ai";
import { coverage, verdict, type AnswerStatus, type Draft } from "./config";
import { reportLabels } from "./report-i18n";

// Email-safe HTML: tables + inline styles (Gmail strips <style> and most layout CSS).
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const VIOLET = "#2a1063";
const ACCENT = "#6d28d9";
const MUTED = "#5f5a72";
const tone = { ok: "#059669", mid: "#d97706", low: "#dc2626" } as const;
const statusColor: Record<AnswerStatus, string> = {
  completa: "#059669",
  parcial: "#d97706",
  sin_respuesta: "#dc2626",
};

/** The interview report Emily emails when an interview ends, ordered for a quick read. */
export function renderInterviewEmail({
  draft,
  summary,
  history,
  at,
}: {
  draft: Draft;
  summary: InterviewSummary;
  history: Turn[];
  at: Date;
}) {
  const pct = coverage(summary.answers);
  const L = reportLabels(draft.locale);
  const v = { tone: verdict(pct).tone, label: L.verdict[verdict(pct).tone] };
  const who = [draft.recipientName, draft.company].filter(Boolean).join(" · ") || L.anonymous;
  const when = at.toLocaleString(draft.locale, { dateStyle: "long", timeStyle: "short" });
  const subject = `${L.completed} · ${draft.project} · ${pct}% (${v.label})`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:${MUTED};width:38%;vertical-align:top">${esc(label)}</td><td style="padding:6px 0;font-weight:600">${esc(value)}</td></tr>`;
  const h2 = (t: string) =>
    `<h2 style="margin:28px 0 12px;font-size:16px;color:${VIOLET}">${esc(t)}</h2>`;

  const list = (items: string[] | undefined, title: string) =>
    items?.length
      ? `${h2(title)}<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
      : "";
  const questions = `<ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.7">${draft.questions
    .map(
      (q) =>
        `<li>${esc(q.text)} <span style="color:${MUTED};font-size:12px">· ${L.kind[q.kind]}</span></li>`,
    )
    .join("")}</ol>`;
  const quotes = (summary.quotes ?? [])
    .map(
      (q) =>
        `<p style="margin:8px 0;padding:8px 14px;border-left:3px solid ${ACCENT};background:#f7f6fb;font-style:italic;font-size:15px">“${esc(q)}”</p>`,
    )
    .join("");

  const answers = summary.answers
    .map((a, i) => {
      const [label, color] = [L.status[a.status], statusColor[a.status]];
      return `<tr><td style="padding:14px 0;border-top:1px solid #e4e0ee">
        <div style="font-size:13px;color:${MUTED}">${i + 1}. ${esc(a.question)}
          <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:${color}1a;color:${color};font-size:11px;font-weight:600">${label}</span></div>
        <div style="margin-top:6px;font-size:15px">${esc(a.answer)}</div>
      </td></tr>`;
    })
    .join("");

  const transcript = history
    .map(
      (t) =>
        `<p style="margin:6px 0;font-size:13px"><strong style="color:${t.role === "emily" ? ACCENT : "#111"}">${t.role === "emily" ? "Emily" : esc(draft.recipientName || L.participant)}:</strong> ${esc(t.text)}</p>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f7f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17131f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:${VIOLET};padding:24px 28px;color:#fff">
    <div style="font-size:12px;letter-spacing:3px;font-weight:700">NEO<span style="color:#c4b5fd">ERA</span> · EMILY</div>
    <div style="margin-top:10px;font-size:22px;font-weight:700">${esc(draft.project)}</div>
    <div style="margin-top:4px;font-size:14px;color:#ddd6fe">${L.completed} · ${esc(when)}</div>
  </td></tr>
  <tr><td style="padding:24px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="width:120px;vertical-align:middle">
        <div style="width:96px;height:96px;border-radius:50%;border:8px solid ${tone[v.tone]};text-align:center;line-height:96px;font-size:26px;font-weight:700">${pct}%</div>
      </td>
      <td style="vertical-align:middle">
        <div><span style="padding:4px 12px;border-radius:999px;background:${tone[v.tone]};color:#fff;font-size:13px;font-weight:700">${v.label}</span></div>
        <div style="margin-top:8px;font-size:14px"><strong>${summary.objective.met ? L.met : L.notMet}</strong> ${esc(summary.objective.reason)}</div>
        <div style="margin-top:4px;font-size:12px;color:${MUTED}">${L.pctNote}</div>
      </td>
    </tr></table>

    ${h2(L.data)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
      ${row(L.participant, who)}
      ${row(L.objective, draft.objective)}
      ${row(L.language, L.langName)}
      ${row(L.questions, String(draft.questions.length))}
    </table>

    ${h2(L.interviewQuestions)}
    ${questions}

    ${h2(L.summary)}
    <p style="margin:0;font-size:15px;line-height:1.6">${esc(summary.summary)}</p>

    ${list(summary.keyFacts, L.keyFacts)}
    ${list(summary.painPoints, L.pains)}
    ${list(summary.insights, L.insights)}
    ${quotes ? `${h2(L.quotes)}${quotes}` : ""}
    ${list(summary.nextSteps, L.nextSteps)}

    ${h2(L.perQuestion)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${answers}</table>

    ${h2(L.conversation)}
    <div style="padding:12px 16px;background:#f7f6fb;border-radius:12px">${transcript}</div>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#f7f6fb;font-size:12px;color:${MUTED}">${L.footer}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${draft.project} — ${L.completed} (${when})`,
    `${L.infoGot}: ${pct}% · ${v.label}`,
    `${summary.objective.met ? L.met : L.notMet} ${summary.objective.reason}`,
    "",
    `${L.participant}: ${who}`,
    `${L.objective}: ${draft.objective}`,
    "",
    L.questions.toUpperCase(),
    ...draft.questions.map((q, i) => `${i + 1}. ${q.text} (${L.kind[q.kind]})`),
    "",
    L.summary.toUpperCase(),
    summary.summary,
    "",
    ...textList(L.keyFacts.toUpperCase(), summary.keyFacts),
    ...textList(L.pains.toUpperCase(), summary.painPoints),
    ...textList(L.insights.toUpperCase(), summary.insights),
    ...textList(
      L.quotes.toUpperCase(),
      summary.quotes?.map((q) => `“${q}”`),
    ),
    ...textList(L.nextSteps.toUpperCase(), summary.nextSteps),
    L.perQuestion.toUpperCase(),
    ...summary.answers.map(
      (a, i) => `${i + 1}. ${a.question} [${L.status[a.status]}]\n   ${a.answer}`,
    ),
    "",
    L.conversation.toUpperCase(),
    ...history.map((t) => `${t.role === "emily" ? "Emily" : L.participant}: ${t.text}`),
  ].join("\n");

  return { subject, html, text };
}

const textList = (title: string, items: string[] | undefined) =>
  items?.length ? [title, ...items.map((x) => `- ${x}`), ""] : [];
