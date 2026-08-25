import { NextResponse } from "next/server";

import { nid, nowIso } from "@/lib/ids";
import { mutateStore, toPublicSite, toPublicStore } from "@/lib/store";
import { normalizeSiteUrl, siteHost } from "@/lib/urls";
import { probeSite } from "@/lib/wordpress";
import type { Site } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    url?: string;
    username?: string;
    applicationPassword?: string;
  };

  if (!body.url) {
    return NextResponse.json({ error: "Site URL is required." }, { status: 400 });
  }

  try {
    const url = normalizeSiteUrl(body.url);
    const store = await mutateStore(async (current) => {
      let site = current.sites.find((item) => item.url === url);
      if (!site) {
        site = {
          id: nid(),
          url,
          username: body.username?.trim() ?? "",
          applicationPassword: body.applicationPassword?.trim() ?? "",
          label: siteHost(url),
          status: "unknown",
        };
        current.sites.push(site);
      } else {
        if (body.username) site.username = body.username.trim();
        if (body.applicationPassword) {
          site.applicationPassword = body.applicationPassword.trim();
        }
      }

      current.lastSiteId = site.id;

      if (site.username && site.applicationPassword) {
        const probe = await probeSite(site);
        site.status = probe.status;
        site.wordpressVersion = probe.wordpressVersion;
        site.lastCheckedAt = nowIso();
        site.lastError = probe.error;
      }
    });

    const site = store.sites.find((item) => item.url === url) as Site;
    return NextResponse.json({ store: toPublicStore(store), site: toPublicSite(site) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save site." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const store = await mutateStore((current) => {
    current.sites = current.sites.filter((site) => site.id !== id);
    if (current.lastSiteId === id) current.lastSiteId = current.sites[0]?.id;
  });

  return NextResponse.json(toPublicStore(store));
}
