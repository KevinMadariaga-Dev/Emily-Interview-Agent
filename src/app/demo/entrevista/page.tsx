import type { Metadata } from "next";
import { InterviewSim } from "@/features/demo/interview-sim";

export const metadata: Metadata = { title: "Entrevista", robots: { index: false, follow: false } };

/** Demo of the participant page (future emily.neoera/<slug>). */
export default function DemoInterviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-10">
      <div className="w-full">
        <InterviewSim />
        <p className="text-muted mt-6 text-center text-xs">Powered by NEOera · Emily</p>
      </div>
    </main>
  );
}
