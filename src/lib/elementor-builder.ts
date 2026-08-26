import type { CatalogWidget } from "./elementor-widgets";
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

type ElNode = {
  id: string;
  elType: string;
  isInner?: boolean;
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: ElNode[];
};

const PLACEHOLDER_IMAGE = "https://placehold.co/1200x640/png?text=Image";
const PLACEHOLDER_ICON = { value: "fas fa-star", library: "fa-solid" };
const PLACEHOLDER_ICON_CIRCLE = { value: "fas fa-circle", library: "fa-solid" };

function eid(): string {
  return Math.random().toString(16).slice(2, 9);
}

function widgetNode(widget: CatalogWidget, settings: Record<string, unknown>): ElNode {
  const merged = { ...settings };
  if (widget.shortcode && widget.type === "shortcode") {
    merged.shortcode = widget.shortcode;
  }
  if (widget.type === "give_form") {
    merged.form_id = "";
  }
  return {
    id: eid(),
    elType: "widget",
    widgetType: widget.type,
    settings: merged,
    elements: [],
  };
}

function column(size: number, children: ElNode[], extra: Record<string, unknown> = {}): ElNode {
  return {
    id: eid(),
    elType: "column",
    settings: { _column_size: size, _inline_size: null, ...extra },
    elements: children,
  };
}

function section(bg: string, columns: ElNode[], extra: Record<string, unknown> = {}): ElNode {
  return {
    id: eid(),
    elType: "section",
    isInner: false,
    settings: {
      layout: "boxed",
      gap: "default",
      content_width: { unit: "%", size: 100 },
      background_background: "classic",
      background_color: bg,
      padding: { unit: "px", top: "56", right: "24", bottom: "56", left: "24", isLinked: false },
      ...extra,
    },
    elements: columns,
  };
}

function addonSection(columns: ElNode[]): ElNode {
  return section("#FFFFFF", columns, {
    layout: "full_width",
    gap: "no",
    stretch_section: "section-stretched",
    content_width: { unit: "%", size: 100 },
    padding: { unit: "px", top: "0", right: "0", bottom: "0", left: "0", isLinked: true },
  });
}

function heading(widgets: CatalogWidget[], title: string, color: string, size = "h2"): ElNode {
  return widgetNode(pickWidget("heading", widgets), {
    title,
    header_size: size,
    align: "center",
    title_color: color,
  });
}

function text(widgets: CatalogWidget[], html: string, color: string): ElNode {
  return widgetNode(pickWidget("text", widgets), {
    editor: `<p>${html}</p>`,
    align: "center",
    text_color: color,
  });
}

function button(widgets: CatalogWidget[], label: string): ElNode {
  return widgetNode(pickWidget("button", widgets), {
    text: label,
    align: "center",
    link: { url: "#", is_external: "", nofollow: "" },
  });
}

function image(widgets: CatalogWidget[]): ElNode {
  return widgetNode(pickWidget("image", widgets), {
    image: { url: PLACEHOLDER_IMAGE, id: "", alt: "Placeholder image", source: "url" },
    image_size: "full",
    align: "center",
  });
}

function iconBox(widgets: CatalogWidget[], title: string, color: string): ElNode {
  return widgetNode(pickWidget("icon", widgets), {
    selected_icon: PLACEHOLDER_ICON,
    title_text: title,
    description_text: "Placeholder copy — replace with the real text from your design.",
    title_color: color,
    position: "top",
  });
}

function collectTypes(nodes: ElNode[], into: Set<string>) {
  for (const node of nodes) {
    if (node.widgetType) into.add(node.widgetType);
    collectTypes(node.elements, into);
  }
}

