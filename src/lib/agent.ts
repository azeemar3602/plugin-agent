import { inspectPlugin, toPluginRecord, zipPlugin } from "./plugin";
import { nid, nowIso } from "./ids";
import { mutateStore, toPublicSite } from "./store";
import type {
  AgentCard,
  ChatMessage,
  DeployJob,
  PluginRecord,
  PublicStore,
  Site,
  Store,
} from "./types";
import { normalizeSiteUrl, siteHost } from "./urls";
import { deployZip, probeSite } from "./wordpress";

export type AgentResult = {
  store: PublicStore;
  replies: ChatMessage[];
};

type ParsedIntent = {
  kind:
    | "help"
    | "connect"
    | "install"
    | "update"
    | "status"
    | "pack"
    | "list"
    | "remove-site"
    | "remove-plugin"
    | "bridge"
    | "unknown";
  url?: string;
  path?: string;
  username?: string;
  password?: string;
  raw: string;
};

export async function handleAgentMessage(text: string): Promise<AgentResult> {
  const parsed = parseIntent(text);
  const replies: ChatMessage[] = [];

  const store = await mutateStore(async (current) => {
    current.messages.push({
      id: nid(),
      role: "user",
      text,
      createdAt: nowIso(),
    });

    const produced = await executeIntent(current, parsed);
    for (const message of produced) {
      current.messages.push(message);
      replies.push(message);
    }
  });

  const { toPublicStore } = await import("./store");
  return { store: toPublicStore(store), replies };
}

export function parseIntent(raw: string): ParsedIntent {
  const text = raw.trim();
  const lower = text.toLowerCase();

  const url = extractUrl(text);
  const path = extractPath(text, url);
  const username = extractUsername(text);
  const password = extractPassword(text);

  if (/\b(help|how work|what can you|instructions)\b/i.test(text) && !path && !url) {
    return { kind: "help", raw: text };
  }
  if (/\b(bridge|download bridge|helper plugin)\b/i.test(text) && !path) {
    return { kind: "bridge", url, raw: text };
  }
  if (/\b(list|show sites|show plugins|what.?s connected)\b/i.test(text) && !path) {
    return { kind: "list", raw: text };
  }
  if (/\b(remove|forget|delete|unlink)\b/i.test(lower) && /\bsite\b/i.test(lower)) {
    return { kind: "remove-site", url, raw: text };
  }
  if (/\b(remove|forget|delete|unlink)\b/i.test(lower) && /\bplugin\b/i.test(lower)) {
    return { kind: "remove-plugin", path, raw: text };
  }
  if (/\b(connect|link site|add site|login|credentials|application password)\b/i.test(text)) {
    return { kind: "connect", url, username, password, raw: text };
  }
  if (/\b(status|probe|check site|is it ready|health)\b/i.test(text)) {
    return { kind: "status", url, raw: text };
  }
  if (/\b(pack|zip|download zip|bundle)\b/i.test(text)) {
    return { kind: "pack", path, url, raw: text };
  }
  if (/\b(update|sync|push again|redeploy)\b/i.test(text)) {
    return { kind: "update", path, url, username, password, raw: text };
  }
  if (/\b(install|deploy|push|upload)\b/i.test(text) || (url && path)) {
    return { kind: "install", path, url, username, password, raw: text };
  }
  if (url && (username || password)) {
    return { kind: "connect", url, username, password, raw: text };
  }
  if (url) {
    return { kind: "connect", url, username, password, raw: text };
  }
  if (path) {
    return { kind: "install", path, url, raw: text };
  }

  return { kind: "unknown", raw: text };
}

