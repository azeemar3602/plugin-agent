import { ingestUpload, filesFromForm } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isBrowserNavigation(request: Request): boolean {
  const mode = request.headers.get("sec-fetch-mode");
  if (mode === "navigate") return true;
  if (mode === "cors" || mode === "same-origin") return false;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

function homeUrl(request: Request): URL {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const ref = new URL(referer);
      if (ref.hostname && ref.hostname !== "0.0.0.0") {
        ref.pathname = "/";
        ref.search = "";
        ref.hash = "";
        return ref;
      }
    } catch {
      /* fall through */
    }
  }

  const rawHost = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "127.0.0.1:43177"
  )
    .split(",")[0]
    .trim()
    .replace(/^0\.0\.0\.0(?::|$)/, "127.0.0.1");
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (rawHost.startsWith("127.") || rawHost.startsWith("localhost") ? "http" : "https");
  return new URL(`${proto}://${rawHost}/`);
}

function reply(request: Request, body: unknown, error?: string) {
  if (isBrowserNavigation(request)) {
    const url = homeUrl(request);
    if (error) url.searchParams.set("error", error.slice(0, 280));
    else url.searchParams.set("ok", "1");
    return Response.redirect(url, 303);
  }
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json(body);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = await filesFromForm(form);
    const store = await ingestUpload(files);
    return reply(request, store);
  } catch (error) {
    return reply(
      request,
      null,
      error instanceof Error ? error.message : "Could not read that upload.",
    );
  }
}
