import { NextResponse } from "next/server";

import { nid, nowIso } from "@/lib/ids";
import { inspectPlugin, toPluginRecord, zipPlugin } from "@/lib/plugin";
import { mutateStore, toPublicStore } from "@/lib/store";
import type { DeployJob } from "@/lib/types";
import { deployZip } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    pluginId?: string;
    siteId?: string;
    action?: "install" | "update";
  };

  if (!body.pluginId || !body.siteId) {
    return NextResponse.json({ error: "pluginId and siteId are required." }, { status: 400 });
  }

  try {
    const store = await mutateStore(async (current) => {
      const plugin = current.plugins.find((item) => item.id === body.pluginId);
      const site = current.sites.find((item) => item.id === body.siteId);
      if (!plugin) throw new Error("Plugin is not in the list.");
      if (!site) throw new Error("Site is not connected.");
      if (!site.username || !site.applicationPassword) {
        throw new Error("That site is missing a username or application password.");
      }

      const inspected = await inspectPlugin(plugin.path);
      Object.assign(plugin, toPluginRecord(inspected, plugin.id));
      const zip = await zipPlugin(plugin.path, plugin.slug);
      const remote = await deployZip({
        site,
        zip,
        filename: `${plugin.slug}.zip`,
        slug: plugin.slug,
        activate: true,
      });

      const job: DeployJob = {
        id: nid(),
        action: body.action ?? "update",
        siteId: site.id,
        pluginId: plugin.id,
        pluginName: plugin.name,
        pluginVersion: remote.version || plugin.version,
        siteUrl: site.url,
        status: "success",
        message: remote.message || "Deploy finished.",
        files: inspected.files,
        remoteAction: remote.action,
        active: remote.active,
        createdAt: nowIso(),
      };
      current.jobs.push(job);
      current.lastPluginId = plugin.id;
      current.lastSiteId = site.id;
      site.status = "bridge-ready";
      site.lastError = undefined;
      site.lastCheckedAt = nowIso();
    });

    return NextResponse.json(toPublicStore(store));
  } catch (error) {
    const store = await mutateStore(async (current) => {
      const plugin = current.plugins.find((item) => item.id === body.pluginId);
      const site = current.sites.find((item) => item.id === body.siteId);
      const job: DeployJob = {
        id: nid(),
        action: body.action ?? "update",
        siteId: body.siteId,
        pluginId: body.pluginId ?? "unknown",
        pluginName: plugin?.name ?? "Plugin",
        pluginVersion: plugin?.version ?? "",
        siteUrl: site?.url,
        status: "error",
        message: error instanceof Error ? error.message : "Deploy failed.",
        files: [],
        createdAt: nowIso(),
      };
      current.jobs.push(job);
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Deploy failed.",
        store: toPublicStore(store),
      },
      { status: 400 },
    );
  }
}
