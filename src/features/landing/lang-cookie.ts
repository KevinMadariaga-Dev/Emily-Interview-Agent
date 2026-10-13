import type { Lang } from "./i18n";

/**
 * The ES/EN choice lives in a cookie (not localStorage) so the server renders the page already
 * in that language — no Spanish flash and jump to English on reload.
 */
export const LANG_COOKIE = "emily_lang";

export const parseLang = (value: string | undefined): Lang => (value === "en" ? "en" : "es");

/** Client: remember the choice for a year. */
export function saveLangCookie(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