async function executeIntent(store: Store, intent: ParsedIntent): Promise<ChatMessage[]> {
  switch (intent.kind) {
    case "help":
      return [agentText(helpText())];
    case "bridge":
      return [
        agentText(
          "Download PressPush Bridge and install it once on the WordPress site: WP Admin → Plugins → Add New → Upload Plugin → Activate. After that, deploys from this agent go through the REST API.",
          { kind: "bridge" },
        ),
      ];
    case "list":
      return [listMessage(store)];
    case "connect":
      return connectSite(store, intent);
    case "status":
      return checkStatus(store, intent);
    case "pack":
      return packPlugin(store, intent);
    case "install":
      return deployPlugin(store, intent, "install");
    case "update":
      return deployPlugin(store, intent, "update");
    case "remove-site":
      return removeSite(store, intent);
    case "remove-plugin":
      return removePlugin(store, intent);
    default:
      return [
        agentText(
          "I need a WordPress site URL and a local plugin folder.\n\nExamples:\n• install examples/hello-presspush on https://mysite.com\n• connect https://mysite.com user admin password xxxx xxxx xxxx xxxx xxxx xxxx\n• update",
        ),
      ];
  }
}

async function connectSite(store: Store, intent: ParsedIntent): Promise<ChatMessage[]> {
  if (!intent.url) {
    return [
      agentText(
        "Send the site like this:\nconnect https://mysite.com user YOURUSER password xxxx xxxx xxxx xxxx xxxx xxxx\n\nThe password must be a WordPress Application Password (Users → Profile → Application Passwords), not the login password.",
      ),
    ];
  }

  let url: string;
  try {
    url = normalizeSiteUrl(intent.url);
  } catch (error) {
    return [agentText(errorMessage(error))];
  }

  const existing = findSite(store, url);
  const site: Site = existing ?? {
    id: nid(),
    url,
    username: "",
    applicationPassword: "",
    label: siteHost(url),
    status: "unknown",
  };

  if (intent.username) site.username = intent.username;
  if (intent.password) site.applicationPassword = intent.password.replace(/\s+/g, " ").trim();

  if (!existing) store.sites.push(site);
  store.lastSiteId = site.id;

  if (!site.username || !site.applicationPassword) {
    site.status = "reachable";
    return [
      agentText(
        `Saved ${site.url}. I still need a WordPress administrator username and an Application Password.\n\nReply:\nconnect ${site.url} user YOURUSER password xxxx xxxx xxxx xxxx xxxx xxxx`,
        { kind: "site", site: toPublicSite(site) },
      ),
    ];
  }

  const probe = await probeSite(site);
  site.status = probe.status;
  site.wordpressVersion = probe.wordpressVersion;
  site.lastCheckedAt = nowIso();
  site.lastError = probe.error;

  if (probe.status === "bridge-ready") {
    return [
      agentText(
        `${site.label} is ready. Bridge is installed, credentials work` +
          (probe.wordpressVersion ? `, WordPress ${probe.wordpressVersion}` : "") +
          `. Send a plugin folder to install, or say update after you save local changes.`,
        { kind: "site", site: toPublicSite(site) },
      ),
    ];
  }

  if (probe.status === "bridge-missing") {
    return [
      agentText(
        `${site.label} looks like WordPress, but PressPush Bridge is not installed yet. Download it, upload it once, activate it, then say “check site”.`,
        { kind: "bridge" },
      ),
    ];
  }

  if (probe.status === "auth-failed") {
    return [
      agentText(
        `WordPress at ${site.label} rejected the login. Create an Application Password under Users → Profile and send it again.`,
        { kind: "site", site: toPublicSite(site) },
      ),
    ];
  }

  return [
    agentText(
      probe.error || `Could not confirm ${site.label}.`,
      { kind: "site", site: toPublicSite(site) },
    ),
  ];
}

