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
  | "language";

export type CatalogWidget = {
  type: string;
  plugin: string;
  role: WidgetRole;
  label: string;
  shortcode?: string;
};

const CATALOG: CatalogWidget[] = [
  { type: "heading", plugin: "elementor", role: "heading", label: "Heading" },
  { type: "text-editor", plugin: "elementor", role: "text", label: "Text" },
  { type: "button", plugin: "elementor", role: "button", label: "Button" },
  { type: "image", plugin: "elementor", role: "image", label: "Image" },
  { type: "icon", plugin: "elementor", role: "icon", label: "Icon" },
  { type: "icon-box", plugin: "elementor", role: "icon", label: "Icon box" },
  { type: "image-box", plugin: "elementor", role: "image", label: "Image box" },
  { type: "image-gallery", plugin: "elementor", role: "gallery", label: "Gallery" },
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
    shortcode: '[formlayer]',
  },
  {
    type: "shortcode",
    plugin: "formlayer-pro",
    role: "form",
    label: "FormLayer form",
    shortcode: '[formlayer]',
  },
  {
    type: "shortcode",
    plugin: "queryra-ai-search",
    role: "search",
    label: "Queryra search",
    shortcode: '[queryra_search]',
  },
  {
    type: "shortcode",
    plugin: "polylang",
    role: "language",
    label: "Language switcher",
    shortcode: "[polylang]",
  },
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
  });
}

export function pickWidget(
  role: WidgetRole,
  widgets: CatalogWidget[],
): CatalogWidget {
  const match = widgets.find((widget) => widget.role === role);
  if (match) return match;
  if (role === "donation" || role === "form" || role === "search" || role === "language") {
    const shortcode = widgets.find((widget) => widget.type === "shortcode");
    if (shortcode) return { ...shortcode, role, shortcode: shortcode.shortcode };
  }
  if (role === "icon") {
    const heading = widgets.find((widget) => widget.type === "heading");
    if (heading) return heading;
  }
  return (
    widgets.find((widget) => widget.type === "html") || {
      type: "html",
      plugin: "elementor",
      role: "html",
      label: "HTML",
    }
  );
}
