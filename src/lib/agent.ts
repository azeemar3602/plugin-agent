import { inspectPlugin, isWindowsAbsPath, toPluginRecord, zipPlugin } from "./plugin";
import { nid, nowIso } from "./ids";
import { mutateStore, toPublicSite, toPublicStore } from "./store";
import type {
  AgentCard,
  AgentGoal,
  AgentStep,
  ChatMessage,
  DeployJob,
  PendingAsk,
  PendingTask,
  PluginRecord,
  PublicStore,
  Site,
  Store,
} from "./types";
import { normalizeSiteUrl, siteHost } from "./urls";
import { deployZip, looksLikeWordPress, probeSite } from "./wordpress";

export type AgentResult = {
  store: PublicStore;
  replies: ChatMessage[];
};

export async function handleAgentMessage(text: string): Promise<AgentResult> {
  const replies: ChatMessage[] = [];

  const store = await mutateStore(async (current) => {
    const redacted = redactSecrets(text, current);
    current.messages.push({
      id: nid(),
      role: "user",
      text: redacted,
      createdAt: nowIso(),
    });

    const produced = await runAgent(current, text.trim());
    for (const message of produced) {
      current.messages.push(message);
      replies.push(message);
    }
  });

  return { store: toPublicStore(store), replies };
}

export async function selectStoredSite(siteId: string): Promise<PublicStore> {
  const store = await mutateStore((current) => {
    const site = current.sites.find((item) => item.id === siteId);
    if (!site) throw new Error("That site is not saved yet.");
    current.lastSiteId = site.id;
    current.pending = {
      goal: "update",
      url: site.url,
      username: site.username,
      password: site.password,
    };
  });
  return toPublicStore(store);
}

export async function pushPluginNow(): Promise<AgentResult> {
  const replies: ChatMessage[] = [];
  const store = await mutateStore(async (current) => {
    const pending: PendingTask = current.pending ?? { goal: "update" };
    pending.goal = "update";
    fillFromMemory(current, pending);
    const ask = nextAsk(pending);
    pending.ask = ask;
    current.pending = pending;
    if (ask) {
      const message = say(askPrompt(ask, pending));
      current.messages.push(message);
      replies.push(message);
      return;
    }
    if (!pending.path) {
      const message = say(
        "This site is connected, but I don't have plugin files yet. Drop the plugin zip or folder.",
      );
      current.messages.push(message);
      replies.push(message);
      return;
    }
    const produced = await deployNow(current, pending);
    for (const message of produced) {
      current.messages.push(message);
      replies.push(message);
    }
  });
  return { store: toPublicStore(store), replies };
}

