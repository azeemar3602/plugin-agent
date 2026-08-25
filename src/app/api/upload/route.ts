import { pushPluginNow } from "@/lib/agent";
import { nid, nowIso } from "@/lib/ids";
import {
  extractUploadedZip,
  inspectPlugin,
  saveUploadedPhp,
  toPluginRecord,
} from "@/lib/plugin";
import { mutateStore, toPublicStore } from "@/lib/store";
import { saveUploadedTree } from "@/lib/upload-tree";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const many = form.getAll("files").filter((item): item is File => item instanceof File);
  const single = form.get("file");

  try {
    let pluginDir: string;
    if (many.length > 0) {
      const rels = form.getAll("relpaths").map(String);
      const files = await Promise.all(
        many.map(async (file, index) => ({
          relativePath: rels[index] || file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
        })),
      );
      pluginDir = await saveUploadedTree(files);
    } else if (single instanceof File) {
      const buffer = Buffer.from(await single.arrayBuffer());
      const name = single.name || "plugin.zip";
      if (name.toLowerCase().endsWith(".zip") || single.type.includes("zip")) {
        pluginDir = await extractUploadedZip(buffer);
      } else if (name.toLowerCase().endsWith(".php")) {
        pluginDir = await saveUploadedPhp(buffer, name);
      } else {
        return Response.json(
          { error: "Upload the plugin folder, a .zip, or the main .php file." },
          { status: 400 },
        );
      }
    } else {
      return Response.json({ error: "Choose the plugin folder or a zip." }, { status: 400 });
    }

    const inspected = await inspectPlugin(pluginDir);
    const store = await mutateStore((current) => {
      const existing = current.plugins.find(
        (plugin) =>
          plugin.path === inspected.path ||
          (plugin.slug === inspected.slug && !plugin.path.includes("/examples/")),
      );
      const record = toPluginRecord(inspected, existing?.id);
      if (existing) Object.assign(existing, record);
      else current.plugins.push(record);
      current.lastPluginId = record.id;

      const site =
        current.sites.find((item) => item.id === current.lastSiteId) ?? current.sites[0];
      if (current.pending) {
        current.pending.path = record.path;
        current.pending.goal = "update";
        current.pending.ask = undefined;
        if (site) {
          current.pending.url = current.pending.url || site.url;
          current.pending.username = current.pending.username || site.username;
          current.pending.password = current.pending.password || site.password;
        }
      } else {
        current.pending = {
          goal: "update",
          path: record.path,
          url: site?.url,
          username: site?.username,
          password: site?.password,
        };
      }

      const canPush = Boolean(
        current.pending.url &&
          current.pending.username &&
          current.pending.password &&
          current.pending.path,
      );

      current.messages.push({
        id: nid(),
        role: "user",
        text: `Uploaded plugin folder (${record.fileCount} files)`,
        createdAt: nowIso(),
      });
      current.messages.push({
        id: nid(),
        role: "agent",
        text: canPush
          ? `Got **${record.name} ${record.version}**. Pushing it to WordPress…`
          : `Got **${record.name} ${record.version}**. I still need the site URL, username, and application password before I can push.`,
        createdAt: nowIso(),
        card: { kind: "plugin", plugin: record },
      });
    });

    const ready = Boolean(
      store.pending?.url &&
        store.pending?.username &&
        store.pending?.password &&
        store.pending?.path,
    );
    if (ready) {
      const result = await pushPluginNow();
      return Response.json(result.store);
    }

    return Response.json(toPublicStore(store));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read that upload." },
      { status: 400 },
    );
  }
}
