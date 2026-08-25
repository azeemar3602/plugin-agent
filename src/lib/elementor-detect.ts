export function looksLikeElementorTemplate(source: string): boolean {
  try {
    const parsed = JSON.parse(source) as unknown;
    const docs = Array.isArray(parsed) ? parsed : [parsed];
    return docs.some(isElementorDocument);
  } catch {
    return false;
  }
}

function isElementorDocument(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  if (!Array.isArray(rec.content)) return false;
  const first = rec.content[0];
  if (first && typeof first === "object") {
    const node = first as Record<string, unknown>;
    if ("elType" in node || "widgetType" in node || "elements" in node) return true;
  }
  return (
    typeof rec.version === "string" ||
    typeof rec.type === "string" ||
    rec.page_settings !== undefined
  );
}

export function fileBasename(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).pop() || value;
}
