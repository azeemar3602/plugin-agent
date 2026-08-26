import type { CatalogWidget } from "./elementor-widgets";
import {
  layoutSummary,
  planPageLayout,
  type DesignAnalysis,
  type DesignSection,
  type LayoutExtras,
  type PlannedColumn,
  type PlannedRow,
  type PlannedSection,
} from "./layout-plan";

export type { DesignAnalysis, DesignSection };

type ElNode = {
  id: string;
  elType: string;
  isInner?: boolean;
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: ElNode[];
};

function eid(): string {
  return Math.random().toString(16).slice(2, 9);
}

function gap(size: number): Record<string, unknown> {
  return { column: String(size), row: String(size), isLinked: true, unit: "px", size };
}

function pad(top: string, right: string, bottom: string, left: string) {
  return { unit: "px", top, right, bottom, left, isLinked: top === right && right === bottom && bottom === left };
}

function widgetNode(widget: CatalogWidget, settings: Record<string, unknown>): ElNode {
  const merged = normalizeRepeaterFields({ ...settings });
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

function normalizeRepeaterFields(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...settings };
  for (const [key, value] of Object.entries(out)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    if (!value.every((item) => item && typeof item === "object" && !Array.isArray(item))) continue;
    out[key] = value.map((item) => {
      const rec = { ...(item as Record<string, unknown>) };
      if (typeof rec._id !== "string" || !rec._id) rec._id = eid();
      if ("label" in rec && rec.link == null) {
        rec.link = { url: "#", is_external: "", nofollow: "" };
      }
      return rec;
    });
  }
  return out;
}

function innerContainer(column: PlannedColumn, index: number): ElNode {
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: {
      _title: `Column ${index + 1}`,
      container_type: "flex",
      content_width: "full",
      flex_direction: "column",
      flex_align_items: "stretch",
      flex_gap: gap(12),
      flex_gap_mobile: gap(10),
      flex_size: "none",
      width: { unit: "%", size: column.width },
      width_tablet: { unit: "%", size: column.widthTablet },
      width_mobile: { unit: "%", size: column.widthMobile },
      padding: pad("0", "0", "0", "0"),
      padding_mobile: pad("0", "0", "0", "0"),
    },
    elements: column.widgets.map((item) => widgetNode(item.widget, item.settings)),
  };
}

function rowContainer(row: PlannedRow): ElNode {
  const multi = row.columns.length > 1;
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: {
      _title: multi ? `${row.columns.length} columns` : "Row",
      container_type: "flex",
      content_width: "full",
      width: { unit: "%", size: 100 },
      flex_direction: "row",
      flex_wrap: "wrap",
      flex_align_items: "center",
      flex_justify_content: multi ? "space-between" : "flex-start",
      flex_gap: gap(multi ? 24 : 0),
      flex_direction_tablet: row.columns.some((column) => column.widthTablet === 100) ? "column" : "row",
      flex_wrap_tablet: "wrap",
      flex_gap_tablet: gap(multi ? 20 : 0),
      flex_direction_mobile: "column",
      flex_wrap_mobile: "wrap",
      flex_gap_mobile: gap(16),
      padding: pad("0", "0", "0", "0"),
    },
    elements: row.columns.map((column, index) => innerContainer(column, index)),
  };
}

function bannerWrap(section: PlannedSection, children: ElNode[]): ElNode {
  const banner = section.banner!;
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: {
      _title: "Banner",
      container_type: "flex",
      content_width: "full",
      width: { unit: "%", size: 100 },
      flex_direction: "row",
      flex_wrap: "wrap",
      flex_align_items: "center",
      flex_justify_content: "space-between",
      flex_gap: gap(24),
      flex_direction_tablet: "column",
      flex_direction_mobile: "column",
      flex_gap_mobile: gap(16),
      background_background: "classic",
      background_color: banner.color,
      border_radius: {
        unit: "px",
        top: String(banner.radius),
        right: String(banner.radius),
        bottom: String(banner.radius),
        left: String(banner.radius),
        isLinked: true,
      },
      padding: pad("32", "36", "32", "36"),
      padding_mobile: pad("22", "20", "22", "20"),
    },
    elements: children,
  };
}

