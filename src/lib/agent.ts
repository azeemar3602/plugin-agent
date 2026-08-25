import { inspectPlugin, toPluginRecord, zipPlugin } from "./plugin";
import { nid, nowIso } from "./ids";
import { mutateStore, toPublicStore } from "./store";
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

async function runAgent(store: Store, text: string): Promise<ChatMessage[]> {
  const lower = text.toLowerCase();

  if (isHelp(lower) && !extractUrl(text) && !extractPath(text)) {
    return [say(helpText())];
  }

  const pending: PendingTask = store.pending ?? { goal: inferGoal(text, store) };
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

  if (slots.url) pending.url = normalizeMaybeUrl(slots.url);
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

  if (!pending.path && store.lastPluginId) {
    const plugin = store.plugins.find((item) => item.id === store.lastPluginId) ?? store.plugins[0];
    if (plugin) pending.path = plugin.path;
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
  if (!pending.path) return "path";
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
      return "What's the local plugin folder path? The directory Cursor/Claude saves, for example `examples/hello-presspush`.";
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
    steps.push({
      tool: "inspect_plugin",
      label: "Read local plugin folder",
      status: "done",
      detail: `${plugin.name} ${plugin.version} · ${plugin.fileCount} files`,
    });
  } catch (error) {
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
          "Application passwords talk to the REST API. Upload this one-time helper (Plugins → Add New → Upload Plugin), activate it, then send the plugin folder or say **do update**.",
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
        `${verb} **${plugin.name} ${plugin.version}** on ${site.label}. When Cursor or Claude saves the plugin, say **do update**.`,
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
          "Upload the one-time helper zip (Plugins → Add New → Upload Plugin), activate it, then say **do update**.",
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
    const last = store.plugins.find((item) => item.id === store.lastPluginId) ?? store.plugins[0];
    if (!last) throw new Error("No plugin folder yet. Send a path like examples/hello-presspush");
    const inspected = await inspectPlugin(last.path);
    const record = toPluginRecord(inspected, last.id);
    Object.assign(last, record);
    store.lastPluginId = last.id;
    return last;
  }

  const inspected = await inspectPlugin(pluginPath);
  const existing = store.plugins.find(
    (item) => item.path === inspected.path || item.slug === inspected.slug,
  );
  const record = toPluginRecord(inspected, existing?.id);
  if (existing) Object.assign(existing, record);
  else store.plugins.push(record);
  store.lastPluginId = record.id;
  return existing ?? record;
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
  const match = text.match(
    /(?:user(?:name)?|login)\s*[:=]?\s*["']?([A-Za-z0-9._@-]+)["']?/i,
  );
  return match?.[1];
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

function helpText(): string {
  return [
    "I ask for the WordPress site URL, username, and application password, then the local plugin folder.",
    "Create the application password under Users → Profile → Application Passwords.",
    "After Cursor or Claude saves the plugin, say **do update** — I re-read that folder and push it.",
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