async function checkStatus(store: Store, intent: ParsedIntent): Promise<ChatMessage[]> {
  const site = pickSite(store, intent.url);
  if (!site) {
    return [agentText("No site connected yet. Send a URL first.")];
  }
  if (!site.username || !site.applicationPassword) {
    return [
      agentText(
        `I have ${site.url} but no credentials yet. Send:\nconnect ${site.url} user YOURUSER password YOUR_APP_PASSWORD`,
      ),
    ];
  }

  const probe = await probeSite(site);
  site.status = probe.status;
  site.wordpressVersion = probe.wordpressVersion;
  site.lastCheckedAt = nowIso();
  site.lastError = probe.error;
  store.lastSiteId = site.id;

  const extra =
    probe.status === "bridge-ready"
      ? " Ready to install and update plugins."
      : probe.error
        ? ` ${probe.error}`
        : "";

  return [
    agentText(`Checked ${site.label}: ${statusLabel(probe.status)}.${extra}`, {
      kind: "site",
      site: toPublicSite(site),
    }),
  ];
}

async function packPlugin(store: Store, intent: ParsedIntent): Promise<ChatMessage[]> {
  try {
    const plugin = await upsertPlugin(store, intent.path);
    const inspected = await inspectPlugin(plugin.path);
    return [
      agentText(
        `Packed ${plugin.name} ${plugin.version} (${inspected.files.length} files). Download the zip and upload it in WP Admin if you are not using the bridge yet.`,
        {
          kind: "pack",
          pluginId: plugin.id,
          slug: plugin.slug,
          name: plugin.name,
          version: plugin.version,
          files: inspected.files.slice(0, 40),
        },
      ),
    ];
  } catch (error) {
    return [agentText(errorMessage(error))];
  }
}

async function deployPlugin(
  store: Store,
  intent: ParsedIntent,
  action: "install" | "update",
): Promise<ChatMessage[]> {
  if (intent.url || intent.username || intent.password) {
    const connectReplies = await connectSite(store, intent);
    const site = pickSite(store, intent.url);
    if (!site || site.status === "auth-failed" || site.status === "not-wordpress") {
      return connectReplies;
    }
    if (!intent.path && !store.lastPluginId && store.plugins.length === 0) {
      return [
        ...connectReplies,
        agentText("Site is saved. Now send the local plugin folder to install."),
      ];
    }
  }

  let plugin: PluginRecord;
  try {
    plugin = await upsertPlugin(store, intent.path);
  } catch (error) {
    if (!intent.path && action === "update" && store.lastPluginId) {
      return [agentText(errorMessage(error))];
    }
    if (!intent.path) {
      return [
        agentText(
          action === "update"
            ? "Tell me which plugin folder to update, or install a plugin first."
            : "Send the local plugin folder. Example: install examples/hello-presspush on https://mysite.com",
        ),
      ];
    }
    return [agentText(errorMessage(error))];
  }

  const site = pickSite(store, intent.url);
  if (!site) {
    return [
      agentText(
        `I found ${plugin.name} at ${plugin.path}. Add a WordPress site to install it:\ninstall ${plugin.path} on https://yoursite.com`,
        { kind: "plugin", plugin },
      ),
    ];
  }

  if (!site.username || !site.applicationPassword) {
    return [
      agentText(
        `Plugin is ready (${plugin.name} ${plugin.version}), but ${site.label} has no credentials yet.\nconnect ${site.url} user YOURUSER password YOUR_APP_PASSWORD`,
        { kind: "plugin", plugin },
      ),
    ];
  }

  if (site.status === "bridge-missing") {
    const probe = await probeSite(site);
    site.status = probe.status;
    site.lastError = probe.error;
    site.lastCheckedAt = nowIso();
    if (probe.status === "bridge-missing") {
      return [
        agentText(
          `I can see ${site.label}, but PressPush Bridge is not installed. Install the bridge once, then say “${action}”.`,
          { kind: "bridge" },
        ),
      ];
    }
  }

  try {
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
      action,
      siteId: site.id,
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginVersion: remote.version || plugin.version,
      siteUrl: site.url,
      status: "success",
      message: remote.message || `Plugin ${remote.action} on ${site.label}.`,
      files: inspected.files,
      remoteAction: remote.action,
      active: remote.active,
      createdAt: nowIso(),
    };
    store.jobs.push(job);
    store.lastPluginId = plugin.id;
    store.lastSiteId = site.id;
    site.status = "bridge-ready";
    site.lastError = undefined;
    site.lastCheckedAt = nowIso();

    const verb = remote.action === "updated" ? "Updated" : "Installed";
    return [
      agentText(
        `${verb} ${plugin.name} ${job.pluginVersion} on ${site.label}. It is ${remote.active ? "active" : "installed but not active"}. After Cursor or Claude saves the plugin, tell me to update.`,
        { kind: "deploy", job },
      ),
    ];
  } catch (error) {
    const inspectedFiles = plugin ? (await inspectPlugin(plugin.path).catch(() => null))?.files ?? [] : [];
    const job: DeployJob = {
      id: nid(),
      action,
      siteId: site.id,
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      siteUrl: site.url,
      status: "error",
      message: errorMessage(error),
      files: inspectedFiles,
      createdAt: nowIso(),
    };
    store.jobs.push(job);

    const message = errorMessage(error);
    if (/bridge is not installed/i.test(message)) {
      site.status = "bridge-missing";
      return [agentText(message, { kind: "bridge" })];
    }
    return [agentText(message, { kind: "deploy", job })];
  }
}

