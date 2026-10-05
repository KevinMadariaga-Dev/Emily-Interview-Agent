import type { InterviewSummary, Turn } from "./ai";
import { coverage, verdict, type AnswerStatus, type Draft } from "./config";

// Email-safe HTML: tables + inline styles (Gmail strips <style> and most layout CSS).
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const VIOLET = "#2a1063";
const ACCENT = "#6d28d9";
const MUTED = "#5f5a72";
const tone = { ok: "#059669", mid: "#d97706", low: "#dc2626" } as const;
const statusLabel: Record<AnswerStatus, [string, string]> = {
  completa: ["Completa", "#059669"],
  parcial: ["Parcial", "#d97706"],
  sin_respuesta: ["Sin respuesta", "#dc2626"],
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
  const v = verdict(pct);
  const who =
    [draft.recipientName, draft.company].filter(Boolean).join(" · ") || "Participante anónimo";
  const when = at.toLocaleString("es", { dateStyle: "long", timeStyle: "short" });
  const subject = `Entrevista completada · ${draft.project} · ${pct}% (${v.label})`;

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
        `<li>${esc(q.text)} <span style="color:${MUTED};font-size:12px">· ${q.kind}</span></li>`,
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
      const [label, color] = statusLabel[a.status];
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
        `<p style="margin:6px 0;font-size:13px"><strong style="color:${t.role === "emily" ? ACCENT : "#111"}">${t.role === "emily" ? "Emily" : esc(draft.recipientName || "Participante")}:</strong> ${esc(t.text)}</p>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f7f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17131f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:${VIOLET};padding:24px 28px;color:#fff">
    <div style="font-size:12px;letter-spacing:3px;font-weight:700">NEO<span style="color:#c4b5fd">ERA</span> · EMILY</div>
    <div style="margin-top:10px;font-size:22px;font-weight:700">${esc(draft.project)}</div>
    <div style="margin-top:4px;font-size:14px;color:#ddd6fe">Entrevista completada · ${esc(when)}</div>
  </td></tr>
  <tr><td style="padding:24px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="width:120px;vertical-align:middle">
        <div style="width:96px;height:96px;border-radius:50%;border:8px solid ${tone[v.tone]};text-align:center;line-height:96px;font-size:26px;font-weight:700">${pct}%</div>
      </td>
      <td style="vertical-align:middle">
        <div><span style="padding:4px 12px;border-radius:999px;background:${tone[v.tone]};color:#fff;font-size:13px;font-weight:700">${v.label}</span></div>
        <div style="margin-top:8px;font-size:14px"><strong>${summary.objective.met ? "Objetivo cumplido." : "Objetivo no cumplido."}</strong> ${esc(summary.objective.reason)}</div>
        <div style="margin-top:4px;font-size:12px;color:${MUTED}">Porcentaje de la información obligatoria obtenida (completa = 1, parcial = ½).</div>
      </td>
    </tr></table>

    ${h2("Datos de la entrevista")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
      ${row("Participante", who)}
      ${row("Objetivo", draft.objective)}
      ${row("Idioma", draft.locale === "es" ? "Español" : "English")}
      ${row("Preguntas", String(draft.questions.length))}
    </table>

    ${h2("Preguntas de la entrevista")}
    ${questions}

    ${h2("Resumen")}
    <p style="margin:0;font-size:15px;line-height:1.6">${esc(summary.summary)}</p>

    ${list(summary.keyFacts, "Información clave")}
    ${list(summary.painPoints, "Dolores y problemas")}
    ${list(summary.insights, "Hallazgos")}
    ${quotes ? `${h2("Citas del participante")}${quotes}` : ""}
    ${list(summary.nextSteps, "Próximos pasos y oportunidades")}

    ${h2("Respuestas por pregunta")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${answers}</table>

    ${h2("Conversación completa")}
    <div style="padding:12px 16px;background:#f7f6fb;border-radius:12px">${transcript}</div>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#f7f6fb;font-size:12px;color:${MUTED}">Enviado automáticamente por Emily al terminar la entrevista.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${draft.project} — Entrevista completada (${when})`,
    `Información obtenida: ${pct}% · ${v.label}`,
    `${summary.objective.met ? "Objetivo cumplido" : "Objetivo no cumplido"}: ${summary.objective.reason}`,
    "",
    `Participante: ${who}`,
    `Objetivo: ${draft.objective}`,
    "",
    "PREGUNTAS",
    ...draft.questions.map((q, i) => `${i + 1}. ${q.text} (${q.kind})`),
    "",
    "RESUMEN",
    summary.summary,
    "",
    ...textList("INFORMACIÓN CLAVE", summary.keyFacts),
    ...textList("DOLORES Y PROBLEMAS", summary.painPoints),
    ...textList("HALLAZGOS", summary.insights),
    ...textList(
      "CITAS",
      summary.quotes?.map((q) => `“${q}”`),
    ),
    ...textList("PRÓXIMOS PASOS", summary.nextSteps),
    "RESPUESTAS",
    ...summary.answers.map(
      (a, i) => `${i + 1}. ${a.question} [${statusLabel[a.status][0]}]\n   ${a.answer}`,
    ),
    "",
    "CONVERSACIÓN",
    ...history.map((t) => `${t.role === "emily" ? "Emily" : "Participante"}: ${t.text}`),
  ].join("\n");

  return { subject, html, text };
}

const textList = (title: string, items: string[] | undefined) =>
  items?.length ? [title, ...items.map((x) => `- ${x}`), ""] : [];
