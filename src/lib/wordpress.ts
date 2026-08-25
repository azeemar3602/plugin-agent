import { restRouteFallback, restUrl } from "./urls";
import type { Site, SiteStatus } from "./types";

export type ProbeResult = {
  status: SiteStatus;
  wordpressVersion?: string;
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

  const payload = result.json as { wordpress?: string };
  return { status: "connected", wordpressVersion: payload.wordpress };
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

function wpErrorMessage(json: unknown, text: string, status: number): string {
  if (json && typeof json === "object") {
    const rec = json as { message?: string };
    if (rec.message) return rec.message;
  }
  if (text && text.length < 300 && !text.trim().startsWith("<")) return text;
  return `WordPress returned HTTP ${status}.`;
}
