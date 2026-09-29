import Link from "next/link";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Emily
        </Link>
        <nav className="text-muted flex gap-6 text-sm">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <Link href="/admin" className="text-foreground">
            Admin
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="text-muted mx-auto w-full max-w-5xl px-6 py-10 text-sm">
        © {new Date().getFullYear()} NEOera Systems · Emily Interview Agent
      </footer>
    </>
  );
}
