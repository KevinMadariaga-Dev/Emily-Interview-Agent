import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { hasSitePassword } from "@/lib/site-password";

/**
 * Gate for admin server actions (create/list/delete Emilys, results, AI setup helpers).
 * Server actions are reachable by direct POST from any path, so each one calls this itself —
 * the proxy alone isn't a boundary. SITE_PASSWORD is required in production; open locally.
 * TODO(auth): replace with real admin accounts.
 */
export async function requireAdmin() {
  const { SITE_PASSWORD: password, NODE_ENV } = env();
  if (!password) {
    if (NODE_ENV === "production")
      throw new Error("SITE_PASSWORD no está configurada: el panel de Emily está bloqueado.");
    return;
  }
  if (!hasSitePassword((await headers()).get("authorization"), password))
    throw new Error("No autorizado.");
}
