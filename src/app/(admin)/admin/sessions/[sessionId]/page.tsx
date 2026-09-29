import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/features/admin/auth";
import { interviewRepository } from "@/server/repositories/interview.repository";

export const metadata = { title: "Session" };

/** Session detail: transcript + structured summary + delivery status (email / Notion). */
export default async function SessionPage(props: PageProps<"/admin/sessions/[sessionId]">) {
  await requireAdmin();
  const { sessionId } = await props.params;
  const data = await interviewRepository.getSessionWithTemplate(sessionId);
  if (!data) notFound();
  const [turns, summary] = await Promise.all([
    interviewRepository.getTranscript(sessionId),
    interviewRepository.getSummary(sessionId),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {data.session.participantName ?? "Anonymous"} — {data.template.name}
        </h1>
        <p className="text-muted text-sm">
          Status: {data.session.status} · Email: {summary?.emailSentAt ? "sent" : "pending"} ·
          Notion: {summary?.notionPageId ? "synced" : "pending"}
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Summary</h2>
          <pre className="text-sm whitespace-pre-wrap">
            {summary?.markdown ?? "Not generated yet."}
          </pre>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Transcript</h2>
          <ol className="space-y-2 text-sm">
            {turns.map((t) => (
              <li key={t.id}>
                <strong>{t.role === "agent" ? "Emily" : "Participant"}:</strong> {t.text}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
