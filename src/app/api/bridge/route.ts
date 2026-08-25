import path from "node:path";

import { zipPlugin } from "@/lib/plugin";

export const dynamic = "force-dynamic";

export async function GET() {
  const dir = path.join(process.cwd(), "bridge", "presspush-bridge");
  const zip = await zipPlugin(dir, "presspush-bridge");

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="presspush-bridge.zip"',
      "Cache-Control": "no-store",
    },
  });
}
