import type { RemotePlugin } from "./wordpress";
import { ICONS, preferCustomIconType } from "./icons";

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
  "icon-list",
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
  { type: "icon-list", plugin: "elementor", role: "takeaways", label: "Icon List" },
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
  if (/icon list|icon-list/.test(hay)) return "takeaways";
  if (hay === "heading" || /(^| )heading$/.test(hay)) return "heading";
  if (hay.includes("text editor") || hay === "text") return "text";
  if (hay === "button" || /(^| )button$/.test(hay)) return "button";
  if (hay === "image" || /(^| )image$/.test(hay)) return "image";
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
    const named = roleFromName(item.type, item.title);
    byType.set(item.type, {
      type: item.type,
      plugin,
      role: named === "other" && existing?.role ? existing.role : named,
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
    if ((role === "header" || role === "footer") && /axion_(header|footer)/.test(picked.type)) {
      continue;
    }
    plan.push(picked);
    used.add(picked.type);
  }
  const hasHero = plan.some((widget) => widget.role === "blogHero");
  if (hasHero) {
    return plan.filter((widget) => widget.role !== "authorMeta");
  }
  return plan;
}

export function addonRolesOnSite(widgets: CatalogWidget[]): Set<WidgetRole> {
  const roles = new Set<WidgetRole>();
  for (const widget of widgets) {
    if (!isAddonWidget(widget)) continue;
    roles.add(widget.role);
  }
  return roles;
}

export function neededRolesFromAnalysis(sections: Array<{ role: string }>): WidgetRole[] {
  const out: WidgetRole[] = [];
  const add = (role: WidgetRole) => {
    if (!out.includes(role)) out.push(role);
  };
  let ctaCount = 0;
  for (const section of sections) {
    if (section.role === "hero") add("blogHero");
    else if (section.role === "features" || section.role === "split") add("takeaways");
    else if (section.role === "cta") {
      ctaCount += 1;
      add(ctaCount === 1 ? "articleCta" : "downloadCta");
    } else if (section.role === "footer") add("footer");
    else if (section.role === "content") add("faq");
    else if (section.role === "media") add("relatedPosts");
  }
  if (out.length === 0) {
    return ["blogHero", "takeaways", "articleCta", "faq", "downloadCta", "relatedPosts"];
  }
  add("blogHero");
  return out;
}

export function missingLayoutRoles(widgets: CatalogWidget[], needed: WidgetRole[]): WidgetRole[] {
  const have = addonRolesOnSite(widgets);
  return needed.filter((role) => !have.has(role));
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

export function isFullBleedAxionWidget(widget: CatalogWidget): boolean {
  if (widget.plugin !== "arcadia-elementor-addons") return false;
  return /axion_(header|footer|blog_hero|key_takeaways|blog_faq|article_cta|download_cta|blog_related)/.test(
    widget.type,
  );
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
  if (type.startsWith("plugin_agent_")) score += 18;
  if (widget.type === role || widget.type.replace(/-/g, "") === role) score += 8;
  if ((role === "header" || role === "footer") && /axion_(header|footer)/.test(type)) score -= 40;
  if (type.includes("blog_")) score += 6;
  if (role === "faq" && type.includes("blog_faq")) score += 12;
  if (role === "blogHero" && type.includes("blog_hero")) score += 12;
  if (role === "relatedPosts" && (type.includes("blog_related") || type.includes("related_posts"))) score += 12;
  if (role === "articleCta" && type.includes("article_cta")) score += 12;
  if (role === "takeaways" && type.includes("takeaway")) score += 12;
  if (role === "header" && type.includes("header")) score += 12;
  if (role === "footer" && type.includes("footer")) score += 12;
  if (role === "authorMeta" && (type.includes("post_meta") || type.includes("author_post"))) score += 12;
  if (role === "downloadCta" && type.includes("download")) score += 12;
  return score;
}

const STOCK_MEDIA = {
  hero: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1400&q=80",
  logo: "https://placehold.co/180x40/115696/FFFFFF/png?text=Logo",
  avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=128&h=128&q=80",
};

export function settingsFromWidget(widget: CatalogWidget): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  const controls = widget.controls ?? {};
  for (const [key, control] of Object.entries(controls)) {
    if (!isUsableDefault(control.default)) continue;
    settings[key] = control.default;
  }
  if (
    (typeof settings.heading_before === "string" || typeof settings.heading_highlight === "string") &&
    controls.title_source?.options?.includes("custom")
  ) {
    settings.title_source = "custom";
  }
  if (settings.items && controls.content_source?.options?.includes("manual")) {
    settings.content_source = "manual";
  }
  if (controls.split_layout?.options?.includes("columns") && !settings.split_layout) {
    settings.split_layout = "columns";
  }
  const iconType = preferCustomIconType(controls.icon_type?.options ?? controls.selected_icon_type?.options ?? null);
  if (iconType) settings.icon_type = iconType;
  fillMissingMedia(widget, settings);
  fillMissingIcons(widget, settings);
  return settings;
}

function hasMediaUrl(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const url = (value as { url?: unknown }).url;
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function fillMissingMedia(widget: CatalogWidget, settings: Record<string, unknown>) {
  if ((widget.role === "header" || widget.role === "footer") && !hasMediaUrl(settings.logo)) {
    settings.logo = { url: STOCK_MEDIA.logo, id: "", size: "", alt: settings.logo_alt || "Logo" };
  }
  if (widget.role === "blogHero" && !hasMediaUrl(settings.image)) {
    settings.image = {
      url: STOCK_MEDIA.hero,
      id: "",
      size: "",
      alt: "Article image",
    };
    settings.image_source = "custom";
  }
}

function fillMissingIcons(widget: CatalogWidget, settings: Record<string, unknown>) {
  const icon =
    widget.role === "articleCta"
      ? ICONS.bell
      : widget.role === "downloadCta"
        ? ICONS.clipboard
        : widget.role === "takeaways"
          ? ICONS.dot
          : undefined;
  if (!icon) return;
  if (!isSvgIcon(settings.selected_icon) && (widget.controls?.selected_icon || !widget.controls)) {
    settings.selected_icon = icon;
  }
  if (!isSvgIcon(settings.icon) && widget.controls?.icon) {
    settings.icon = icon;
  }
}

function isSvgIcon(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const rec = value as { library?: string; value?: { url?: string } };
  return rec.library === "svg" && typeof rec.value?.url === "string" && rec.value.url.startsWith("data:image/svg+xml");
}

function isUsableDefault(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "string" && value.trim().length < 2 && value.trim() !== "0") return false;
  if (Array.isArray(value)) {
    return value.some((item) => isUsableDefault(item));
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if ("url" in rec) return typeof rec.url === "string" && rec.url.trim().length > 0;
    return Object.values(rec).some((item) => isUsableDefault(item));
  }
  return true;
}
