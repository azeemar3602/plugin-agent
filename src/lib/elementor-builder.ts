import type { CatalogWidget } from "./elementor-widgets";
import {
  layoutSummary,
  planPageLayout,
  type DesignAnalysis,
  type DesignSection,
  type LayoutExtras,
  type PlannedColumn,
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

function outerContainer(section: PlannedSection): ElNode {
  const multi = section.columnCount > 1;
  return {
    id: eid(),
    elType: "container",
    isInner: false,
    settings: {
      _title: section.label,
      container_type: "flex",
      content_width: section.fullBleed ? "full" : "boxed",
      boxed_width: { unit: "px", size: 1180 },
      flex_direction: "row",
      flex_wrap: "wrap",
      flex_align_items: "stretch",
      flex_justify_content: multi ? "space-between" : "center",
      flex_gap: gap(multi ? 24 : 0),
      flex_direction_tablet: "row",
      flex_wrap_tablet: "wrap",
      flex_gap_tablet: gap(multi ? 20 : 0),
      flex_direction_mobile: "column",
      flex_wrap_mobile: "wrap",
      flex_gap_mobile: gap(16),
      background_background: "classic",
      background_color: section.bg,
      padding: section.fullBleed ? pad("0", "0", "0", "0") : pad("48", "24", "48", "24"),
      padding_tablet: section.fullBleed ? pad("0", "0", "0", "0") : pad("36", "20", "36", "20"),
      padding_mobile: section.fullBleed ? pad("0", "0", "0", "0") : pad("28", "16", "28", "16"),
    },
    elements: section.columns.map((column, index) => innerContainer(column, index)),
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
