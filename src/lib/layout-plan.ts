import type { CatalogWidget, WidgetRole } from "./elementor-widgets";
import {
  hasDetectedLayout,
  pickWidget,
  planPageFromDetectedWidgets,
  settingsFromWidget,
} from "./elementor-widgets";

export type DesignSection = {
  role: string;
  y0: number;
  y1: number;
  columns: number;
  bg: string;
  fg: string;
  imageHeavy: boolean;
};

export type DesignAnalysis = {
  width: number;
  height: number;
  background: string;
  sections: DesignSection[];
};

export type PlannedWidget = {
  widget: CatalogWidget;
  settings: Record<string, unknown>;
};

export type PlannedColumn = {
  width: number;
  widthTablet: number;
  widthMobile: number;
  widgets: PlannedWidget[];
};

export type PlannedSection = {
  analysisRole: string;
  label: string;
  detectedColumns: number;
  columnCount: number;
  bg: string;
  fg: string;
  fullBleed: boolean;
  columns: PlannedColumn[];
};

export type LayoutExtras = {
  donation: boolean;
  search: boolean;
  form: boolean;
  language: boolean;
};

const PLACEHOLDER_IMAGE = "https://placehold.co/1200x640/png?text=Image";
const PLACEHOLDER_ICON = { value: "fas fa-star", library: "fa-solid" };
const PLACEHOLDER_ICON_CIRCLE = { value: "fas fa-circle", library: "fa-solid" };

export function clampColumns(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.round(value)));
}

export function columnWidths(count: number): Array<{ desktop: number; tablet: number; mobile: number }> {
  const n = clampColumns(count);
  const base = Math.floor(100 / n);
  const desktop = Array.from({ length: n }, (_, i) => (i === n - 1 ? 100 - base * (n - 1) : base));
  const tablet =
    n === 1 ? [100] : n === 3 ? [50, 50, 100] : Array.from({ length: n }, () => (n >= 2 ? 50 : 100));
  return desktop.map((size, i) => ({
    desktop: size,
    tablet: tablet[i] ?? 100,
    mobile: 100,
  }));
}

export function layoutSummary(plan: PlannedSection[]): string[] {
  return plan.map((section) => `${section.analysisRole} ${section.columnCount}-col`);
}

export function planPageLayout(options: {
  analysis: DesignAnalysis;
  widgets: CatalogWidget[];
  extras: LayoutExtras;
}): PlannedSection[] {
  if (hasDetectedLayout(options.widgets)) {
    return planAddonSections(options.analysis, options.widgets);
  }
  const sections = options.analysis.sections.length
    ? options.analysis.sections
    : defaultPrimitiveSections();
  return sections.map((section, index) => planPrimitiveSection(section, index, options.widgets, options.extras));
}

function defaultPrimitiveSections(): DesignSection[] {
  return [
    { role: "hero", y0: 0, y1: 0.25, columns: 2, bg: "#f7f9fb", fg: "#1a1a1a", imageHeavy: true },
    { role: "features", y0: 0.25, y1: 0.45, columns: 4, bg: "#ffffff", fg: "#1a1a1a", imageHeavy: false },
    { role: "cta", y0: 0.45, y1: 0.58, columns: 1, bg: "#0d3d66", fg: "#f8f8f8", imageHeavy: false },
    { role: "content", y0: 0.58, y1: 0.78, columns: 1, bg: "#ffffff", fg: "#1a1a1a", imageHeavy: false },
    { role: "media", y0: 0.78, y1: 0.9, columns: 4, bg: "#ffffff", fg: "#1a1a1a", imageHeavy: true },
    { role: "footer", y0: 0.9, y1: 1, columns: 4, bg: "#115696", fg: "#f8f8f8", imageHeavy: false },
  ];
}

