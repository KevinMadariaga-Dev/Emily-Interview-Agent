"use client";

// Shared UI pieces for the landing and the public Emily page.

export type Msg = { from: "emily" | "you"; text: string };

export const field =
  "w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-[15px] transition-colors placeholder:text-muted/70 hover:border-accent/40 focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-50";

export const primary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-accent-foreground shadow-[0_8px_24px_-8px_var(--accent)] transition-[translate,scale,box-shadow] duration-160 ease-out hover:-translate-y-px hover:shadow-[0_12px_28px_-8px_var(--accent)] active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export const quiet =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium transition-[scale,color,border-color] duration-160 ease-out hover:border-accent/40 hover:text-accent active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export function micError(err: unknown) {
  const name = err instanceof Error ? err.name || err.message : "";
  if (name === "NotAllowedError" || String(err).includes("NotAllowedError"))
    return "Necesito permiso para usar tu micrófono (ícono del candado en la barra de direcciones).";
  return err instanceof Error ? err.message : "No pude abrir el micrófono.";
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
export function BubbleTrail({ feed }: { feed: Msg[] }) {
  const recent = feed.slice(-8);
  return (
    <ol
      aria-label={`${feed.length} mensajes en la conversación`}
      className="flex w-full max-w-[13rem] flex-col gap-1.5"
    >
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