async function runAgent(store: Store, text: string): Promise<ChatMessage[]> {
  const lower = text.toLowerCase();

  if (isHelp(lower) && !extractUrl(text) && !extractPath(text)) {
    return [say(helpText())];
  }

  if (isNewSiteCommand(lower) && !extractPassword(text)) {
    const url = extractUrl(text);
    store.pending = {
      goal: "install",
      url: url ? normalizeMaybeUrl(url) : undefined,
      ask: url ? "username" : "url",
    };
    if (url) {
      const known = store.sites.find((item) => item.url === store.pending?.url);
      if (known) {
        store.pending.username = known.username;
        store.pending.password = known.password;
        store.lastSiteId = known.id;
        store.pending.ask = undefined;
        return [
          say(
            `Switched to **${known.label}**. Drop a plugin or Elementor templates — they install on this site.`,
            [],
            { kind: "site", site: toPublicSite(known) },
          ),
        ];
      }
      return [say(`Got ${store.pending.url}. What's the WordPress username for this site?`)];
    }
    return [say("What's the URL of the other WordPress site?")];
  }

  const pending: PendingTask = store.pending ?? { goal: inferGoal(text, store) };
  const previousUrl = pending.url;
  const slots = extractSlots(text, pending.ask);
  const commanded = /\b(install|update|sync|deploy|push|pack|zip|upload|connect)\b/i.test(text);

  if (
    !store.pending &&
    !slots.url &&
    !slots.path &&
    !slots.username &&
    !slots.password &&
    !commanded
  ) {
    store.pending = { goal: "install", ask: "url" };
    return [say("What's the WordPress site URL?")];
  }

  if (slots.url) {
    const nextUrl = normalizeMaybeUrl(slots.url);
    if (previousUrl && previousUrl !== nextUrl) {
      const known = store.sites.find((item) => item.url === nextUrl);
      pending.username = known?.username;
      pending.password = known?.password;
    }
    pending.url = nextUrl;
  }
  if (slots.path) pending.path = slots.path;
  if (slots.username) pending.username = slots.username;
  if (slots.password) pending.password = slots.password;
  pending.goal = inferGoal(text, store, pending.goal);

  fillFromMemory(store, pending);

  const ask = nextAsk(pending);
  pending.ask = ask;
  store.pending = pending;

  if (ask) {
    return [say(askPrompt(ask, pending))];
  }

  if (pending.goal === "pack") {
    return packPlugin(store, pending.path);
  }

  if (!pending.path) {
    const site = upsertSite(store, {
      url: normalizeMaybeUrl(pending.url!),
      username: pending.username!,
      password: pending.password!,
    });
    pending.ask = undefined;
    store.pending = pending;
    return [
      say(
        `Connected **${site.label}**. Drop a plugin zip or Elementor JSON to install on this site. For another website, click **Add site** or paste its URL.`,
        [],
        { kind: "site", site: toPublicSite(site) },
      ),
    ];
  }

  return deployNow(store, pending);
}

function inferGoal(text: string, _store: Store, fallback: AgentGoal = "install"): AgentGoal {
  if (/\b(pack|zip|download zip)\b/i.test(text)) return "pack";
  if (
    /\bdo\s+(the\s+)?update\b/i.test(text) ||
    /\b(update|sync|redeploy)\b/i.test(text)
  ) {
    return "update";
  }
  if (/\b(install|deploy|upload|push)\b/i.test(text)) return "install";
  return fallback;
}

function fillFromMemory(store: Store, pending: PendingTask) {
  if (!pending.url && store.lastSiteId) {
    const site = store.sites.find((item) => item.id === store.lastSiteId) ?? store.sites[0];
    if (site) {
      pending.url = site.url;
      pending.username = pending.username || site.username;
      pending.password = pending.password || site.password;
    }
  } else if (pending.url) {
    const site = store.sites.find((item) => item.url === pending.url);
    if (site) {
      pending.username = pending.username || site.username;
      pending.password = pending.password || site.password;
    }
  }

  // Never reuse the last plugin just because a new site was connected.
  if (!pending.path && store.lastPluginId && pending.goal === "update") {
    const plugin = store.plugins.find((item) => item.id === store.lastPluginId);
    if (plugin && isDeployablePluginPath(plugin.path)) pending.path = plugin.path;
  }

  if (pending.url && (!pending.username || !pending.password)) {
    const site = store.sites.find((item) => item.url === pending.url);
    if (site) {
      pending.username = pending.username || site.username;
      pending.password = pending.password || site.password;
    }
  }
}

function nextAsk(pending: PendingTask): PendingAsk | undefined {
  if (pending.goal === "pack") {
    return pending.path ? undefined : "path";
  }
  if (!pending.url) return "url";
  if (!pending.username) return "username";
  if (!pending.password) return "password";
  return undefined;
}

function askPrompt(ask: PendingAsk, pending: PendingTask): string {
  switch (ask) {
    case "url":
      return "What's the WordPress site URL? Example: `https://yoursite.com`";
    case "username":
      return `Got ${pending.url}. What's the WordPress username?`;
    case "password":
      return `Username **${pending.username}**. Paste an Application Password (Users → Profile → Application Passwords). Not the login password.`;
    case "path":
      return "Use **Select plugin folder on this PC** below and pick your plugin folder (the one with the main .php file, for example Downloads\\Plug). Typing a C:\\ path will not work from this server — I need the files uploaded here. You can also use **Zip**.";
  }
}