function planAddonSections(analysis: DesignAnalysis, widgets: CatalogWidget[]): PlannedSection[] {
  const addons = planPageFromDetectedWidgets(widgets);
  return addons.map((addon) => {
    const hint = matchingAnalysisSection(addon.role, analysis);
    const detected = hint ? clampColumns(hint.columns) : 1;
    const widths = columnWidths(1);
    const col = widths[0];
    return {
      analysisRole: hint?.role || addon.role,
      label: addon.label,
      detectedColumns: detected,
      columnCount: 1,
      bg: hint?.bg || "#FFFFFF",
      fg: hint?.fg || "#1a1a1a",
      fullBleed: true,
      columns: [
        {
          width: col.desktop,
          widthTablet: col.tablet,
          widthMobile: col.mobile,
          widgets: [{ widget: addon, settings: settingsFromWidget(addon) }],
        },
      ],
    };
  });
}

function matchingAnalysisSection(role: WidgetRole, analysis: DesignAnalysis): DesignSection | undefined {
  const sections = analysis.sections;
  if (role === "blogHero") return sections.find((item) => item.role === "hero") ?? sections[0];
  if (role === "takeaways") {
    return sections.find((item) => item.role === "features" || item.role === "split");
  }
  if (role === "articleCta") return sections.find((item) => item.role === "cta");
  if (role === "downloadCta") return sections.filter((item) => item.role === "cta")[1];
  if (role === "faq") return sections.find((item) => item.role === "content");
  if (role === "relatedPosts") return sections.find((item) => item.role === "media");
  if (role === "footer") return sections.find((item) => item.role === "footer");
  if (role === "header") return sections.find((item) => item.role === "hero");
  return undefined;
}

function primitiveColumnCount(section: DesignSection): number {
  const detected = clampColumns(section.columns);
  if (section.role === "hero" && (section.imageHeavy || detected >= 2)) return 2;
  if (section.role === "split") return 2;
  if (section.role === "features") return Math.max(3, detected);
  if (section.role === "media") return Math.max(3, detected);
  if (section.role === "footer") return Math.max(3, detected);
  if (section.role === "header") return 3;
  return detected;
}

function emptyColumns(count: number): PlannedColumn[] {
  return columnWidths(count).map((width) => ({
    width: width.desktop,
    widthTablet: width.tablet,
    widthMobile: width.mobile,
    widgets: [],
  }));
}

