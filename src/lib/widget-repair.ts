import { FA } from "./icons";
import type { CatalogWidget } from "./elementor-widgets";

export type WidgetRepair = {
  from: string;
  to: string;
  reason: string;
};

type ElNode = {
  id: string;
  elType: string;
  isInner?: boolean;
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: ElNode[];
};

function nid(): string {
  return Math.random().toString(16).slice(2, 9);
}

export function innerText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function hasFormControls(html: string): boolean {
  return /<(input|textarea|select|form)\b/i.test(html);
}

function headingMatch(html: string): { as: "h1" | "h2" | "h3" | "h4"; title: string } | null {
  const trimmed = html.trim();
  const match = trimmed.match(/^<(h[1-4])\b[^>]*>([\s\S]*)<\/\1>\s*$/i);
  if (!match) return null;
  if (/<(ul|ol|li|p|img|input)\b/i.test(match[2])) return null;
  const title = innerText(match[2]);
  if (!title) return null;
  return { as: match[1].toLowerCase() as "h1" | "h2" | "h3" | "h4", title };
}

function listItemsFromHtml(html: string): { items: string[]; layout: "traditional" | "inline" } | null {
  if (hasFormControls(html)) return null;
  const lis = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => innerText(match[1])).filter(Boolean);
  if (lis.length >= 2) return { items: lis, layout: "traditional" };

  const anchors = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => innerText(match[1])).filter(Boolean);
  if (anchors.length >= 3 && innerText(html.replace(/<a\b[\s\S]*?<\/a>/gi, "")).length < 8) {
    return { items: anchors, layout: "inline" };
  }

  if (/<br\s*\/?>/i.test(html)) {
    const parts = html
      .split(/<br\s*\/?>/i)
      .map((part) => innerText(part))
      .filter(Boolean);
    if (parts.length >= 3 && parts.every((part) => part.length < 80)) {
      return { items: parts, layout: "traditional" };
    }
  }

  const text = innerText(html);
  const tokens = text
    .split(/\s*(?:[·•|]|&middot;)\s*|\s{2,}/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (
    tokens.length >= 3 &&
    tokens.every((token) => token.length <= 24 && token === token.toUpperCase() && !/[.?!]/.test(token))
  ) {
    return { items: tokens, layout: "inline" };
  }
  return null;
}

function isBrokenSvgIcon(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as { library?: string; value?: { url?: string } };
  if (rec.library !== "svg") return false;
  const url = rec.value?.url || "";
  return url.startsWith("data:image/svg+xml") || url === "";
}

function faForBrokenIcon(value: unknown) {
  const rec = value as { value?: { url?: string } } | null;
  const url = String(rec?.value?.url || "").toLowerCase();
  if (url.includes("phone") || url.includes("M8.5%203.5")) return FA.phone;
  if (url.includes("calendar") || url.includes("rect%20x%3D%224")) return FA.calendar;
  if (url.includes("clock") || url.includes("circle%20cx%3D%2212")) return FA.clock;
  if (url.includes("arrow") || url.includes("M5%2012h14")) return FA.arrow;
  if (url.includes("bell")) return FA.bell;
  return FA.check;
}

function headingNode(as: "h1" | "h2" | "h3" | "h4", title: string, align?: unknown): ElNode {
  const px = as === "h1" ? 48 : as === "h2" ? 32 : as === "h3" ? 22 : 14;
  return {
    id: nid(),
    elType: "widget",
    isInner: false,
    widgetType: "heading",
    settings: {
      title,
      header_size: as,
      size: as === "h1" ? "xxl" : as === "h2" ? "xl" : as === "h3" ? "large" : "medium",
      align: typeof align === "string" ? align : "left",
      typography_typography: "custom",
      typography_font_size: { unit: "px", size: px },
      typography_font_weight: "800",
    },
    elements: [],
  };
}