async function packPlugin(store: Store, pluginPath?: string): Promise<ChatMessage[]> {
  try {
    const plugin = await upsertPlugin(store, pluginPath);
    const inspected = await inspectPlugin(plugin.path);
    store.pending = undefined;
    return [
      say(
        `Packed ${plugin.name} ${plugin.version} (${inspected.files.length} files). You can download the zip if you want to upload it yourself.`,
        [],
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
    return [say(errorMessage(error))];
  }
}

async function deployNow(store: Store, pending: PendingTask): Promise<ChatMessage[]> {
  const steps: AgentStep[] = [];
  const action = pending.goal === "update" ? "update" : "install";

  let plugin: PluginRecord;
  try {
    plugin = await upsertPlugin(store, pending.path);
    if (isSamplePluginPath(plugin.path)) {
      return [
        say(
          "That's the bundled sample plugin, not your project. Use **Select plugin folder on this PC** and choose your real plugin folder (Downloads\\Plug), or Zip that folder. I will not push the sample to your live site.",
        ),
      ];
    }
    steps.push({
      tool: "inspect_plugin",
      label: "Read local plugin folder",
      status: "done",
      detail: `${plugin.name} ${plugin.version} · ${plugin.fileCount} files`,
    });
  } catch (error) {
    if (pending.path && isWindowsAbsPath(pending.path)) {
      pending.path = undefined;
      pending.ask = "path";
      store.pending = pending;
    }
    steps.push({
      tool: "inspect_plugin",
      label: "Read local plugin folder",
      status: "error",
      detail: errorMessage(error),
    });
    return [say(errorMessage(error), steps)];
  }

  let url: string;
  try {
    url = normalizeSiteUrl(pending.url!);
  } catch (error) {
    return [say(errorMessage(error), steps)];
  }

  const site = upsertSite(store, {
    url,
    username: pending.username!,
    password: pending.password!,
  });

  try {
    const wordpress = await looksLikeWordPress(site.url);
    steps.push({
      tool: "check_site",
      label: "Check WordPress site",
      status: wordpress ? "done" : "error",
      detail: wordpress ? site.url : "That URL does not look like WordPress.",
    });
    if (!wordpress) {
      site.status = "not-wordpress";
      return [
        say(
          `${site.url} does not look like a WordPress site (no wp-json). Check the domain.`,
          steps,
        ),
      ];
    }

    const probe = await probeSite(site);
    if (probe.status === "auth-failed") {
      site.status = "auth-failed";
      pending.password = undefined;
      pending.ask = "password";
      store.pending = pending;
      steps.push({
        tool: "wordpress_auth",
        label: "Check application password",
        status: "error",
        detail: probe.error,
      });
      return [say(probe.error || "Application password was rejected.", steps)];
    }
    if (probe.status === "helper-missing") {
      site.status = "helper-missing";
      steps.push({
        tool: "wordpress_helper",
        label: "Find REST helper",
        status: "error",
        detail: "Helper plugin not installed yet",
      });
      return [
        say(
          "Application passwords talk to the REST API. Upload this one-time helper (Plugins → Add New → Upload Plugin), activate it, then use **Select plugin folder on this PC** so I can push *your* plugin (the helper is not that plugin).",
          steps,
          { kind: "helper" },
        ),
      ];
    }
    steps.push({
      tool: "wordpress_auth",
      label: "Check application password",
      status: "done",
      detail: site.username,
    });
  } catch (error) {
    steps.push({
      tool: "check_site",
      label: "Check WordPress site",
      status: "error",
      detail: errorMessage(error),
    });
  }

  try {
    const inspected = await inspectPlugin(plugin.path);
    Object.assign(plugin, toPluginRecord(inspected, plugin.id));
    const zip = await zipPlugin(plugin.path, plugin.slug);
    steps.push({
      tool: "zip_plugin",
      label: "Zip plugin from disk",
      status: "done",
      detail: `${plugin.slug}.zip`,
    });

    const remote = await deployZip({
      site,
      zip,
      filename: `${plugin.slug}.zip`,
      slug: plugin.slug,
      activate: true,
    });

    steps.push({
      tool: action === "update" ? "update_plugin" : "install_plugin",
      label: action === "update" ? "Update plugin on the site" : "Install plugin on the site",
      status: "done",
      detail: remote.message,
    });

    const job: DeployJob = {
      id: nid(),
      action,
      siteId: site.id,
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      siteUrl: site.url,
      status: "success",
      message: remote.message || "Plugin pushed to WordPress.",
      files: inspected.files,
      remoteAction: remote.action,
      active: remote.active,
      createdAt: nowIso(),
    };
    store.jobs.push(job);
    store.lastPluginId = plugin.id;
    store.lastSiteId = site.id;
    store.pending = undefined;
    site.status = "connected";
    site.lastError = undefined;
    site.lastCheckedAt = nowIso();

    const verb = remote.action === "updated" ? "Updated" : "Installed";
    return [
      say(
        `${verb} **${plugin.name} ${plugin.version}** on ${site.label}. It should now appear under WP Admin → Plugins. When the files change, select the folder again or say **do update**.`,
        steps,
        { kind: "deploy", job },
      ),
    ];
  } catch (error) {
    const message = errorMessage(error);
    if (message === "HELPER_MISSING") {
      site.status = "helper-missing";
      steps.push({
        tool: "install_plugin",
        label: "Push plugin to WordPress",
        status: "error",
        detail: "Helper plugin not installed",
      });
      return [
        say(
          "Upload the one-time helper zip (Plugins → Add New → Upload Plugin), activate it, then use **Select plugin folder on this PC** and pick your plugin (not the helper).",
          steps,
          { kind: "helper" },
        ),
      ];
    }
    steps.push({
      tool: "install_plugin",
      label: "Push plugin to WordPress",
      status: "error",
      detail: message,
    });
    const job: DeployJob = {
      id: nid(),
      action,
      siteId: site.id,
      pluginId: plugin.id,
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      siteUrl: site.url,
      status: "error",
      message,
      files: [],
      createdAt: nowIso(),
    };
    store.jobs.push(job);
    if (/application password|rejected the username/i.test(message)) {
      site.status = "auth-failed";
      pending.password = undefined;
      pending.ask = "password";
      store.pending = pending;
    } else {
      site.status = "error";
      site.lastError = message;
    }
    site.lastCheckedAt = nowIso();
    return [say(message, steps, { kind: "deploy", job })];
  }
}

function upsertSite(
  store: Store,
  input: { url: string; username: string; password: string },
): Site {
  const existing = store.sites.find((item) => item.url === input.url);
  if (existing) {
    existing.username = input.username;
    existing.password = input.password;
    store.lastSiteId = existing.id;
    return existing;
  }
  const site: Site = {
    id: nid(),
    url: input.url,
    username: input.username,
    password: input.password,
    label: siteHost(input.url),
    status: "unknown",
  };
  store.sites.push(site);
  store.lastSiteId = site.id;
  return site;
}

async function upsertPlugin(store: Store, pluginPath?: string): Promise<PluginRecord> {
  if (!pluginPath) {
    const last = store.plugins.find((item) => item.id === store.lastPluginId);
    if (!last || !isDeployablePluginPath(last.path)) {
      throw new Error(
        "No plugin files on this server yet. Use Select plugin folder on this PC (or Zip) so I can read your plugin.",
      );
    }
    const inspected = await inspectPlugin(last.path);
    const record = toPluginRecord(inspected, last.id);
    Object.assign(last, record);
    store.lastPluginId = last.id;
    return last;
  }

  const inspected = await inspectPlugin(pluginPath);
  const existing = store.plugins.find(
    (item) =>
      item.path === inspected.path ||
      (item.slug === inspected.slug && isDeployablePluginPath(item.path)),
  );
  const record = toPluginRecord(inspected, existing?.id);
  if (existing) Object.assign(existing, record);
  else store.plugins.push(record);
  store.lastPluginId = record.id;
  return existing ?? record;
}

function isSamplePluginPath(pluginPath: string): boolean {
  const normalized = pluginPath.replace(/\\/g, "/");
  return normalized.includes("/examples/hello-presspush");
}

function isDeployablePluginPath(pluginPath: string): boolean {
  return Boolean(pluginPath) && !isWindowsAbsPath(pluginPath) && !isSamplePluginPath(pluginPath);
}

function extractSlots(text: string, ask?: PendingAsk) {
  const url = extractUrl(text);
  let username = extractUsername(text);
  let password = extractPassword(text);

  if (ask === "path") {
    const raw = text.trim().replace(/^['"]|['"]$/g, "");
    if (raw && !/^https?:\/\//i.test(raw) && !/\bdo\s+update\b/i.test(raw)) {
      return { url, path: raw, username, password };
    }
  }

  const path = extractPath(text, url);

  if (ask === "password" && !password && !url && !path && !extractUsername(text)) {
    password = text.trim();
  } else if (ask === "username" && !username && !url && !path) {
    username = text.trim().split(/\s+/)[0];
  } else if (ask === "url" && !url && looksLikeHost(text.trim())) {
    return { url: text.trim(), path, username, password };
  }

  return { url, path, username, password };
}

function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  if (match) return match[0].replace(/[.,;]+$/, "");
  const domain = text.match(
    /(?:^|\s)((?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|site|blog|co|in|uk|info)(?:\/[^\s]*)?)/i,
  );
  return domain?.[1];
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

  const win = text.match(/(?:^|[\s"'])([a-zA-Z]:[\\/][^\n"']+)/);
  if (win?.[1] && win[1] !== url) return win[1].trim().replace(/[.,;]+$/, "");

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

function looksLikeHost(value: string): boolean {
  return /^(?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(value);
}

function extractUsername(text: string): string | undefined {
  if (/^[a-zA-Z]:[\\/]/.test(text.trim()) || /\\/.test(text)) return undefined;
  const match = text.match(
    /\b(?:user(?:name)?|login)\b\s*[:=]?\s*["']?([A-Za-z0-9._@-]+)["']?/i,
  );
  if (!match) return undefined;
  if (["on", "to", "the", "site", "plugin"].includes(match[1].toLowerCase())) return undefined;
  return match[1];
}

function extractPassword(text: string): string | undefined {
  const labeled = text.match(
    /(?:app(?:lication)?\s*)?pass(?:word)?\s*[:=]\s*["']?([^\n]+?)["']?\s*$/i,
  );
  if (labeled) return labeled[1].trim();

  const grouped = text.match(
    /\b([A-Za-z0-9]{4}(?:\s+[A-Za-z0-9]{4}){5})\b/,
  );
  if (grouped) return grouped[1].trim();

  return undefined;
}

function normalizeMaybeUrl(value: string): string {
  try {
    return normalizeSiteUrl(value);
  } catch {
    return value;
  }
}

function isHelp(lower: string): boolean {
  return /\b(help|how (do|does|to)|what can you|instructions)\b/.test(lower);
}

function isNewSiteCommand(lower: string): boolean {
  return /\b(add|another|second|new|other|different|switch)\b.{0,24}\b(web\s*)?site\b/.test(
    lower,
  );
}

function helpText(): string {
  return [
    "I can connect more than one WordPress site. Use **Add site**, or paste the second site URL.",
    "Each site needs its own username and application password.",
    "Then drag a plugin zip and/or Elementor JSON — they install on the site selected in the header.",
    "Plugin Agent Helper must be installed (once) on each site.",
  ].join("\n");
}

function say(text: string, steps?: AgentStep[], card?: AgentCard): ChatMessage {
  return {
    id: nid(),
    role: "agent",
    text,
    createdAt: nowIso(),
    steps: steps?.length ? steps : undefined,
    card,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function redactSecrets(text: string, store: Store): string {
  let out = text;
  const secrets = [
    store.pending?.password,
    ...store.sites.map((site) => site.password),
  ].filter(Boolean) as string[];
  const extracted = extractPassword(text);
  if (extracted) secrets.push(extracted);
  if (store.pending?.ask === "password" && !extractUrl(text) && !extractPath(text)) {
    secrets.push(text.trim());
  }
  for (const secret of secrets) {
    if (secret.length >= 4) out = out.split(secret).join("••••••••");
  }
  return out;
}

