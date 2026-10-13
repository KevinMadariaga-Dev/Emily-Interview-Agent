import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { hasSitePassword } from "@/lib/site-password";

/**
 * Gate for admin server actions (create/list/delete Emilys, results, AI setup helpers).
 * Server actions are reachable by direct POST from any path, so each one calls this itself —
 * the proxy alone isn't a boundary.
 * SITE_PASSWORD is optional (owner's choice): without it the admin side is OPEN to anyone with
 * the URL — Emilys can be read/deleted and the OpenAI key used. Set it to protect the site again.
 * TODO(auth): replace with real admin accounts.
 */
export async function requireAdmin() {
  const password = env().SITE_PASSWORD;
  if (!password) return; // no password configured: admin side open (see above)
  if (!hasSitePassword((await headers()).get("authorization"), password))
    throw new Error("No autorizado.");
}