function iconListNode(
  items: string[],
  layout: "traditional" | "inline",
  textColor?: unknown,
): ElNode {
  const logo = layout === "inline";
  return {
    id: nid(),
    elType: "widget",
    isInner: false,
    widgetType: "icon-list",
    settings: {
      icon_list: items.map((text) => ({
        text,
        selected_icon: logo ? FA.circle : FA.check,
        link: { url: "", is_external: "", nofollow: "" },
        _id: nid(),
      })),
      text_color: typeof textColor === "string" ? textColor : undefined,
      icon_color: logo ? textColor || "#1D2025" : "#22C55E",
      icon_size: { unit: "px", size: logo ? 8 : 16 },
      space_between: { unit: "px", size: logo ? 22 : 14 },
      view: layout,
    },
    elements: [],
  };
}

function editorHtml(node: ElNode): string {
  const settings = node.settings || {};
  if (typeof settings.editor === "string") return settings.editor;
  if (typeof settings.html === "string") return settings.html;
  return "";
}

function rewriteTextLike(node: ElNode, repairs: WidgetRepair[]): ElNode[] {
  const html = editorHtml(node);
  if (!html.trim()) return [node];

  const heading = headingMatch(html);
  if (heading) {
    repairs.push({ from: node.widgetType || "text-editor", to: "heading", reason: "title in a text editor" });
    return [headingNode(heading.as, heading.title, node.settings.align)];
  }

  const list = listItemsFromHtml(html);
  if (list) {
    repairs.push({
      from: node.widgetType || "text-editor",
      to: "icon-list",
      reason: list.layout === "inline" ? "logo/link row in a text editor" : "list in a text editor",
    });
    return [iconListNode(list.items, list.layout, node.settings.text_color)];
  }

  return [node];
}

function repairIcons(node: ElNode, repairs: WidgetRepair[]) {
  const settings = node.settings;
  if (isBrokenSvgIcon(settings.selected_icon)) {
    settings.selected_icon = faForBrokenIcon(settings.selected_icon);
    settings.icon_type = "icon";
    repairs.push({ from: node.widgetType || "icon", to: node.widgetType || "icon", reason: "data-URI SVG icon cannot render" });
  }
  const items = settings.icon_list;
  if (Array.isArray(items)) {
    let fixed = false;
    settings.icon_list = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const rec = item as Record<string, unknown>;
      if (isBrokenSvgIcon(rec.selected_icon)) {
        rec.selected_icon = FA.check;
        fixed = true;
      }
      return rec;
    });
    if (fixed) {
      repairs.push({ from: "icon-list", to: "icon-list", reason: "data-URI SVG list icons cannot render" });
    }
  }
}

function walk(nodes: ElNode[], repairs: WidgetRepair[]): ElNode[] {
  const out: ElNode[] = [];
  for (const node of nodes) {
    if (Array.isArray(node.elements) && node.elements.length > 0) {
      node.elements = walk(node.elements, repairs);
    }
    if (node.elType === "widget" && (node.widgetType === "text-editor" || node.widgetType === "html")) {
      out.push(...rewriteTextLike(node, repairs));
      continue;
    }
    if (node.elType === "widget") repairIcons(node, repairs);
    out.push(node);
  }
  return out;
}

function collectTypes(nodes: ElNode[], into: Set<string>) {
  for (const node of nodes) {
    if (node.widgetType) into.add(node.widgetType);
    if (node.elements) collectTypes(node.elements, into);
  }
}

export function repairElementorDocument(
  json: string,
  _widgets: CatalogWidget[] = [],
): { json: string; repairs: WidgetRepair[]; widgetsUsed: string[] } {
  const doc = JSON.parse(json) as { content?: ElNode[] };
  const repairs: WidgetRepair[] = [];
  if (Array.isArray(doc.content)) {
    doc.content = walk(doc.content, repairs);
  }
  const used = new Set<string>();
  collectTypes(doc.content || [], used);
  return {
    json: JSON.stringify(doc, null, 2),
    repairs,
    widgetsUsed: [...used],
  };
}

export function summarizeRepairs(repairs: WidgetRepair[]): string {
  if (repairs.length === 0) return "";
  const targets = [...new Set(repairs.map((item) => item.to))];
  return ` Checked widgets before import and rewrote ${repairs.length} Text Editor/HTML block${
    repairs.length === 1 ? "" : "s"
  } into ${targets.join(", ")}.`;
}
