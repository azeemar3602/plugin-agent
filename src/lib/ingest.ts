import { pushPluginNow } from "./agent";
import { buildDesignTemplate, isDesignFile } from "./design";
import { fileBasename, looksLikeElementorTemplate } from "./elementor-detect";
import { nid, nowIso } from "./ids";
import {
  extractUploadedZip,
  inspectPlugin,
  saveUploadedPhp,
  toPluginRecord,
} from "./plugin";
import { mutateStore, readStore, toPublicStore } from "./store";
import type { PublicStore } from "./types";
import { saveUploadedTree } from "./upload-tree";
import {
  createElementorPage,
  findPageIdBySlug,
  importElementorFiles,
  listElementorWidgets,
  listPlugins,
} from "./wordpress";

type IncomingFile = {
  relativePath: string;
  buffer: Buffer;
};

function basenameOf(file: IncomingFile): string {
  return fileBasename(file.relativePath);
}

export async function filesFromForm(form: FormData): Promise<IncomingFile[]> {
  const many = form.getAll("files").filter((item): item is File => item instanceof File);
  const rels = form.getAll("relpaths").map(String);
  const extras = form.getAll("file").filter((item): item is File => item instanceof File);

  const out: IncomingFile[] = [];
  if (many.length > 0) {
    for (let index = 0; index < many.length; index += 1) {
      out.push({
        relativePath: rels[index] || many[index].name,
        buffer: Buffer.from(await many[index].arrayBuffer()),
      });
    }
  }
  for (const file of extras) {
    if (many.includes(file)) continue;
    out.push({
      relativePath: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  }
  return out;
}

export async function ingestUpload(files: IncomingFile[]): Promise<PublicStore> {
  if (files.length === 0) {
    throw new Error("Drop a plugin zip, Elementor JSON, or a JPEG/PNG/PDF design.");
  }

  const templates: Array<{ filename: string; buffer: Buffer }> = [];
  const designs: IncomingFile[] = [];
  const rest: IncomingFile[] = [];

  for (const file of files) {
    const name = basenameOf(file);
    if (isDesignFile(name)) designs.push(file);
    else if (/\.json$/i.test(name) && looksLikeElementorTemplate(file.buffer.toString("utf8"))) {
      templates.push({ filename: name, buffer: file.buffer });
    } else {
      rest.push(file);
    }
  }

  let pluginDir: string | undefined;

  if (rest.length === 1 && /\.zip$/i.test(basenameOf(rest[0]))) {
    try {
      const extracted = await extractUploadedZip(rest[0].buffer);
      await inspectPlugin(extracted);
      pluginDir = extracted;
    } catch {
      templates.push({ filename: basenameOf(rest[0]), buffer: rest[0].buffer });
    }
  } else if (rest.length === 1 && /\.php$/i.test(basenameOf(rest[0]))) {
    pluginDir = await saveUploadedPhp(rest[0].buffer, basenameOf(rest[0]));
  } else if (rest.length > 0) {
    const tree = await saveUploadedTree(rest);
    try {
      await inspectPlugin(tree);
      pluginDir = tree;
    } catch (error) {
      if (templates.length === 0 && designs.length === 0) throw error;
    }
  }

  if (!pluginDir && templates.length === 0 && designs.length === 0) {
    throw new Error(
      "Drop a plugin zip, an Elementor JSON, or a JPEG/PNG/PDF of the design.",
    );
  }

  await mutateStore((current) => {
    const bits = [
      pluginDir ? "plugin files" : "",
      templates.length ? `${templates.length} Elementor JSON` : "",
      designs.length ? `${designs.length} design file${designs.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    current.messages.push({
      id: nid(),
      role: "user",
      text: `Dropped ${bits.join(" and ")}`,
      createdAt: nowIso(),
    });

    if (pluginDir) {
      const site =
        current.sites.find((item) => item.id === current.lastSiteId) ?? current.sites[0];
      current.pending = {
        goal: "update",
        path: pluginDir,
        url: current.pending?.url || site?.url,
        username: current.pending?.username || site?.username,
        password: current.pending?.password || site?.password,
      };
    }
  });

  if (pluginDir) {
    const inspected = await inspectPlugin(pluginDir);
    await mutateStore((current) => {
      const existing = current.plugins.find(
        (plugin) =>
          plugin.path === inspected.path ||
          (plugin.slug === inspected.slug && !plugin.path.includes("/examples/")),
      );
      const record = toPluginRecord(inspected, existing?.id);
      if (existing) Object.assign(existing, record);
      else current.plugins.push(record);
      current.lastPluginId = record.id;
      if (current.pending) {
        current.pending.path = record.path;
        current.pending.goal = "update";
        current.pending.ask = undefined;
      }
    });
  }

  if (designs.length > 0) {
    await processDesigns(designs);
  }

  if (templates.length > 0) {
    await importTemplateFiles(templates, Boolean(pluginDir) || designs.length > 0);
  }

  if (pluginDir) {
    const result = await pushPluginNow();
    return result.store;
  }

  const store = await readStore();
  return toPublicStore(store);
}

async function processDesigns(designs: IncomingFile[]) {
  const snapshot = await readStore();
  const site =
    snapshot.sites.find((item) => item.id === snapshot.lastSiteId) ?? snapshot.sites[0];
  const plugins = site ? await listPlugins(site) : [];
  const remoteWidgets = site ? await listElementorWidgets(site) : [];

  for (const design of designs) {
    const built = await buildDesignTemplate({
      filename: basenameOf(design),
      buffer: design.buffer,
      plugins,
      remoteWidgets,
    });

    let imported = false;
    let importError: string | undefined;
    let pageUrl: string | undefined;
    if (site?.url && site.username && site.password) {
      try {
        await importElementorFiles({
          site,
          files: [{ filename: `${built.id}.json`, buffer: Buffer.from(built.json) }],
        });
        imported = true;
        const parsed = JSON.parse(built.json) as {
          title?: string;
          content?: unknown[];
          page_settings?: Record<string, unknown>;
        };
        const slug = (parsed.title || built.title || "design-page")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "design-page";
        const existingId = await findPageIdBySlug(site, slug);
        const page = await createElementorPage({
          site,
          id: existingId,
          title: parsed.title || built.title,
          slug,
          elementor: {
            title: parsed.title,
            content: parsed.content ?? [],
            page_settings: parsed.page_settings,
          },
        });
        pageUrl = page.url;
      } catch (error) {
        importError = error instanceof Error ? error.message : "Could not import the generated JSON.";
      }
    }

    await mutateStore((current) => {
      current.jobs.push({
        id: nid(),
        action: "template",
        siteId: site?.id,
        pluginId: built.id,
        pluginName: built.title,
        pluginVersion: "",
        siteUrl: site?.url,
        status: imported ? "success" : "error",
        message: imported
          ? `Built Elementor JSON from the design and imported it (${built.widgetsUsed.join(", ")}).`
          : importError || "Built Elementor JSON from the design.",
        files: [basenameOf(design)],
        createdAt: nowIso(),
      });
      current.messages.push({
        id: nid(),
        role: "agent",
        text: imported
          ? `Detected ${built.detectedWidgets.length} Elementor widgets on this site, then built **${built.title}** using those widgets: ${built.widgetsUsed.join(", ")}.${pageUrl ? ` Live page: ${pageUrl}` : " Saved under Templates → Saved Templates."}`
          : `Detected widgets, then built **${built.title}** (${built.sectionRoles.join(" → ")}). Widgets used: ${built.widgetsUsed.join(", ") || "none"}.${importError ? ` Import skipped: ${importError}` : " Download the JSON and import it in Elementor."}`,
        createdAt: nowIso(),
        card: {
          kind: "design",
          designId: built.id,
          title: built.title,
          widgetsUsed: built.widgetsUsed,
          sectionRoles: built.sectionRoles,
          imported,
          pageUrl,
          detectedCount: built.detectedWidgets.length,
        },
      });
    });
  }
}

async function importTemplateFiles(
  templates: Array<{ filename: string; buffer: Buffer }>,
  allowPartial: boolean,
) {
  const snapshot = await readStore();
  const site =
    snapshot.sites.find((item) => item.id === snapshot.lastSiteId) ?? snapshot.sites[0];
  try {
    if (!site?.url || !site.username || !site.password) {
      throw new Error("Need the WordPress site URL, username, and application password first.");
    }
    const imported = await importElementorFiles({ site, files: templates });
    await mutateStore((current) => {
      const titles = imported.imported.map((item) => item.title).filter(Boolean);
      current.jobs.push({
        id: nid(),
        action: "template",
        siteId: site.id,
        pluginId: current.lastPluginId || "templates",
        pluginName: titles[0] || "Elementor templates",
        pluginVersion: "",
        siteUrl: site.url,
        status: "success",
        message: imported.message || `Imported ${imported.imported.length} template(s).`,
        files: templates.map((file) => file.filename),
        createdAt: nowIso(),
      });
      current.messages.push({
        id: nid(),
        role: "agent",
        text:
          imported.message ||
          `Imported **${imported.imported.length}** Elementor template${imported.imported.length === 1 ? "" : "s"} into Templates → Saved Templates.`,
        createdAt: nowIso(),
        card: {
          kind: "templates",
          imported: imported.imported.map((item) => ({
            title: item.title,
            type: item.type,
          })),
          errors: imported.errors,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import Elementor templates.";
    await mutateStore((current) => {
      current.messages.push({
        id: nid(),
        role: "agent",
        text: message,
        createdAt: nowIso(),
        card: { kind: "templates", imported: [], errors: [message] },
      });
    });
    if (!allowPartial) throw error;
  }
}
