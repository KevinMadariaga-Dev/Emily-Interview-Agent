// Simplified brand marks for the "Conectar con…" buttons.

export function GmailLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#4285F4" d="M6 38h7V21L4 14v21a3 3 0 0 0 2 3z" />
      <path fill="#34A853" d="M35 38h7a3 3 0 0 0 2-3V14l-9 7z" />
      <path fill="#FBBC04" d="M35 11v10l9-7v-3c0-3.7-4.2-5.8-7.2-3.6z" />
      <path fill="#EA4335" d="M13 21V11l11 8.2L35 11v10l-11 8.2z" />
      <path fill="#C5221F" d="M4 11v3l9 7V11l-1.8-1.6C8.2 7.2 4 9.3 4 11z" />
    </svg>
  );
}

export function NotionLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="5" y="5" width="38" height="38" rx="6" fill="#fff" stroke="#111" strokeWidth="3" />
      <path fill="#111" d="M15 13h5l10 15V13h4v22h-5L19 20v15h-4z" />
    </svg>
  );
}
