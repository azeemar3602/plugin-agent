import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { nid, nowIso } from "./ids";
import type { PublicStore, PublicSite, Site, Store } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const WELCOME: Store = {
  sites: [],
  plugins: [],
  jobs: [],
  messages: [
    {
      id: nid(),
      role: "agent",
      createdAt: nowIso(),
      text: "I'm PressPush. Send me a WordPress site URL and the local folder of the plugin you are building. I will zip it and install it on the site.\n\nAfter Cursor or Claude saves a change, tell me to update — I will read the latest files from disk and push them again.\n\nTry: install examples/hello-presspush on https://yoursite.com",
    },
  ],
};

export async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return {
      sites: parsed.sites ?? [],
      plugins: parsed.plugins ?? [],
      jobs: parsed.jobs ?? [],
      messages: parsed.messages?.length ? parsed.messages : WELCOME.messages,
      lastSiteId: parsed.lastSiteId,
      lastPluginId: parsed.lastPluginId,
    };
  } catch {
    return structuredClone(WELCOME);
  }
}

export async function writeStore(store: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  const trimmed: Store = {
    ...store,
    jobs: store.jobs.slice(-40),
    messages: store.messages.slice(-80),
  };
  await writeFile(tmp, JSON.stringify(trimmed, null, 2));
  await rename(tmp, STORE_PATH);
}

export function toPublicSite(site: Site): PublicSite {
  return {
    id: site.id,
    url: site.url,
    username: site.username,
    label: site.label,
    status: site.status,
    wordpressVersion: site.wordpressVersion,
    lastCheckedAt: site.lastCheckedAt,
    lastError: site.lastError,
    hasPassword: Boolean(site.applicationPassword),
  };
}

export function toPublicStore(store: Store): PublicStore {
  return {
    sites: store.sites.map(toPublicSite),
    plugins: store.plugins,
    jobs: store.jobs,
    messages: store.messages,
    lastSiteId: store.lastSiteId,
    lastPluginId: store.lastPluginId,
  };
}

export async function mutateStore(
  fn: (store: Store) => Promise<void> | void,
): Promise<Store> {
  const store = await readStore();
  await fn(store);
  await writeStore(store);
  return store;
}
