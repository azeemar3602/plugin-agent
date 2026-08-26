import type { RemotePlugin } from "./wordpress";

export type WidgetRole =
  | "heading"
  | "text"
  | "button"
  | "image"
  | "icon"
  | "gallery"
  | "testimonial"
  | "form"
  | "donation"
  | "search"
  | "spacer"
  | "html"
  | "shortcode"
  | "language"
  | "header"
  | "footer"
  | "blogHero"
  | "authorMeta"
  | "takeaways"
  | "articleCta"
  | "faq"
  | "relatedPosts"
  | "downloadCta"
  | "other";

export type WidgetControl = {
  type: string;
  label?: string;
  default?: unknown;
  options?: string[] | null;
  fields?: string[] | null;
};

export type CatalogWidget = {
  type: string;
  plugin: string;
  role: WidgetRole;
  label: string;
  shortcode?: string;
  source?: "remote" | "catalog";
  custom?: boolean;
  controls?: Record<string, WidgetControl>;
};

const CORE_WIDGET_TYPES = new Set([
  "heading",
  "text-editor",
  "button",
  "image",
  "icon",
  "icon-box",
  "image-box",
  "image-gallery",
  "image-carousel",
  "accordion",
  "toggle",
  "testimonial",
  "spacer",
  "divider",
  "html",
  "shortcode",
  "video",
  "google_maps",
  "star-rating",
  "social-icons",
  "alert",
  "progress",
  "counter",
  "tabs",
  "menu-anchor",
  "sidebar",
  "read-more",
  "text-path",
  "search-form",
  "form",
  "slides",
  "nav-menu",
  "posts",
  "portfolio",
  "gallery",
  "login",
  "nav-menu",
]);

const CATALOG: CatalogWidget[] = [
  { type: "heading", plugin: "elementor", role: "heading", label: "Heading" },
  { type: "text-editor", plugin: "elementor", role: "text", label: "Text" },
  { type: "button", plugin: "elementor", role: "button", label: "Button" },
  { type: "image", plugin: "elementor", role: "image", label: "Image" },
  { type: "icon", plugin: "elementor", role: "icon", label: "Icon" },
  { type: "icon-box", plugin: "elementor", role: "icon", label: "Icon box" },
  { type: "image-box", plugin: "elementor", role: "image", label: "Image box" },
  { type: "image-gallery", plugin: "elementor", role: "gallery", label: "Gallery" },
  { type: "accordion", plugin: "elementor", role: "faq", label: "Accordion" },
  { type: "toggle", plugin: "elementor", role: "faq", label: "Toggle" },
  { type: "testimonial", plugin: "elementor", role: "testimonial", label: "Testimonial" },
  { type: "spacer", plugin: "elementor", role: "spacer", label: "Spacer" },
  { type: "html", plugin: "elementor", role: "html", label: "HTML" },
  { type: "shortcode", plugin: "elementor", role: "shortcode", label: "Shortcode" },
  { type: "search-form", plugin: "elementor-pro", role: "search", label: "Search form" },
  { type: "form", plugin: "elementor-pro", role: "form", label: "Form" },
  { type: "slides", plugin: "elementor-pro", role: "gallery", label: "Slides" },
  {
    type: "shortcode",
    plugin: "give",
    role: "donation",
    label: "Give donation form",
    shortcode: "[give_form]",
  },
  {
    type: "shortcode",
    plugin: "formlayer",
    role: "form",
    label: "FormLayer form",
    shortcode: "[formlayer]",
  },
  {
    type: "shortcode",
    plugin: "formlayer-pro",
    role: "form",
    label: "FormLayer form",
    shortcode: "[formlayer]",
  },
  {
    type: "shortcode",
    plugin: "queryra-ai-search",
    role: "search",
    label: "Queryra search",
    shortcode: "[queryra_search]",
  },
  {
    type: "shortcode",
    plugin: "polylang",
    role: "language",
    label: "Language switcher",
    shortcode: "[polylang]",
  },
];

const LAYOUT_ROLES: WidgetRole[] = [
  "header",
  "blogHero",
  "authorMeta",
  "takeaways",
  "articleCta",
  "faq",
  "downloadCta",
  "relatedPosts",
  "footer",
];

function pluginKey(plugin: RemotePlugin): string {
  return (plugin.file.split("/")[0] || plugin.file).toLowerCase();
}