async function removeSite(store: Store, intent: ParsedIntent): Promise<ChatMessage[]> {
  const site = pickSite(store, intent.url);
  if (!site) return [agentText("I do not have that site saved.")];
  store.sites = store.sites.filter((item) => item.id !== site.id);
  if (store.lastSiteId === site.id) store.lastSiteId = store.sites[0]?.id;
  return [agentText(`Removed ${site.label}.`)];
}

async function removePlugin(store: Store, intent: ParsedIntent): Promise<ChatMessage[]> {
  const plugin = intent.path
    ? store.plugins.find((item) => item.path.includes(intent.path!) || item.slug === intent.path)
    : store.plugins.find((item) => item.id === store.lastPluginId) ?? store.plugins[0];
  if (!plugin) return [agentText("I do not have that plugin saved.")];
  store.plugins = store.plugins.filter((item) => item.id !== plugin.id);
  if (store.lastPluginId === plugin.id) store.lastPluginId = store.plugins[0]?.id;
  return [agentText(`Stopped tracking ${plugin.name}. Files on disk were not deleted.`)];
}

async function upsertPlugin(store: Store, path?: string): Promise<PluginRecord> {
  if (!path) {
    const last = store.plugins.find((item) => item.id === store.lastPluginId) ?? store.plugins[0];
    if (!last) {
      throw new Error("No plugin folder yet. Send a path like examples/hello-presspush");
    }
    const inspected = await inspectPlugin(last.path);
    const record = toPluginRecord(inspected, last.id);
    Object.assign(last, record);
    store.lastPluginId = last.id;
    return last;
  }

  const inspected = await inspectPlugin(path);
  const existing = store.plugins.find(
    (item) => item.path === inspected.path || item.slug === inspected.slug,
  );
  const record = toPluginRecord(inspected, existing?.id);
  if (existing) Object.assign(existing, record);
  else store.plugins.push(record);
  store.lastPluginId = record.id;
  return existing ?? record;
}

function pickSite(store: Store, url?: string): Site | undefined {
  if (url) {
    try {
      const normalized = normalizeSiteUrl(url);
      return (
        store.sites.find((site) => site.url === normalized) ??
        store.sites.find((site) => site.url.includes(siteHost(normalized)))
      );
    } catch {
      return store.sites.find((site) => site.url.includes(url) || site.label.includes(url));
    }
  }
  return store.sites.find((site) => site.id === store.lastSiteId) ?? store.sites[0];
}

function findSite(store: Store, url: string): Site | undefined {
  return store.sites.find((site) => site.url === url);
}

