import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { ADMIN_COOKIE, verifyAdminCookieValue } from "@/lib/admin-session";

/** Returns the signed-in admin email or redirects to /admin/login. */
export async function requireAdmin(): Promise<string> {
  const jar = await cookies();
  const email = verifyAdminCookieValue(jar.get(ADMIN_COOKIE)?.value, env().ADMIN_SESSION_SECRET);
  const allowed = env()
    .ADMIN_ALLOWED_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase());
  if (!email || !allowed.includes(email.toLowerCase())) redirect("/admin/login");
  return email;
}
