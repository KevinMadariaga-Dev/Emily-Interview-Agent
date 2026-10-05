import type { Metadata } from "next";
import { PublicEmily } from "@/features/landing/public-emily";

export const metadata: Metadata = { title: "Entrevista", robots: { index: false, follow: false } };

/** Public link of a created Emily (future emily.neoera/<slug>). */
export default async function EmilyPage(props: PageProps<"/e/[slug]">) {
  const { slug } = await props.params;
  return <PublicEmily slug={slug} />;
}
