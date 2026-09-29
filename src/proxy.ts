import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminCookieValue } from "@/lib/admin-session";

/**
 * Next.js 16 `proxy` (formerly `middleware`). Optimistic auth gate for /admin.
 * Pages re-check the session server-side (defense in depth).
 */
export function proxy(request: NextRequest) {
  const email = verifyAdminCookieValue(
    request.cookies.get(ADMIN_COOKIE)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );
  if (!email) {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