function sectionPadding(section: PlannedSection) {
  if (section.analysisRole === "header") {
    return {
      desktop: pad("10", "24", "10", "24"),
      tablet: pad("10", "20", "10", "20"),
      mobile: pad("8", "16", "8", "16"),
    };
  }
  if (section.fullBleed && section.analysisRole === "footer") {
    return {
      desktop: pad("56", "24", "28", "24"),
      tablet: pad("40", "20", "20", "20"),
      mobile: pad("32", "16", "16", "16"),
    };
  }
  if (section.banner) {
    return {
      desktop: pad("12", "24", "12", "24"),
      tablet: pad("12", "20", "12", "20"),
      mobile: pad("12", "16", "12", "16"),
    };
  }
  return {
    desktop: pad("40", "24", "40", "24"),
    tablet: pad("32", "20", "32", "20"),
    mobile: pad("24", "16", "24", "16"),
  };
}

function outerContainer(section: PlannedSection): ElNode {
  const rows = section.rows;
  const nested = rows.length > 1 || Boolean(section.banner);
  const rowNodes = rows.map((item) => (nested ? rowContainer(item) : item.columns.map((column, index) => innerContainer(column, index)))).flat();
  const children = section.banner ? [bannerWrap(section, rowNodes)] : rowNodes;
  const padding = sectionPadding(section);
  return {
    id: eid(),
    elType: "container",
    isInner: false,
    settings: {
      _title: section.label,
      container_type: "flex",
      content_width: section.fullBleed ? "full" : "boxed",
      boxed_width: { unit: "px", size: section.boxedWidth ?? 1180 },
      flex_direction: nested ? "column" : "row",
      flex_wrap: "wrap",
      flex_align_items: "stretch",
      flex_justify_content: "center",
      flex_gap: gap(nested ? 20 : section.columnCount > 1 ? 24 : 0),
      flex_direction_tablet: nested ? "column" : "row",
      flex_wrap_tablet: "wrap",
      flex_direction_mobile: nested || section.columnCount > 1 ? "column" : "row",
      flex_wrap_mobile: "wrap",
      flex_gap_mobile: gap(16),
      background_background: "classic",
      background_color: section.bg,
      padding: padding.desktop,
      padding_tablet: padding.tablet,
      padding_mobile: padding.mobile,
    },
    elements: children,
  };
}

function collectTypes(nodes: ElNode[], into: Set<string>) {
  for (const node of nodes) {
    if (node.widgetType) into.add(node.widgetType);
    collectTypes(node.elements, into);
  }
}

export function buildElementorDocument(options: {
  title: string;
  analysis: DesignAnalysis;
  widgets: CatalogWidget[];
  extras: LayoutExtras;
}): { json: string; widgetsUsed: string[]; sectionRoles: string[] } {
  const plan = planPageLayout({
    analysis: options.analysis,
    widgets: options.widgets,
    extras: options.extras,
  });
  const content = plan.map((section) => outerContainer(section));
  const used = new Set<string>();
  collectTypes(content, used);

  if (content.length === 0) {
    return {
      json: JSON.stringify({ version: "0.4", title: options.title, type: "page", content: [] }, null, 2),
      widgetsUsed: [],
      sectionRoles: [],
    };
  }

  const document = {
    version: "0.4",
    title: options.title,
    type: "page",
    page_settings: {
      hide_title: "yes",
      background_background: "classic",
      background_color: options.analysis.background,
    },
    content,
  };
  return {
    json: JSON.stringify(document, null, 2),
    widgetsUsed: [...used],
    sectionRoles: layoutSummary(plan),
  };
}
