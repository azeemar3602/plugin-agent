import { nid, nowIso } from "@/lib/ids";
import {
  extractUploadedZip,
  inspectPlugin,
  saveUploadedPhp,
  toPluginRecord,
} from "@/lib/plugin";
import { mutateStore, toPublicStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Attach a plugin zip or PHP file." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name || "plugin.zip";

  try {
    let pluginDir: string;
    if (name.toLowerCase().endsWith(".zip") || file.type.includes("zip")) {
      pluginDir = await extractUploadedZip(buffer);
    } else if (name.toLowerCase().endsWith(".php")) {
      pluginDir = await saveUploadedPhp(buffer, name);
    } else {
      return Response.json(
        { error: "Upload a .zip of the plugin folder, or the main .php file." },
        { status: 400 },
      );
    }

    const inspected = await inspectPlugin(pluginDir);
    const store = await mutateStore((current) => {
      const existing = current.plugins.find(
        (plugin) => plugin.path === inspected.path || plugin.slug === inspected.slug,
      );
      const record = toPluginRecord(inspected, existing?.id);
      if (existing) Object.assign(existing, record);
      else current.plugins.push(record);
      current.lastPluginId = record.id;
      if (current.pending) {
        current.pending.path = record.path;
        current.pending.ask = undefined;
      }
      current.messages.push({
        id: nid(),
        role: "user",
        text: `Uploaded ${name}`,
        createdAt: nowIso(),
      });
      current.messages.push({
        id: nid(),
        role: "agent",
        text: `Got **${record.name} ${record.version}** (${record.fileCount} files). Say **do update** to push it to the WordPress site.`,
        createdAt: nowIso(),
        card: { kind: "plugin", plugin: record },
      });
    });

    return Response.json(toPublicStore(store));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read that upload." },
      { status: 400 },
    );
  }
}
