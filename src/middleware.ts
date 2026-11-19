import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/api/listing-images", "/login", "/forgot-password", "/reset-password", "/api/ebay/oauth/callback", "/api/ebay/account-deletion", "/api/cron", "/api/health"];

/** Edge gate: unauthenticated visitors are sent to /login. Full session + permission checks happen server-side. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("oria_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
