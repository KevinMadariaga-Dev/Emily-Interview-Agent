import type { Metadata } from "next";
import { EmilyBuilder } from "@/features/demo/emily-builder";

export const metadata: Metadata = { title: "Nueva Emily", robots: { index: false, follow: false } };

/** `?emily=<slug>` opens that Emily's detail directly (used by the dashboard "Editar" link). */
export default async function NewEmilyPage(props: PageProps<"/admin/nueva">) {
  const { emily } = await props.searchParams;
  return <EmilyBuilder openSlug={typeof emily === "string" ? emily : undefined} />;
}
