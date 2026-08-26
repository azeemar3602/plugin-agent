import { GRID_BACKGROUND } from "./icons";
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
  const direction = column.direction ?? "column";
  const widgetNodes = column.widgets.map((item) => widgetNode(item.widget, item.settings));
  const children = column.card ? [cardShell(column, widgetNodes)] : widgetNodes;
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: {
      _title: `Column ${index + 1}`,
      container_type: "flex",
      content_width: "full",
      flex_direction: direction,
      flex_align_items: direction === "row" ? "center" : "stretch",
      flex_justify_content: direction === "row" ? "flex-end" : "flex-start",
      flex_wrap: direction === "row" ? "nowrap" : "wrap",
      flex_gap: gap(direction === "row" ? 14 : 12),
      flex_gap_mobile: gap(10),
      flex_direction_mobile: column.direction === "row" ? "row" : "column",
      flex_size: "custom",
      flex_grow: 0,
      flex_shrink: 1,
      min_width: { unit: "px", size: 0 },
      width: { unit: "%", size: column.width },
      width_tablet: { unit: "%", size: column.widthTablet },
      width_mobile: { unit: "%", size: column.widthMobile },
      padding: pad("0", "0", "0", "0"),
      padding_mobile: pad("0", "0", "0", "0"),
    },
    elements: children,
  };
}

function cardShell(column: PlannedColumn, children: ElNode[]): ElNode {
  const firstIsImage = column.widgets[0]?.widget.type === "image";
  const body = firstIsImage && children.length > 1 ? [children[0], paddedStack(children.slice(1))] : children;
  const radius = String(column.cardRadius ?? 16);
  const padSize = column.cardPad ?? 22;
  const border = column.cardBorder === "none" ? "" : "solid";
  const borderColor =
    column.cardBorder && column.cardBorder !== "none"
      ? column.cardBorder
      : column.cardBg && column.cardBg !== "#ffffff"
        ? column.cardBg
        : "#e6edf4";
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: {
      _title: "Card",
      container_type: "flex",
      content_width: "full",
      width: { unit: "%", size: 100 },
      height: { unit: "%", size: 100 },
      flex_grow: 1,
      flex_direction: "column",
      flex_align_items: "stretch",
      flex_gap: gap(0),
      background_background: "classic",
      background_color: column.cardBg ?? "#ffffff",
      border_border: border,
      border_width: border ? { unit: "px", top: "1", right: "1", bottom: "1", left: "1", isLinked: true } : undefined,
      border_color: border ? borderColor : undefined,
      border_radius: {
        unit: "px",
        top: radius,
        right: radius,
        bottom: radius,
        left: radius,
        isLinked: true,
      },
      overflow: "visible",
      padding: firstIsImage ? pad("0", "0", "12", "0") : pad(String(padSize), "24", String(padSize), "24"),
      ...(column.cardShadow
        ? {
            box_shadow_box_shadow_type: "yes",
            box_shadow_box_shadow: {
              horizontal: 0,
              vertical: 18,
              blur: 36,
              spread: 0,
              color: "rgba(4, 152, 218, 0.35)",
            },
          }
        : {}),
    },
    elements: body,
  };
}

function paddedStack(children: ElNode[]): ElNode {
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: {
      _title: "Card body",
      container_type: "flex",
      content_width: "full",
      width: { unit: "%", size: 100 },
      flex_direction: "column",
      flex_gap: gap(6),
      padding: pad("12", "16", "8", "16"),
    },
    elements: children,
  };
}

function rowContainer(row: PlannedRow): ElNode {
  const multi = row.columns.length > 1;
  const stackTablet = row.columns.some((column) => column.widthTablet === 100);
  const rowGap = row.gap ?? (multi ? 28 : 0);
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
      flex_wrap: "nowrap",
      flex_align_items: row.align ?? "flex-start",
      flex_justify_content: multi ? "space-between" : "flex-start",
      flex_gap: gap(rowGap),
      flex_direction_tablet: stackTablet ? "column" : "row",
      flex_wrap_tablet: stackTablet ? "wrap" : "nowrap",
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
  const compact = Boolean(banner.compact);
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
      flex_wrap: "nowrap",
      flex_align_items: "center",
      flex_justify_content: "space-between",
      flex_gap: gap(compact ? 12 : 24),
      flex_direction_tablet: compact ? "row" : "column",
      flex_wrap_tablet: compact ? "nowrap" : "wrap",
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
      padding: compact ? pad("10", "22", "10", "22") : pad("32", "36", "32", "36"),
      padding_mobile: compact ? pad("10", "16", "10", "16") : pad("22", "20", "22", "20"),
    },
    elements: children,
  };
}

function sectionPadding(section: PlannedSection) {
  const none = {
    desktop: pad("0", "0", "0", "0"),
    tablet: pad("0", "0", "0", "0"),
    mobile: pad("0", "0", "0", "0"),
  };
  if (section.pad === "none") return none;
  if (section.pad === "hero" || section.analysisRole === "hero") {
    return {
      desktop: pad("56", "24", "48", "24"),
      tablet: pad("40", "20", "36", "20"),
      mobile: pad("28", "16", "28", "16"),
    };
  }
  if (section.analysisRole === "header" || section.pad === "tight") {
    return {
      desktop: pad("12", "24", "12", "24"),
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
  const background = section.gradient
    ? {
        background_background: "gradient",
        background_color: section.gradient.from,
        background_color_b: section.gradient.to,
        gradient_type: "linear",
        gradient_angle: { unit: "deg", size: 90 },
      }
    : section.bg && section.bg !== "transparent"
      ? {
          background_background: "classic",
          background_color: section.bg,
        }
      : {
          background_background: "",
        };
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
      flex_wrap: nested || section.columnCount <= 1 ? "wrap" : "nowrap",
      flex_align_items: "stretch",
      flex_justify_content: nested ? "flex-start" : "center",
      flex_gap: gap(nested ? 20 : section.columnCount > 1 ? 20 : 0),
      flex_direction_tablet: nested ? "column" : "row",
      flex_wrap_tablet: nested || section.columnCount <= 1 ? "wrap" : "nowrap",
      flex_direction_mobile: nested || section.columnCount > 1 ? "column" : "row",
      flex_wrap_mobile: "wrap",
      flex_gap_mobile: gap(16),
      ...background,
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
      background_color: "#ffffff",
      background_image: { url: GRID_BACKGROUND, id: "", source: "url" },
      background_repeat: "repeat",
      background_size: "auto",
      background_position: "top left",
    },
    content,
  };
  return {
    json: JSON.stringify(document, null, 2),
    widgetsUsed: [...used],
    sectionRoles: layoutSummary(plan),
  };
}
