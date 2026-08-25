import { readFile } from "node:fs/promises";
import path from "node:path";

import { dataDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[\w.-]+$/.test(id)) {
    return Response.json({ error: "Invalid design id." }, { status: 400 });
  }
  const jsonPath = path.join(dataDir(), "designs", id, "template.json");
  try {
    const json = await readFile(jsonPath, "utf8");
    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Design JSON not found." }, { status: 404 });
  }
}