export function activePluginKeys(plugins: RemotePlugin[]): Set<string> {
  const keys = new Set<string>();
  for (const plugin of plugins) {
    if (plugin.status !== "active") continue;
    keys.add(pluginKey(plugin));
  }
  return keys;
}

export function availableWidgets(plugins: RemotePlugin[]): CatalogWidget[] {
  const keys = activePluginKeys(plugins);
  const hasElementor = keys.has("elementor");
  return CATALOG.filter((widget) => {
    if (widget.plugin === "elementor") return hasElementor || true;
    return keys.has(widget.plugin);
  }).map((widget) => ({ ...widget, source: "catalog" as const }));
}

export function roleFromName(type: string, title = ""): WidgetRole {
  const hay = `${type} ${title}`.toLowerCase().replace(/[-_]+/g, " ");
  if (/\bheader\b/.test(hay) && !/header footer/.test(hay)) return "header";
  if (/\bfooter\b/.test(hay)) return "footer";
  if (/blog hero|home hero|vet hero|\bhero\b/.test(hay)) return "blogHero";
  if (/key takeaway|takeaway/.test(hay)) return "takeaways";
  if (/author/.test(hay) && /meta|box|post/.test(hay)) return "authorMeta";
  if (/download cta|download/.test(hay) && /cta|checklist/.test(hay)) return "downloadCta";
  if (/article cta|cta banner|section cta|call to action/.test(hay)) return "articleCta";
  if (/blog faq|\bfaq\b|accordion/.test(hay)) return "faq";
  if (/related post|blog card|posts grid|post grid/.test(hay)) return "relatedPosts";
  if (/\bform\b/.test(hay) && !/search/.test(hay)) return "form";
  if (/testimonial|review/.test(hay)) return "testimonial";
  if (/gallery|slides/.test(hay)) return "gallery";
  if (hay === "heading" || hay.endsWith(" heading")) return "heading";
  if (hay.includes("text editor") || hay === "text") return "text";
  if (hay === "button") return "button";
  if (hay === "image") return "image";
  if (hay.includes("search")) return "search";
  return "other";
}

function looksLikeAddonType(type: string, custom?: boolean, plugin?: string): boolean {
  if (custom) return true;
  if (plugin && plugin !== "elementor" && plugin !== "elementor-pro" && plugin !== "") return true;
  if (CORE_WIDGET_TYPES.has(type)) return false;
  if (type.startsWith("wp-widget-")) return false;
  return /_/.test(type);
}

export function isAddonWidget(widget: CatalogWidget): boolean {
  if (widget.type === "html" || widget.type === "shortcode") return false;
  if (widget.custom) return true;
  if (widget.plugin === "elementor" || widget.plugin === "elementor-pro") return false;
  if (widget.source === "remote") return looksLikeAddonType(widget.type, widget.custom, widget.plugin);
  return false;
}

export function mergeRemoteWidgets(
  widgets: CatalogWidget[],
  remote: Array<{
    type: string;
    title: string;
    custom?: boolean;
    plugin?: string;
    controls?: Record<string, WidgetControl>;
  }>,
): CatalogWidget[] {
  const byType = new Map(widgets.map((widget) => [widget.type, widget]));
  for (const item of remote) {
    const addon = looksLikeAddonType(item.type, item.custom, item.plugin);
    const existing = byType.get(item.type);
    const plugin = addon
      ? item.plugin || existing?.plugin || "remote"
      : existing?.plugin || item.plugin || "elementor";
    byType.set(item.type, {
      type: item.type,
      plugin,
      role: roleFromName(item.type, item.title),
      label: item.title || item.type,
      source: "remote",
      custom: addon,
      controls: item.controls,
      shortcode: existing?.shortcode,
    });
  }
  return [...byType.values()];
}

export function planPageFromDetectedWidgets(widgets: CatalogWidget[]): CatalogWidget[] {
  const addons = widgets.filter(isAddonWidget);
  const used = new Set<string>();
  const plan: CatalogWidget[] = [];
  for (const role of LAYOUT_ROLES) {
    const matches = addons.filter((widget) => widget.role === role);
    matches.sort((a, b) => scoreWidget(b, role) - scoreWidget(a, role));
    const picked = matches.find((widget) => widget.type !== "html" && !used.has(widget.type));
    if (!picked) continue;
    plan.push(picked);
    used.add(picked.type);
  }
  return plan;
}

