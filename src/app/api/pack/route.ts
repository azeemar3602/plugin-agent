import { inspectPlugin, zipPlugin } from "@/lib/plugin";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pluginId = searchParams.get("pluginId");
  if (!pluginId) {
    return Response.json({ error: "pluginId is required." }, { status: 400 });
  }

  const store = await readStore();
  const plugin = store.plugins.find((item) => item.id === pluginId);
  if (!plugin) {
    return Response.json({ error: "Plugin not found." }, { status: 404 });
  }

  const inspected = await inspectPlugin(plugin.path);
  const zip = await zipPlugin(inspected.path, inspected.slug);

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${inspected.slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
