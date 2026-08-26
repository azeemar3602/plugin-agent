import assert from "node:assert/strict";

import { runAgent } from "../src/lib/agent";
import type { Site, Store } from "../src/lib/types";

function site(partial: Partial<Site> = {}): Site {
  return {
    id: "site-1",
    url: "https://wp.azbuilds.xyz",
    username: "admin@azbuilds.xyz",
    password: "secret-password",
    label: "wp.azbuilds.xyz",
    status: "connected",
    ...partial,
  };
}

function storeWithSite(extra: Partial<Store> = {}): Store {
  const connected = site();
  return {
    version: 3,
    sites: [connected],
    plugins: [],
    jobs: [],
    messages: [
      {
        id: "m1",
        role: "agent",
        text: "Built Never Miss Another Client Call",
        createdAt: "2026-08-26T18:58:01.802Z",
        card: {
          kind: "design",
          designId: "d1",
          title: "Never Miss Another Client Call",
          widgetsUsed: ["heading"],
          sectionRoles: ["hero 52/48"],
          imported: true,
          pageUrl: "https://wp.azbuilds.xyz/never-miss-another-client-call/",
        },
      },
    ],
    lastSiteId: connected.id,
    ...extra,
  };
}

async function main() {
  const urlAsk = await runAgent(storeWithSite({ pending: undefined }), "send me url of this page");
  assert.match(urlAsk[0].text, /Never Miss Another Client Call/);
  assert.match(urlAsk[0].text, /never-miss-another-client-call/);
  assert.doesNotMatch(urlAsk[0].text, /how-can-vets-reduce-no-shows/);

  const greeting = await runAgent(storeWithSite({ pending: undefined }), "hello");
  assert.match(greeting[0].text, /wp\.azbuilds\.xyz/);
  assert.doesNotMatch(greeting[0].text, /What's the WordPress site URL/);

  const adminUrl = await runAgent(
    storeWithSite({ pending: { goal: "install", ask: "url" } }),
    "https://wp.azbuilds.xyz/wp-admin/",
  );
  assert.match(adminUrl[0].text, /already live|You're on/);
  assert.match(adminUrl[0].text, /never-miss-another-client-call/);
  assert.doesNotMatch(adminUrl[0].text, /Drop a plugin zip or Elementor JSON to install on this site/);

  const empty: Store = {
    version: 3,
    sites: [],
    plugins: [],
    jobs: [],
    messages: [],
  };
  const first = await runAgent(empty, "hello");
  assert.match(first[0].text, /What's the WordPress site URL/);

  const help = await runAgent(storeWithSite(), "help");
  assert.match(help[0].text, /JPEG/);
  assert.match(help[0].text, /do not need to paste the URL/i);
  assert.match(help[0].text, /Icon List/);

  const widgetQa = await runAgent(storeWithSite({ pending: undefined }), "text editor why? it should be icon list");
  assert.match(widgetQa[0].text, /automatic|Heading|Icon List/i);
  assert.doesNotMatch(widgetQa[0].text, /What's the WordPress site URL/);

  console.log("agent ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
