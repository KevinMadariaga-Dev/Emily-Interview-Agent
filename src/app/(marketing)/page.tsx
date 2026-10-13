import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang } from "@/features/landing/lang-cookie";
import { Landing } from "@/features/landing/landing";

/** Home: Emily hero + "Configura Emily" setup form, rendered in the visitor's ES/EN choice. */
export default async function HomePage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return <Landing initialLang={lang} />;
}
