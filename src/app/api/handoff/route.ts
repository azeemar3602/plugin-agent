import { readFile } from "node:fs/promises";
import path from "node:path";

import { appRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = await readFile(path.join(appRoot(), "HANDOFF.md"));
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="Plugin_Agent_HANDOFF.md"',
      "Cache-Control": "no-store",
    },
  });
}
