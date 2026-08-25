import { NextResponse } from "next/server";

import { nowIso } from "@/lib/ids";
import { mutateStore, toPublicStore } from "@/lib/store";
import { probeSite } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required." }, { status: 400 });
  }

  try {
    const store = await mutateStore(async (current) => {
      const site = current.sites.find((item) => item.id === siteId);
      if (!site) throw new Error("Site not found.");
      const probe = await probeSite(site);
      site.status = probe.status;
      site.wordpressVersion = probe.wordpressVersion;
      site.lastCheckedAt = nowIso();
      site.lastError = probe.error;
    });

    return NextResponse.json(toPublicStore(store));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Probe failed." },
      { status: 400 },
    );
  }
}
