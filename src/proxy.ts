import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 `proxy` (formerly `middleware`, Node.js runtime).
 * - /login was removed: it sends people to the home page.
 * - SITE_PASSWORD (optional): when set, the whole site asks for it (HTTP Basic, any username).
 *   Protects the OpenAI / Gmail / Notion-backed endpoints on public deploys until real auth exists.
 * TODO(auth): replace with user accounts (magic link) before real customer data.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", request.url));

  const password = process.env.SITE_PASSWORD;
  if (!password || hasPassword(request.headers.get("authorization"), password))
    return NextResponse.next();

  return new NextResponse("Se necesita la contraseña de Emily.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Emily", charset="UTF-8"' },
  });
}

function hasPassword(header: string | null, password: string) {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const given = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const expected = Buffer.from(password);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const config = {
  // Everything except build assets, icons and the uptime check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|api/health).*)"],
};
