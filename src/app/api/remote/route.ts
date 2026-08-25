import { NextResponse } from "next/server";

import { readStore, toPublicSite } from "@/lib/store";
import { listPlugins, probeSite } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  const site = store.sites.find((item) => item.id === store.lastSiteId) ?? store.sites[0];
  if (!site) {
    return NextResponse.json({ site: null, probe: null, plugins: [] });
  }
  const probe = await probeSite(site);
  const plugins = probe.status === "auth-failed" ? [] : await listPlugins(site);
  return NextResponse.json({
    site: toPublicSite(site),
    probe,
    plugins,
  });
}
