import path from "node:path";

import { appRoot } from "@/lib/paths";
import { zipPlugin } from "@/lib/plugin";

export const dynamic = "force-dynamic";

export async function GET() {
  const dir = path.join(appRoot(), "bridge", "plugin-agent-bridge");
  const zip = await zipPlugin(dir, "plugin-agent-bridge");

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="plugin-agent-bridge.zip"',
      "Cache-Control": "no-store",
    },
  });
}
