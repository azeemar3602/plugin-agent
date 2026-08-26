import { restRouteFallback, restUrl } from "./urls";
import type { Site, SiteStatus } from "./types";

export type RemoteTemplate = {
  id: number;
  title: string;
  type: string;
  date?: string;
};

export type ProbeResult = {
  status: SiteStatus;
  wordpressVersion?: string;
  helperVersion?: string;
  elementor?: boolean;
  elementorVersion?: string | null;
  templates?: RemoteTemplate[];
  error?: string;
};

export type RemoteDeployResult = {
  ok: boolean;
  action: "installed" | "updated";
  plugin: string;
  name: string;
  version: string;
  active: boolean;
  message?: string;
};

function authHeader(site: Site): string {
  const password = site.password.replace(/\s+/g, "");
  return `Basic ${Buffer.from(`${site.username}:${password}`).toString("base64")}`;
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: init.signal ?? AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json, text };
}

async function tryUrls(
  siteUrl: string,
  route: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const primary = restUrl(siteUrl, route);
  const first = await fetchJson(primary, init);
  if (first.status !== 404) return first;
  return fetchJson(restRouteFallback(siteUrl, `/${route}`), init);
}

export async function looksLikeWordPress(siteUrl: string): Promise<boolean> {
  const base = siteUrl.replace(/\/$/, "");
  try {
    const discovery = await fetchJson(`${base}/wp-json`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (
      discovery.ok &&
      typeof discovery.json === "object" &&
      discovery.json !== null &&
      ("namespaces" in discovery.json || "name" in discovery.json)
    ) {
      return true;
    }
    const alt = await fetchJson(restRouteFallback(base, "/"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return Boolean(
      alt.ok &&
        typeof alt.json === "object" &&
        alt.json !== null &&
        "namespaces" in alt.json,
    );
  } catch {
    return false;
  }
}

export async function probeSite(site: Site): Promise<ProbeResult> {
  const wordpress = await looksLikeWordPress(site.url);
  if (!wordpress) {
    return {
      status: "not-wordpress",
      error: "That URL does not expose the WordPress REST API.",
    };
  }

  if (!site.username || !site.password) {
    return { status: "unknown", error: "Need username and application password." };
  }

  const result = await tryUrls(site.url, "plugin-agent/v1/status", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authHeader(site),
    },
  });

  if (result.status === 401 || result.status === 403) {
    return {
      status: "auth-failed",
      error:
        "WordPress rejected the username or application password. Create one under Users → Profile → Application Passwords.",
    };
  }

  if (result.status === 404) {
    return {
      status: "helper-missing",
      error:
        "The site is WordPress, but the one-time Plugin Agent helper is not installed yet. Upload plugin-agent-bridge.zip under Plugins → Add New → Upload Plugin, activate it, then say do update.",
    };
  }

  if (!result.ok) {
    return {
      status: "error",
      error: wpErrorMessage(result.json, result.text, result.status),
    };
  }

  const payload = result.json as {
    wordpress?: string;
    version?: string;
    elementor?: boolean;
    elementorVersion?: string | null;
    templates?: RemoteTemplate[];
  };
  return {
    status: "connected",
    wordpressVersion: payload.wordpress,
    helperVersion: payload.version,
    elementor: Boolean(payload.elementor),
    elementorVersion: payload.elementorVersion,
    templates: payload.templates ?? [],
  };
}

export type RemotePlugin = {
  file: string;
  name: string;
  status: string;
  version: string;
};

export async function listPlugins(site: Site): Promise<RemotePlugin[]> {
  const result = await tryUrls(site.url, "wp/v2/plugins", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authHeader(site),
    },
  });
  if (!result.ok || !Array.isArray(result.json)) return [];
  return result.json.map((item) => {
    const rec = item as {
      plugin?: string;
      name?: string;
      status?: string;
      version?: string;
    };
    return {
      file: rec.plugin || "",
      name: rec.name || rec.plugin || "Plugin",
      status: rec.status || "unknown",
      version: rec.version || "",
    };
  });
}

export async function deployZip(options: {
  site: Site;
  zip: Buffer;
  filename: string;
  slug: string;
  activate: boolean;
}): Promise<RemoteDeployResult> {
  const form = new FormData();
  form.set(
    "file",
    new Blob([new Uint8Array(options.zip)], { type: "application/zip" }),
    options.filename,
  );
  form.set("activate", options.activate ? "1" : "0");
  form.set("slug", options.slug);

  const result = await tryUrls(options.site.url, "plugin-agent/v1/deploy", {
    method: "POST",
    headers: {
      Authorization: authHeader(options.site),
      Accept: "application/json",
    },
    body: form,
    signal: AbortSignal.timeout(90000),
  });

  if (result.status === 401 || result.status === 403) {
    throw new Error(
      "WordPress rejected the username or application password. Use an administrator Application Password from Users → Profile.",
    );
  }

  if (result.status === 404) {
    throw new Error("HELPER_MISSING");
  }

  if (!result.ok) {
    throw new Error(wpErrorMessage(result.json, result.text, result.status));
  }

  const payload = result.json as RemoteDeployResult;
  if (!payload?.ok) {
    throw new Error(payload?.message || "The site did not confirm the deploy.");
  }
  return payload;
}

