import { restRouteFallback, restUrl } from "./urls";
import type { Site, SiteStatus } from "./types";

export type ProbeResult = {
  status: SiteStatus;
  wordpressVersion?: string;
  error?: string;
  bridgeVersion?: string;
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
  const password = site.applicationPassword.replace(/\s+/g, "");
  return `Basic ${Buffer.from(`${site.username}:${password}`).toString("base64")}`;
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
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
): Promise<{ ok: boolean; status: number; json: unknown; text: string; used: string }> {
  const primary = restUrl(siteUrl, route);
  const first = await fetchJson(primary, init);
  if (first.status !== 404) {
    return { ...first, used: primary };
  }
  const secondUrl = restRouteFallback(siteUrl, `/${route}`);
  const second = await fetchJson(secondUrl, init);
  return { ...second, used: secondUrl };
}

export async function probeSite(site: Site): Promise<ProbeResult> {
  try {
    const discovery = await fetchJson(`${site.url.replace(/\/$/, "")}/wp-json`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const looksLikeWp =
      discovery.ok ||
      discovery.status === 401 ||
      (typeof discovery.json === "object" &&
        discovery.json !== null &&
        ("namespaces" in discovery.json || "name" in discovery.json));

    if (!looksLikeWp && discovery.status === 404) {
      const alt = await fetchJson(restRouteFallback(site.url, "/"), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (
        !alt.ok &&
        alt.status !== 401 &&
        !(typeof alt.json === "object" && alt.json !== null && "namespaces" in alt.json)
      ) {
        return {
          status: "not-wordpress",
          error:
            "That URL did not expose the WordPress REST API. Check the domain, and that permalinks or ?rest_route= work.",
        };
      }
    } else if (!looksLikeWp) {
      return {
        status: "not-wordpress",
        error: `The site responded with HTTP ${discovery.status} and does not look like WordPress.`,
      };
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (site.username && site.applicationPassword) {
      headers.Authorization = authHeader(site);
    }

    const statusRes = await tryUrls(site.url, "presspush/v1/status", {
      method: "GET",
      headers,
    });

    if (statusRes.status === 401 || statusRes.status === 403) {
      return {
        status: site.applicationPassword ? "auth-failed" : "reachable",
        error: site.applicationPassword
          ? "WordPress rejected the username or application password. Create a new Application Password under Users → Profile."
          : "PressPush Bridge looks installed. Add a WordPress administrator username and Application Password to push plugins.",
      };
    }

    if (statusRes.status === 404) {
      return {
        status: "bridge-missing",
        error:
          "WordPress is reachable, but PressPush Bridge is not installed yet. Download the bridge plugin and upload it once in WP Admin → Plugins → Add New → Upload Plugin.",
      };
    }

    if (!statusRes.ok) {
      return {
        status: "error",
        error: wpErrorMessage(statusRes.json, statusRes.text, statusRes.status),
      };
    }

    const payload = statusRes.json as {
      ok?: boolean;
      version?: string;
      wordpress?: string;
    };

    return {
      status: "bridge-ready",
      wordpressVersion: payload.wordpress,
      bridgeVersion: payload.version,
    };
  } catch (error) {
    return {
      status: "error",
      error:
        error instanceof Error
          ? error.message
          : "Could not reach the site. Check the URL and that this machine can talk to it.",
    };
  }
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

  const headers: Record<string, string> = {
    Authorization: authHeader(options.site),
    Accept: "application/json",
  };

  const result = await tryUrls(options.site.url, "presspush/v1/deploy", {
    method: "POST",
    headers,
    body: form,
  });

  if (result.status === 401 || result.status === 403) {
    throw new Error(
      "WordPress rejected the credentials. Use an administrator account and a WordPress Application Password, not the login password.",
    );
  }

  if (result.status === 404) {
    throw new Error(
      "PressPush Bridge is not installed on that site. Download the bridge, upload it in WP Admin, activate it, then tell me to try again.",
    );
  }

  if (!result.ok) {
    throw new Error(wpErrorMessage(result.json, result.text, result.status));
  }

  const payload = result.json as RemoteDeployResult;
  if (!payload?.ok) {
    throw new Error(payload?.message || "The site accepted the upload but did not confirm a deploy.");
  }
  return payload;
}

function wpErrorMessage(json: unknown, text: string, status: number): string {
  if (json && typeof json === "object") {
    const rec = json as { message?: string; code?: string; data?: { status?: number } };
    if (rec.message) return rec.message;
  }
  if (text && text.length < 300 && !text.trim().startsWith("<")) return text;
  return `WordPress returned HTTP ${status}.`;
}
