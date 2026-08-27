import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  equalsConstantTime,
  gateCookieName,
  gatePassword,
  gateToken,
  safeNextPath,
} from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Relative Location, not an absolute URL: behind a reverse proxy (Hostinger,
 * Cloudflare) `request.url` reports the internal origin, which would bounce a
 * signed-in user to localhost.
 */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

function isHttps(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return request.nextUrl.protocol === "https:";
}

export async function POST(request: NextRequest) {
  const password = gatePassword();
  const form = await request.formData();
  const submitted = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));

  if (!password) {
    return seeOther(next);
  }

  if (!equalsConstantTime(submitted, password)) {
    const query = new URLSearchParams({ error: "1" });
    if (next !== "/") query.set("next", next);
    return seeOther(`/login?${query.toString()}`);
  }

  const response = seeOther(next);
  response.cookies.set({
    name: gateCookieName(),
    value: await gateToken(password),
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
