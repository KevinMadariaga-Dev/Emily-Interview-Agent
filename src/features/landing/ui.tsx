"use client";

// Shared UI pieces for the landing and the public Emily page.

export type Msg = { from: "emily" | "you"; text: string };

export const field =
  "w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-[15px] transition-colors placeholder:text-muted/70 hover:border-accent/40 focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-50";

export const primary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-accent-foreground shadow-[0_8px_24px_-8px_var(--accent)] transition-[translate,scale,box-shadow] duration-160 ease-out hover:-translate-y-px hover:shadow-[0_12px_28px_-8px_var(--accent)] active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export const quiet =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium transition-[scale,color,border-color] duration-160 ease-out hover:border-accent/40 hover:text-accent active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

const MIC_ERRORS = {
  es: {
    denied:
      "Necesito permiso para usar tu micrófono: actívalo en el ícono del candado de la barra de direcciones (en iPhone: Ajustes → Safari → Micrófono).",
    noDictation: "Tu navegador no permite dictado. Usa Chrome o Edge, o escribe tu respuesta.",
    unavailable:
      "Este navegador no da acceso al micrófono. Abre el link en Safari o Chrome (no dentro de WhatsApp o Instagram), o escribe tu respuesta.",
    notFound: "No encontré ningún micrófono. Conecta uno o revisa la configuración de audio.",
    busy: "El micrófono está en uso por otra app (llamada, Zoom, Meet…). Ciérrala y vuelve a intentar.",
    generic: "No pude abrir el micrófono. Revisa el permiso o escribe tu respuesta.",
  },
  en: {
    denied:
      "I need permission to use your microphone: allow it from the padlock icon in the address bar (on iPhone: Settings → Safari → Microphone).",
    noDictation: "Your browser doesn't support dictation. Use Chrome or Edge, or type your answer.",
    unavailable:
      "This browser doesn't give access to the microphone. Open the link in Safari or Chrome (not inside WhatsApp or Instagram), or type your answer.",
    notFound: "I couldn't find a microphone. Connect one or check your audio settings.",
    busy: "The microphone is being used by another app (a call, Zoom, Meet…). Close it and try again.",
    generic: "I couldn't open the microphone. Check the permission or type your answer.",
  },
} as const;

/**
 * Error text fit for the user. Server-action failures reach the browser as React's generic
 * production message ("Minified React error #441…"): show the friendly fallback instead.
 */
export function friendlyError(err: unknown, fallback: string) {
  const msg = err instanceof Error ? err.message : "";
  return !msg ||
    /react\.dev\/errors|digest|Server Components render|omitted in production/i.test(msg)
    ? fallback
    : msg;
}

/** A microphone problem explained in the conversation's language. */
export function micError(err: unknown, lang: "es" | "en" = "es") {
  const m = MIC_ERRORS[lang];
  // Browsers report the cause in the name (DOMException) or in the message (ours): check both.
  const id = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/NotAllowedError|SecurityError|PermissionDenied/.test(id)) return m.denied;
  if (/no-dictation/.test(id)) return m.noDictation;
  if (/mic-unavailable|getUserMedia|mediaDevices/.test(id)) return m.unavailable;
  if (/NotFoundError|DevicesNotFound|OverconstrainedError/.test(id)) return m.notFound;
  if (/NotReadableError|TrackStartError|AbortError|audio source/i.test(id)) return m.busy;
  return friendlyError(err, m.generic);
}

export function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="text-muted hover:bg-accent-soft hover:text-accent grid h-9 w-9 place-items-center rounded-full transition disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Compact conversation trail for Emily's side panel: one bubble glyph per message (Emily left,
 * participant right) instead of the full text, which lives in the main chat. The last one pulses.
 */
export function BubbleTrail({ feed, label }: { feed: Msg[]; label: string }) {
  const recent = feed.slice(-8);
  return (
    <ol aria-label={label} className="flex w-full max-w-[13rem] flex-col gap-1.5">
      {recent.map((m, i) => {
        const last = i === recent.length - 1;
        return (
          <li
            key={feed.length - recent.length + i}
            className={`flex transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-2 starting:scale-90 starting:opacity-0 ${
              m.from === "emily" ? "justify-start" : "justify-end"
            } ${last ? "" : "opacity-50"}`}
          >
            <span
              className={`inline-flex h-7 items-center gap-1 rounded-2xl px-3 ${
                m.from === "emily" ? "rounded-bl-sm bg-white/15" : "rounded-br-sm bg-fuchsia-300/25"
              }`}
              style={{ width: `${Math.min(9, 3.5 + m.text.length / 40)}rem` }}
            >
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className={`h-1.5 w-1.5 rounded-full ${m.from === "emily" ? "bg-white/80" : "bg-fuchsia-100/80"} ${
                    last ? "animate-pulse" : ""
                  }`}
                  style={{ animationDelay: `${d * 150}ms` }}
                />
              ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
