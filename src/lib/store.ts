import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { nid, nowIso } from "./ids";
import type { PublicPending, PublicSite, PublicStore, Site, Store } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
export const STORE_VERSION = 3;

export const WELCOME_TEXT = `I'm your WordPress plugin agent. I'll ask for:

1. Site URL
2. WordPress username
3. Application password (Users → Profile → Application Passwords)
4. Your plugin folder — use **Select plugin folder on this PC** (a typed C:\\ path will not work from this server)

Plugin Agent Helper is only the installer. Your real plugin is not on WordPress until those files are uploaded here and pushed.

After that, say **do update** whenever the plugin files change.`;

const WELCOME: Store = {
  version: STORE_VERSION,
  sites: [],
  plugins: [],
  jobs: [],
  messages: [
    {
      id: nid(),
      role: "agent",
      createdAt: nowIso(),
      text: WELCOME_TEXT,
    },
  ],
};

export async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      version?: number;
      sites?: Array<{
        id: string;
        url: string;
        username?: string;
        password?: string;
        applicationPassword?: string;
        label: string;
        status?: string;
        lastCheckedAt?: string;
        lastError?: string;
      }>;
      plugins?: Store["plugins"];
      jobs?: Store["jobs"];
      messages?: Store["messages"];
      lastSiteId?: string;
      lastPluginId?: string;
      pending?: Store["pending"];
    };
    const sites: Site[] = (parsed.sites ?? []).map((site) => ({
      id: site.id,
      url: site.url,
      username: site.username ?? "",
      password: site.password || site.applicationPassword || "",
      label: site.label,
      status: normalizeStatus(site.status),
      lastCheckedAt: site.lastCheckedAt,
      lastError: site.lastError,
    }));

    const staleWelcome =
      parsed.version !== STORE_VERSION ||
      parsed.messages?.[0]?.text?.startsWith("I'm PressPush");

    return {
      version: STORE_VERSION,
      sites,
      plugins: parsed.plugins ?? [],
      jobs: parsed.jobs ?? [],
      messages: staleWelcome || !parsed.messages?.length ? WELCOME.messages : parsed.messages,
      lastSiteId: parsed.lastSiteId,
      lastPluginId: parsed.lastPluginId || undefined,
      pending: parsed.pending
        ? {
            ...parsed.pending,
            url: parsed.pending.url || undefined,
            path: parsed.pending.path || undefined,
            username: parsed.pending.username || undefined,
            password: parsed.pending.password || undefined,
          }
        : undefined,
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
    version: STORE_VERSION,
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
    lastCheckedAt: site.lastCheckedAt,
    lastError: site.lastError,
    hasPassword: Boolean(site.password),
  };
}

export function toPublicPending(pending?: Store["pending"]): PublicPending | undefined {
  if (!pending) return undefined;
  return {
    goal: pending.goal,
    url: pending.url,
    path: pending.path,
    username: pending.username,
    hasPassword: Boolean(pending.password),
    ask: pending.ask,
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
    pending: toPublicPending(store.pending),
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

function normalizeStatus(status: Site["status"] | string | undefined): Site["status"] {
  if (
    status === "connected" ||
    status === "helper-missing" ||
    status === "auth-failed" ||
    status === "not-wordpress" ||
    status === "error"
  ) {
    return status;
  }
  if (status === "logged-in" || status === "bridge-ready") return "connected";
  if (status === "bridge-missing") return "helper-missing";
  return "unknown";
}
