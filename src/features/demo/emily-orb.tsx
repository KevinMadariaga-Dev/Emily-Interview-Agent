const sizes = {
  md: ["h-28 w-28", "h-24 w-24 text-4xl"],
  lg: ["h-40 w-40", "h-32 w-32 text-5xl"],
  xl: ["h-64 w-64", "h-52 w-52 text-7xl"],
} as const;

/** Emily's avatar. `speaking` animates the halo; `listening` shows a green halo (mic open). */
export function EmilyOrb({
  speaking = true,
  listening = false,
  size = "md",
}: {
  speaking?: boolean;
  listening?: boolean;
  size?: keyof typeof sizes;
}) {
  const [box, core] = sizes[size];
  return (
    <div className={`relative grid place-items-center ${box}`} aria-hidden>
      {speaking && (
        <span className="bg-accent/20 absolute inset-0 animate-ping rounded-full [animation-duration:2.5s]" />
      )}
      {listening && (
        <span className="absolute inset-0 animate-pulse rounded-full border-4 border-green-500/60" />
      )}
      <span
        className={`bg-accent text-accent-foreground relative grid place-items-center rounded-full font-semibold transition-transform ${core} ${speaking ? "scale-105" : ""}`}
      >
        E
      </span>
    </div>
  );
}

export function Badge({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