export function hasDetectedLayout(widgets: CatalogWidget[]): boolean {
  return planPageFromDetectedWidgets(widgets).length > 0;
}

export function layoutRolesPresent(widgets: CatalogWidget[]): WidgetRole[] {
  return planPageFromDetectedWidgets(widgets).map((widget) => widget.role);
}

export function titleFromDetectedWidgets(widgets: CatalogWidget[]): string | undefined {
  const plan = planPageFromDetectedWidgets(widgets);
  const hero = plan.find((widget) => widget.role === "blogHero") ?? plan.find((widget) => widget.role === "header");
  if (!hero) return undefined;
  const settings = settingsFromWidget(hero);
  const parts = [settings.heading_before, settings.heading_highlight, settings.heading_after]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  if (parts.length > 0) return parts.join(" ");
  if (typeof settings.title === "string" && settings.title.trim()) return settings.title.trim();
  if (typeof settings.heading === "string" && settings.heading.trim()) return settings.heading.trim();
  return undefined;
}

export function pickWidget(role: WidgetRole, widgets: CatalogWidget[]): CatalogWidget {
  const matches = widgets.filter((widget) => widget.role === role);
  matches.sort((a, b) => scoreWidget(b, role) - scoreWidget(a, role));
  const best = matches.find((widget) => widget.type !== "html");
  if (best) return best;

  if (role === "donation" || role === "form" || role === "search" || role === "language") {
    const shortcode = widgets.find((widget) => widget.type === "shortcode");
    if (shortcode) return { ...shortcode, role, shortcode: shortcode.shortcode };
  }
  if (role === "faq") {
    const accordion = widgets.find((widget) => widget.type === "accordion" || widget.type === "toggle");
    if (accordion) return accordion;
  }
  if (role === "icon") {
    const box = widgets.find((widget) => widget.type === "icon-box") ?? widgets.find((widget) => widget.type === "heading");
    if (box) return box;
  }
  if (role === "html") {
    return (
      widgets.find((widget) => widget.type === "html") || {
        type: "html",
        plugin: "elementor",
        role: "html",
        label: "HTML",
      }
    );
  }
  const heading = widgets.find((widget) => widget.type === "heading");
  if (heading) return heading;
  const text = widgets.find((widget) => widget.type === "text-editor");
  if (text) return text;
  return {
    type: "heading",
    plugin: "elementor",
    role: "heading",
    label: "Heading",
  };
}

function scoreWidget(widget: CatalogWidget, role: WidgetRole): number {
  if (widget.role !== role) return -1;
  let score = 0;
  if (widget.source === "remote") score += 10;
  if (isAddonWidget(widget)) score += 25;
  if (widget.type !== "html") score += 5;
  const type = widget.type.toLowerCase();
  if (role === "faq" && type.includes("blog_faq")) score += 12;
  if (role === "blogHero" && type.includes("blog_hero")) score += 12;
  if (role === "relatedPosts" && (type.includes("blog_related") || type.includes("related_posts"))) score += 12;
  if (role === "articleCta" && type.includes("article_cta")) score += 12;
  if (role === "takeaways" && type.includes("takeaway")) score += 12;
  if (role === "header" && type.includes("header")) score += 12;
  if (role === "footer" && type.includes("footer")) score += 12;
  if (role === "authorMeta" && type.includes("author")) score += 12;
  if (role === "downloadCta" && type.includes("download")) score += 12;
  return score;
}

export function settingsFromWidget(widget: CatalogWidget): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  const controls = widget.controls ?? {};
  for (const [key, control] of Object.entries(controls)) {
    if (control.default !== undefined && control.default !== null && control.default !== "") {
      settings[key] = control.default;
    }
  }
  if (controls.title_source?.options?.includes("custom")) settings.title_source = "custom";
  if (controls.image_source?.options?.includes("custom")) settings.image_source = "custom";
  if (controls.author_source?.options?.includes("custom")) settings.author_source = "custom";
  if (controls.content_source?.options?.includes("manual")) settings.content_source = "manual";
  if (controls.split_layout?.options?.includes("columns")) settings.split_layout = "columns";
  return settings;
}
