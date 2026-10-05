import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { ADMIN_COOKIE, verifyAdminCookieValue } from "@/lib/admin-session";

/** Returns the signed-in admin identity or redirects to /login. Who may sign in is decided by `login()`. */
export async function requireAdmin(): Promise<string> {
  const jar = await cookies();
  const user = verifyAdminCookieValue(jar.get(ADMIN_COOKIE)?.value, env().ADMIN_SESSION_SECRET);
  if (!user) redirect("/login");
  return user;
}
