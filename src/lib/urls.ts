export function normalizeSiteUrl(input: string): string {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`That does not look like a site URL: ${input}`);
  }

  parsed.hash = "";
  parsed.search = "";

  const stripped = parsed.pathname
    .replace(/\/wp-admin\/?.*$/i, "")
    .replace(/\/wp-login\.php$/i, "")
    .replace(/\/+$/, "");

  parsed.pathname = stripped || "/";
  const href = parsed.toString().replace(/\/$/, "");
  return href;
}

export function restUrl(siteUrl: string, route: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const cleanRoute = route.replace(/^\//, "");
  return `${base}/wp-json/${cleanRoute}`;
}

export function restRouteFallback(siteUrl: string, route: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const cleanRoute = route.startsWith("/") ? route : `/${route}`;
  return `${base}/?rest_route=${encodeURIComponent(cleanRoute)}`;
}

export function siteHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function redactPassword(password: string): string {
  const compact = password.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  return `${compact.slice(0, 2)}••••${compact.slice(-2)}`;
}
