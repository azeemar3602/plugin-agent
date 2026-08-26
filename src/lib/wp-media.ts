export type HostedMedia = { id: number; url: string };

const IMAGE_HOST = /unsplash\.com|placehold\.co|images\.unsplash/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg)(\?|$)/i;

export function collectRemoteImageUrls(value: unknown): string[] {
  const found = new Set<string>();
  walk(value, found);
  return [...found];
}

function walk(value: unknown, found: Set<string>) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/https?:\/\/[^"' \s<>]+/gi)) {
      const url = match[0].replace(/[.,);]+$/, "");
      if (looksLikeImageUrl(url)) found.add(url);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found);
    return;
  }
  if (!value || typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  if (typeof rec.url === "string" && /^https?:\/\//i.test(rec.url)) {
    if ("id" in rec || "alt" in rec || "source" in rec || looksLikeImageUrl(rec.url)) {
      found.add(rec.url);
    }
  }
  for (const nested of Object.values(rec)) walk(nested, found);
}

function looksLikeImageUrl(url: string): boolean {
  return IMAGE_EXT.test(url) || IMAGE_HOST.test(url);
}

export function replaceRemoteImageUrls(value: unknown, hosted: Map<string, HostedMedia>): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const [from, media] of hosted) {
      out = out.split(from).join(media.url);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => replaceRemoteImageUrls(item, hosted));
  if (!value || typeof value !== "object") return value;
  const rec = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(rec)) {
    next[key] = replaceRemoteImageUrls(nested, hosted);
  }
  if (typeof rec.url === "string" && hosted.has(rec.url)) {
    const media = hosted.get(rec.url)!;
    next.url = media.url;
    next.id = media.id;
    if ("source" in rec) next.source = "library";
  }
  return next;
}
