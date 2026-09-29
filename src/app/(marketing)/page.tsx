import Link from "next/link";
import { Card } from "@/components/ui/card";
import { features, steps } from "@/features/marketing/content";

/** Landing page #1 — public marketing page for Emily. */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6">
      <section className="py-20 md:py-28">
        <p className="text-accent mb-4 text-sm font-medium">AI customer-discovery interviews</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Talk to your customers at scale. Emily runs the interview for you.
        </h1>
        <p className="text-muted mt-6 max-w-2xl text-lg">
          Share a link, Emily interviews by voice in Spanish or English, and you receive a
          structured summary by email and in Notion.
        </p>
        <div className="mt-10 flex gap-3">
          <Link
            href="/admin"
            className="bg-accent text-accent-foreground rounded-lg px-5 py-3 text-sm font-medium"
          >
            Create an interview
          </Link>
          <a
            href="#how-it-works"
            className="border-border rounded-lg border px-5 py-3 text-sm font-medium"
          >
            How it works
          </a>
        </div>
      </section>

      <section id="how-it-works" className="py-16">
        <h2 className="mb-8 text-2xl font-semibold">How it works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <Card key={s.title}>
              <span className="text-muted font-mono text-sm">0{i + 1}</span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="text-muted mt-2 text-sm">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="features" className="py-16">
        <h2 className="mb-8 text-2xl font-semibold">Features</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-muted mt-2 text-sm">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
