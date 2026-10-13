import { NextResponse, type NextRequest } from "next/server";
import { hasSitePassword, isParticipantPath } from "@/lib/site-password";

/**
 * Next.js 16 `proxy` (formerly `middleware`, Node.js runtime).
 * - /login was removed: it sends people to the home page.
 * - SITE_PASSWORD (optional): when set, the site asks for it (HTTP Basic, any username), except
 *   the participant's link (/e/<slug>) and its voice endpoints. Server actions also check it
 *   themselves (requireAdmin), since any action can be POSTed from any path.
 * TODO(auth): replace with user accounts (magic link) before real customer data.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/login")
    return NextResponse.redirect(new URL("/", request.url));

  const password = process.env.SITE_PASSWORD;
  if (
    !password ||
    isParticipantPath(request.nextUrl.pathname) ||
    hasSitePassword(request.headers.get("authorization"), password)
  )
    return NextResponse.next();

  return new NextResponse("Se necesita la contraseña de Emily.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Emily", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except build assets, icons and the uptime check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|api/health).*)"],
};