function planPrimitiveSection(
  section: DesignSection,
  index: number,
  widgets: CatalogWidget[],
  extras: LayoutExtras,
): PlannedSection {
  const fg = section.fg;
  const count = primitiveColumnCount(section);
  const columns = emptyColumns(count);
  const role = section.role;

  if (role === "hero") {
    const copy: PlannedWidget[] = [
      primitive(widgets, "heading", {
        title: "Headline from your design",
        header_size: "h1",
        align: "left",
        title_color: fg,
      }),
      primitive(widgets, "text", {
        editor: "<p>Replace this with the hero copy from the JPEG/PDF. Images and icons are placeholders.</p>",
        align: "left",
        text_color: fg,
      }),
      primitive(widgets, "button", {
        text: "Primary action",
        align: "left",
        link: { url: "#", is_external: "", nofollow: "" },
      }),
    ];
    if (extras.search) {
      const search = pickWidget("search", widgets);
      copy.push({
        widget: search,
        settings: { placeholder: "Search", shortcode: search.shortcode },
      });
    }
    columns[0].widgets = copy;
    if (count >= 2) {
      columns[1].widgets = [imageWidget(widgets)];
    }
  } else if (role === "features") {
    for (let i = 0; i < count; i += 1) {
      columns[i].widgets = [
        primitive(widgets, "icon", {
          selected_icon: PLACEHOLDER_ICON,
          title_text: `Feature ${i + 1}`,
          description_text: "Placeholder copy — replace with the real text from your design.",
          title_color: fg,
          position: "top",
        }),
      ];
    }
  } else if (role === "split") {
    columns[0].widgets = [
      primitive(widgets, "heading", {
        title: "Section title",
        header_size: "h2",
        align: "left",
        title_color: fg,
      }),
      primitive(widgets, "text", {
        editor: "<p>Two-column layout detected in the mockup. Swap placeholders for real media.</p>",
        align: "left",
        text_color: fg,
      }),
      primitive(widgets, "button", {
        text: "Learn more",
        align: "left",
        link: { url: "#", is_external: "", nofollow: "" },
      }),
    ];
    if (columns[1]) columns[1].widgets = [imageWidget(widgets)];
  } else if (role === "media") {
    for (let i = 0; i < count; i += 1) {
      columns[i].widgets = [
        imageWidget(widgets),
        primitive(widgets, "heading", {
          title: `Card ${i + 1}`,
          header_size: "h3",
          align: "left",
          title_color: fg,
        }),
        primitive(widgets, "text", {
          editor: "<p>Replace with the article title from the design.</p>",
          align: "left",
          text_color: fg,
        }),
      ];
    }
  } else if (role === "cta") {
    const kids: PlannedWidget[] = [
      primitive(widgets, "heading", {
        title: "Call to action",
        header_size: "h2",
        align: "center",
        title_color: fg,
      }),
      primitive(widgets, "text", {
        editor: "<p>Button and supporting line from the design — labels are placeholders.</p>",
        align: "center",
        text_color: fg,
      }),
      primitive(widgets, "button", {
        text: "Get started",
        align: "center",
        link: { url: "#", is_external: "", nofollow: "" },
      }),
    ];
    if (extras.form) {
      const form = pickWidget("form", widgets);
      kids.push({ widget: form, settings: { shortcode: form.shortcode || "[contact-form]" } });
    }
    if (extras.donation && index > 0) {
      const donation = pickWidget("donation", widgets);
      kids.push({ widget: donation, settings: { shortcode: donation.shortcode || "[give_form]" } });
    }
    columns[0].widgets = kids;
  } else if (role === "footer") {
    const labels = ["Products", "Company", "Resources", "Legal"];
    for (let i = 0; i < count; i += 1) {
      columns[i].widgets = [
        primitive(widgets, "heading", {
          title: labels[i] || `Column ${i + 1}`,
          header_size: "h4",
          align: "left",
          title_color: fg,
        }),
        primitive(widgets, "text", {
          editor: i === 0 ? "<p>© Site name · Replace with footer links from the design.</p>" : "<p>Link · Link · Link</p>",
          align: "left",
          text_color: fg,
        }),
      ];
    }
    if (extras.language) {
      const lang = pickWidget("language", widgets);
      columns[count - 1].widgets.push({
        widget: lang,
        settings: { shortcode: lang.shortcode || "[polylang]" },
      });
    }
    columns[count - 1].widgets.push(
      primitive(widgets, "icon", {
        selected_icon: PLACEHOLDER_ICON_CIRCLE,
        title_text: "Social",
        description_text: "Placeholder icon.",
      }),
    );
  } else {
    columns[0].widgets = [
      primitive(widgets, "heading", {
        title: "Content section",
        header_size: "h2",
        align: count > 1 ? "left" : "center",
        title_color: fg,
      }),
      primitive(widgets, "text", {
        editor: "<p>Layout band detected in the uploaded design. Drop in real copy when you edit in Elementor.</p>",
        align: count > 1 ? "left" : "center",
        text_color: fg,
      }),
    ];
    if (count >= 2) {
      columns[1].widgets = [imageWidget(widgets)];
    }
  }

  return {
    analysisRole: role,
    label: role,
    detectedColumns: clampColumns(section.columns),
    columnCount: count,
    bg: section.bg,
    fg,
    fullBleed: role === "hero" || role === "cta" || role === "footer",
    columns,
  };
}

function primitive(
  widgets: CatalogWidget[],
  role: WidgetRole,
  settings: Record<string, unknown>,
): PlannedWidget {
  const widget = pickWidget(role, widgets);
  return { widget, settings: { ...settingsFromWidget(widget), ...settings } };
}

function imageWidget(widgets: CatalogWidget[]): PlannedWidget {
  return primitive(widgets, "image", {
    image: { url: PLACEHOLDER_IMAGE, id: "", alt: "Placeholder image", source: "url" },
    image_size: "full",
    align: "center",
  });
}
