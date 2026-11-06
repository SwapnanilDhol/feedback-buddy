import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";

const publicPaths = ["/login", "/api/auth/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(path))) return NextResponse.next();
  const valid = await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  if (valid) return NextResponse.next();
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
