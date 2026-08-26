import { NextResponse } from "next/server";

import { readStore, toPublicSite } from "@/lib/store";
import { listElementorWidgets, listPlugins, probeSite } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  const site = store.sites.find((item) => item.id === store.lastSiteId) ?? store.sites[0];
  if (!site) {
    return NextResponse.json({ site: null, probe: null, plugins: [] });
  }
  const probe = await probeSite(site);
  const plugins = probe.status === "auth-failed" ? [] : await listPlugins(site);
  const widgets = probe.status === "connected" ? await listElementorWidgets(site) : [];
  return NextResponse.json({
    site: toPublicSite(site),
    probe,
    plugins,
    widgets: widgets.map((item) => ({
      type: item.type,
      title: item.title,
      plugin: item.plugin,
      custom: Boolean(item.custom),
    })),
    templates: probe.templates ?? [],
    elementor: probe.elementor ?? false,
  });
}
