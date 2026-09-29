import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InterviewRoom } from "@/features/interview/components/interview-room";
import { interviewService } from "@/server/services/interview.service";

export const metadata: Metadata = { title: "Interview", robots: { index: false, follow: false } };

/** Landing page #2 — participant opens the shareable link /i/<token> and talks to Emily. */
export default async function InterviewPage(props: PageProps<"/i/[token]">) {
  const { token } = await props.params;
  const link = await interviewService.getPublicLink(token);
  if (!link) notFound();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-6 py-12">
      <div className="w-full">
        <p className="text-accent mb-4 text-center text-sm font-medium">Emily · AI Interviewer</p>
        <InterviewRoom
          token={token}
          title={link.title}
          defaultLocale={link.defaultLocale}
          maxDurationMinutes={link.maxDurationMinutes}
          participantName={link.participantName}
        />
      </div>
    </main>
  );
}
