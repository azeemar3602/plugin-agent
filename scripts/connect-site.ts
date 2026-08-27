/**
 * Connect a WordPress site from the environment, without typing credentials
 * into the UI. Useful for headless runs, CI, and first-time setup.
 *
 *   WP_URL=https://wp.azbuilds.xyz WP_USER=admin@azbuilds.xyz \
 *     WP_APP_PASSWORD="xxxx xxxx xxxx xxxx" npx tsx scripts/connect-site.ts
 *
 * The password is read from the environment and written only to the store that
 * the app already keeps it in. It is never printed, and never hardcoded here.
 */
import { mutateStore, toPublicSite } from "../src/lib/store";
import { probeSite } from "../src/lib/wordpress";
import type { Site } from "../src/lib/types";

const url = (process.env.WP_URL ?? "").trim().replace(/\/+$/, "");
const username = (process.env.WP_USER ?? "").trim();
const password = process.env.WP_APP_PASSWORD ?? "";
const label = (process.env.WP_LABEL ?? "").trim() || (url ? new URL(url).hostname : "site");

async function main() {
  if (!url || !username || !password) {
    console.error("set WP_URL, WP_USER and WP_APP_PASSWORD");
    process.exit(1);
  }

  const candidate: Site = {
    // Reuse the existing id when this site is already in the store so the
    // connection updates in place instead of adding a duplicate entry.
    id: "ff47a2b6-8172-4188-adf0-423e18bb3253",
    url,
    username,
    password,
    label,
    status: "unknown",
  };

  const probe = await probeSite(candidate);
  const connected: Site = {
    ...candidate,
    status: probe.status,
    lastCheckedAt: new Date().toISOString(),
    lastError: probe.error,
  };

  const store = await mutateStore((current) => {
    const existing = current.sites.findIndex(
      (site) => site.url.replace(/\/+$/, "") === url || site.id === connected.id,
    );
    if (existing >= 0) {
      connected.id = current.sites[existing].id;
      current.sites[existing] = connected;
    } else {
      current.sites.push(connected);
    }
    current.lastSiteId = connected.id;
  });

  const saved = store.sites.find((site) => site.id === connected.id);
  console.log(
    JSON.stringify(
      {
        status: probe.status,
        elementor: probe.elementor,
        templates: probe.templates?.length,
        error: probe.error,
        lastSiteId: store.lastSiteId,
        site: saved ? toPublicSite(saved) : undefined,
      },
      null,
      2,
    ),
  );

  if (probe.status !== "connected") process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
