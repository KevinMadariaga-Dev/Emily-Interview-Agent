import type { Metadata } from "next";
import { isOpen, normalizeDraft } from "@/features/landing/config";
import { PublicEmily } from "@/features/landing/public-emily";
import { emilyRepository } from "@/server/repositories/emily.repository";

export const metadata: Metadata = { title: "Entrevista", robots: { index: false, follow: false } };

/** Public link of a created Emily (future emily.neoera/<slug>), loaded from the database. */
export default async function EmilyPage(props: PageProps<"/e/[slug]">) {
  const { slug } = await props.params;
  const emily = /^[a-z0-9-]{1,90}$/.test(slug) ? await emilyRepository.find(slug) : null;
  const draft = emily && normalizeDraft(emily.draft);
  // Paused or expired links show the same "not available" page as unknown ones.
  return <PublicEmily slug={slug} draft={draft && isOpen(draft) ? draft : null} />;
}