function widgetsForSection(
  sectionInfo: DesignSection,
  index: number,
  widgets: CatalogWidget[],
  extras: { donation: boolean; search: boolean; form: boolean; language: boolean },
): ElNode[] {
  const color = sectionInfo.fg;
  const cols = Math.min(4, Math.max(1, sectionInfo.columns));
  const role = sectionInfo.role;

  if (role === "hero") {
    const left = [
      heading(widgets, "Headline from your design", color, "h1"),
      text(
        widgets,
        "Replace this with the hero copy from the JPEG/PDF. Images and icons are placeholders.",
        color,
      ),
      button(widgets, "Primary action"),
    ];
    if (extras.search) {
      const search = pickWidget("search", widgets);
      left.push(
        widgetNode(search, {
          placeholder: "Search",
          shortcode: search.shortcode,
        }),
      );
    }
    if (sectionInfo.imageHeavy || cols >= 2) {
      return [
        column(50, left),
        column(50, [image(widgets)]),
      ];
    }
    return [column(100, left)];
  }

  if (role === "features") {
    const count = Math.max(3, cols);
    const size = Math.floor(100 / count);
    return Array.from({ length: count }, (_, i) =>
      column(size, [iconBox(widgets, `Feature ${i + 1}`, color)]),
    );
  }

  if (role === "split") {
    return [
      column(50, [
        heading(widgets, "Section title", color, "h2"),
        text(widgets, "Two-column layout detected in the mockup. Swap placeholders for real media.", color),
        button(widgets, "Learn more"),
      ]),
      column(50, [image(widgets)]),
    ];
  }

  if (role === "media" || sectionInfo.imageHeavy) {
    return [
      column(100, [
        heading(widgets, "Visual section", color, "h2"),
        widgetNode(pickWidget("gallery", widgets), {
          gallery: [
            { url: PLACEHOLDER_IMAGE, id: "" },
            { url: "https://placehold.co/800x600/png?text=Image", id: "" },
            { url: "https://placehold.co/800x600/png?text=Image", id: "" },
          ],
          gallery_layout: "grid",
        }),
      ]),
    ];
  }

  if (role === "cta") {
    const kids = [
      heading(widgets, "Call to action", color, "h2"),
      text(widgets, "Button and supporting line from the design — labels are placeholders.", color),
      button(widgets, "Get started"),
    ];
    if (extras.form) {
      const form = pickWidget("form", widgets);
      kids.push(widgetNode(form, { shortcode: form.shortcode || "[contact-form]" }));
    }
    if (extras.donation && index > 0) {
      const donation = pickWidget("donation", widgets);
      kids.push(
        widgetNode(donation, {
          shortcode: donation.shortcode || "[give_form]",
        }),
      );
    }
    return [column(100, kids)];
  }

  if (role === "footer") {
    const kids = [
      heading(widgets, "Footer", color, "h4"),
      text(widgets, "© Site name · Replace with footer links from the design.", color),
    ];
    if (extras.language) {
      const lang = pickWidget("language", widgets);
      kids.push(widgetNode(lang, { shortcode: lang.shortcode || "[polylang]" }));
    }
    kids.push(
      widgetNode(pickWidget("icon", widgets), {
        selected_icon: PLACEHOLDER_ICON_CIRCLE,
        title_text: "Social",
        description_text: "Placeholder icon.",
      }),
    );
    return [column(100, kids)];
  }

  return [
    column(100, [
      heading(widgets, "Content section", color, "h2"),
      text(widgets, "Layout band detected in the uploaded design. Drop in real copy when you edit in Elementor.", color),
    ]),
  ];
}

export function buildElementorDocument(options: {
  title: string;
  analysis: DesignAnalysis;
  widgets: CatalogWidget[];
  extras: { donation: boolean; search: boolean; form: boolean; language: boolean };
}): { json: string; widgetsUsed: string[]; sectionRoles: string[] } {
  if (hasDetectedLayout(options.widgets)) {
    return buildFromDetectedWidgets(options.title, options.analysis, options.widgets);
  }
  const content = options.analysis.sections.map((sec, index) =>
    section(sec.bg, widgetsForSection(sec, index, options.widgets, options.extras)),
  );
  const used = new Set<string>();
  collectTypes(content, used);
  const document = {
    version: "0.4",
    title: options.title,
    type: "page",
    page_settings: {
      background_background: "classic",
      background_color: options.analysis.background,
    },
    content,
  };
  return {
    json: JSON.stringify(document, null, 2),
    widgetsUsed: [...used],
    sectionRoles: options.analysis.sections.map((sec) => sec.role),
  };
}

function buildFromDetectedWidgets(
  title: string,
  analysis: DesignAnalysis,
  widgets: CatalogWidget[],
): { json: string; widgetsUsed: string[]; sectionRoles: string[] } {
  const plan = planPageFromDetectedWidgets(widgets);
  const content: ElNode[] = plan.map((picked) =>
    addonSection([
      column(100, [widgetNode(picked, settingsFromWidget(picked))], {
        padding: { unit: "px", top: "0", right: "0", bottom: "0", left: "0", isLinked: true },
      }),
    ]),
  );
  const roles = plan.map((picked) => `${picked.role}:${picked.type}`);

  if (content.length === 0) {
    return {
      json: JSON.stringify({ version: "0.4", title, type: "page", content: [] }, null, 2),
      widgetsUsed: [],
      sectionRoles: [],
    };
  }

  const used = new Set<string>();
  collectTypes(content, used);
  return {
    json: JSON.stringify(
      {
        version: "0.4",
        title,
        type: "page",
        page_settings: {
          background_background: "classic",
          background_color: analysis.background,
          hide_title: "yes",
        },
        content,
      },
      null,
      2,
    ),
    widgetsUsed: [...used],
    sectionRoles: roles,
  };
}
