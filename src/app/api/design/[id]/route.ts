import { readFile } from "node:fs/promises";
import path from "node:path";

import { dataDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[\w.-]+$/.test(id)) {
    return Response.json({ error: "Invalid design id." }, { status: 400 });
  }

  // ?format=email serves the table-based newsletter HTML built from the design.
  const email = new URL(request.url).searchParams.get("format") === "email";
  const file = email ? "newsletter.html" : "template.json";
  const filePath = path.join(dataDir(), "designs", id, file);
  try {
    const body = await readFile(filePath, "utf8");
    return new Response(body, {
      headers: {
        "Content-Type": email ? "text/html; charset=utf-8" : "application/json",
        "Content-Disposition": `attachment; filename="${id}${email ? ".html" : ".json"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: email ? "No newsletter HTML for this design." : "Design JSON not found." },
      { status: 404 },
    );
  }
}