export type TemplateImportResult = {
  ok: boolean;
  imported: Array<{ id?: number; title: string; type?: string; file?: string }>;
  errors?: string[];
  message?: string;
};

export async function importElementorFiles(options: {
  site: Site;
  files: Array<{ filename: string; buffer: Buffer }>;
}): Promise<TemplateImportResult> {
  if (options.files.length === 0) {
    throw new Error("No Elementor template files to import.");
  }

  const form = new FormData();
  for (const file of options.files) {
    const type = file.filename.toLowerCase().endsWith(".zip")
      ? "application/zip"
      : "application/json";
    form.append(
      "files",
      new Blob([new Uint8Array(file.buffer)], { type }),
      file.filename,
    );
  }

  const result = await tryUrls(options.site.url, "plugin-agent/v1/templates", {
    method: "POST",
    headers: {
      Authorization: authHeader(options.site),
      Accept: "application/json",
    },
    body: form,
    signal: AbortSignal.timeout(90000),
  });

  if (result.status === 401 || result.status === 403) {
    throw new Error(
      "WordPress rejected the username or application password. Use an administrator Application Password from Users → Profile.",
    );
  }

  if (result.status === 404) {
    throw new Error(
      "This Plugin Agent Helper is too old for templates. Download the helper zip from this app, upload it under Plugins → Add New → Upload Plugin (replace current), activate it, then drop the templates again.",
    );
  }

  if (!result.ok) {
    throw new Error(wpErrorMessage(result.json, result.text, result.status));
  }

  const payload = result.json as TemplateImportResult;
  if (!payload?.ok) {
    throw new Error(payload?.message || "The site did not import the templates.");
  }
  return payload;
}

export type CreatedPageResult = {
  ok: boolean;
  id: number;
  url: string;
  edit?: string;
  title?: string;
};

export async function createElementorPage(options: {
  site: Site;
  title: string;
  slug?: string;
  id?: number;
  status?: "publish" | "draft" | "private";
  elementor: { content: unknown[]; page_settings?: Record<string, unknown>; title?: string };
}): Promise<CreatedPageResult> {
  const result = await tryUrls(options.site.url, "plugin-agent/v1/page", {
    method: "POST",
    headers: {
      Authorization: authHeader(options.site),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: options.id,
      title: options.title,
      slug: options.slug,
      status: options.status ?? "publish",
      elementor: options.elementor,
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (result.status === 401 || result.status === 403) {
    throw new Error(
      "WordPress rejected the username or application password. Use an administrator Application Password from Users → Profile.",
    );
  }
  if (result.status === 404) {
    throw new Error(
      "This Plugin Agent Helper is too old to create pages. Download the helper zip, replace the current helper, activate it, then try again.",
    );
  }
  if (!result.ok) {
    throw new Error(wpErrorMessage(result.json, result.text, result.status));
  }
  const payload = result.json as CreatedPageResult;
  if (!payload?.ok || !payload.id) {
    throw new Error("The site did not create the Elementor page.");
  }
  return payload;
}

export type RemoteElementorWidget = {
  type: string;
  title: string;
  plugin?: string;
  custom?: boolean;
  axion?: boolean;
  controls?: Record<
    string,
    { type: string; label?: string; default?: unknown; options?: string[] | null; fields?: string[] | null }
  >;
};

export async function listElementorWidgets(site: Site): Promise<RemoteElementorWidget[]> {
  const result = await tryUrls(site.url, "plugin-agent/v1/widgets", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authHeader(site),
    },
  });
  if (!result.ok || !result.json || typeof result.json !== "object") return [];
  const payload = result.json as { widgets?: RemoteElementorWidget[] };
  return (payload.widgets ?? []).map((item) => ({
    type: item.type,
    title: item.title,
    plugin: item.plugin,
    custom: item.custom ?? item.axion,
    axion: item.axion,
    controls: item.controls,
  }));
}

export async function findPageIdBySlug(site: Site, slug: string): Promise<number | undefined> {
  const result = await tryUrls(site.url, `wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=id,slug`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authHeader(site),
    },
  });
  if (!result.ok || !Array.isArray(result.json) || result.json.length === 0) return undefined;
  const id = (result.json[0] as { id?: number }).id;
  return typeof id === "number" ? id : undefined;
}

function wpErrorMessage(json: unknown, text: string, status: number): string {
  if (json && typeof json === "object") {
    const rec = json as { message?: string };
    if (rec.message) return rec.message;
  }
  if (text && text.length < 300 && !text.trim().startsWith("<")) return text;
  return `WordPress returned HTTP ${status}.`;
}
