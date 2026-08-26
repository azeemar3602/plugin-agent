import { readFile } from "node:fs/promises";

import { generatedPluginZipPath } from "@/lib/generate-widgets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const zip = await readFile(generatedPluginZipPath());
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="plugin-agent-widgets.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "No generated widget plugin yet. Drop a design first." }, { status: 404 });
  }
}
