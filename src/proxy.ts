import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { equalsConstantTime, gateCookieName, gatePassword, gateToken } from "@/lib/gate";

const OPEN_PATHS = new Set(["/login", "/api/login"]);

export async function proxy(request: NextRequest) {
  const password = gatePassword();
  if (!password) {
    // No PLUGIN_AGENT_PASSWORD set (local dev, desktop EXE) — the gate is off.
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(gateCookieName())?.value ?? "";
  if (cookie && equalsConstantTime(cookie, await gateToken(password))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Plugin Agent is locked. Sign in first." },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