function listMessage(store: Store): ChatMessage {
  if (store.sites.length === 0 && store.plugins.length === 0) {
    return agentText("Nothing connected yet. Send a site URL and a plugin folder.");
  }
  const sites = store.sites.length
    ? store.sites.map((site) => `• ${site.label} — ${statusLabel(site.status)}`).join("\n")
    : "• No sites";
  const plugins = store.plugins.length
    ? store.plugins.map((plugin) => `• ${plugin.name} ${plugin.version} — ${plugin.path}`).join("\n")
    : "• No plugins";
  return agentText(`Sites\n${sites}\n\nPlugins\n${plugins}`);
}

function helpText(): string {
  return [
    "How this works:",
    "1. Install PressPush Bridge once on the WordPress site (download button in the sidebar).",
    "2. Create a WordPress Application Password (Users → Profile).",
    "3. Tell me: install /path/to/plugin on https://yoursite.com",
    "4. When Cursor or Claude saves plugin files, say update. I zip the folder and overwrite the plugin on the site.",
    "",
    "You can also pack a zip and upload it yourself from WP Admin if you do not want the bridge yet.",
  ].join("\n");
}

function statusLabel(status: Site["status"]): string {
  switch (status) {
    case "bridge-ready":
      return "ready to push";
    case "bridge-missing":
      return "needs bridge plugin";
    case "auth-failed":
      return "bad credentials";
    case "not-wordpress":
      return "not WordPress";
    case "reachable":
      return "saved, waiting for credentials";
    case "error":
      return "unreachable";
    default:
      return "not checked";
  }
}

function agentText(text: string, card?: AgentCard): ChatMessage {
  return {
    id: nid(),
    role: "agent",
    text,
    createdAt: nowIso(),
    card,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  if (match) return match[0].replace(/[.,;]+$/, "");
  const domain = text.match(
    /(?:^|\s)((?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|site|blog|co|in|uk)(?:\/[^\s]*)?)/i,
  );
  if (domain && !domain[1].includes("example")) {
    return domain[1];
  }
  return undefined;
}

function extractPath(text: string, url?: string): string | undefined {
  const quoted = [...text.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  for (const candidate of quoted) {
    if (looksLikePath(candidate)) return candidate;
  }

  const onTo = text.match(
    /(?:install|deploy|push|update|sync|pack|zip)\s+(.+?)\s+(?:on|to|onto)\s+/i,
  );
  if (onTo?.[1] && looksLikePath(onTo[1].trim())) {
    return onTo[1].trim().replace(/^['"]|['"]$/g, "");
  }

  const win = text.match(/[a-zA-Z]:[\\/][^\s"']+/);
  if (win && win[0] !== url) return win[0];

  const unix = text.match(/(?:^|\s)((?:~|\/|\.\/|\.\.\/)[^\s"']+)/);
  if (unix?.[1]) return unix[1];

  const rel = text.match(/(?:^|\s)((?:examples|plugins|wp-content)\/[^\s"']+)/i);
  if (rel?.[1]) return rel[1];

  return undefined;
}

function looksLikePath(value: string): boolean {
  if (/^https?:/i.test(value)) return false;
  return /[\\/]/.test(value) || value.startsWith("~") || value.startsWith(".");
}

function extractUsername(text: string): string | undefined {
  const match = text.match(
    /(?:user(?:name)?|login|as)\s*[:=]?\s*["']?([A-Za-z0-9._@-]+)["']?/i,
  );
  if (!match) return undefined;
  if (["on", "to", "the", "site", "plugin"].includes(match[1].toLowerCase())) return undefined;
  return match[1];
}

function extractPassword(text: string): string | undefined {
  const labeled = text.match(
    /(?:app(?:lication)?\s*)?pass(?:word)?\s*[:=]\s*["']?([A-Za-z0-9 -]{8,})["']?/i,
  );
  if (labeled) return labeled[1].trim();

  const afterPassword = text.match(
    /(?:app(?:lication)?\s*)?password\s+([A-Za-z0-9]{4}(?:\s+[A-Za-z0-9]{4}){3,})/i,
  );
  if (afterPassword) return afterPassword[1].trim();

  return undefined;
}
