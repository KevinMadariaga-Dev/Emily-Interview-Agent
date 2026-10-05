import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 `proxy` (formerly `middleware`).
 * Login removed for now: /login just sends people to the home page.
 * TODO(auth): restore an /admin gate before real data or production.
 */
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/login"],
};
