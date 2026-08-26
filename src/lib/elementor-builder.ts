import { GRID_BACKGROUND } from "./icons";
import type { CatalogWidget } from "./elementor-widgets";
import { repairElementorDocument } from "./widget-repair";
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

function px(size: number, unit = "px") {
  return { unit, size, sizes: [] as number[] };
}

function cleanSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === "" || value === undefined) continue;
    out[key] = value;
  }
  return out;
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
    isInner: false,
    widgetType: widget.type,
    settings: cleanSettings({
      _margin: pad("0", "0", "0", "0"),
      _padding: pad("0", "0", "8", "0"),
      ...merged,
    }),
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

function columnSkin(column: PlannedColumn): Record<string, unknown> {
  if (!column.card) return {};
  const radius = String(column.cardRadius ?? 16);
  const padSize = column.cardPad ?? 22;
  const firstIsImage = column.widgets[0]?.widget.type === "image";
  const border = column.cardBorder === "none" ? "" : "solid";
  const borderColor =
    column.cardBorder && column.cardBorder !== "none"
      ? column.cardBorder
      : column.cardBg && column.cardBg !== "#ffffff"
        ? column.cardBg
        : "#e6edf4";
  return cleanSettings({
    background_background: "classic",
    background_color: column.cardBg ?? "#ffffff",
    border_border: border || undefined,
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
  });
}

function innerContainer(column: PlannedColumn, index: number): ElNode {
  const direction = column.direction ?? "column";
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: cleanSettings({
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
      flex_grow: column.card ? 1 : 0,
      flex_shrink: 1,
      min_width: px(0),
      width: px(column.width, "%"),
      width_tablet: px(column.widthTablet, "%"),
      width_mobile: px(column.widthMobile, "%"),
      ...columnSkin(column),
    }),
    elements: withWidgetGrid(
      column,
      column.widgets.map((item) => widgetNode(item.widget, item.settings)),
    ),
  };
}

function withWidgetGrid(column: PlannedColumn, nodes: ElNode[]): ElNode[] {
  const grid = column.grid;
  if (!grid || grid.count < 1 || grid.columns < 1) return nodes;
  const from = Math.max(0, grid.from);
  const slice = nodes.slice(from, from + grid.count);
  if (slice.length === 0) return nodes;
  const cols = grid.columns;
  const percent = Math.floor(100 / cols);
  const colNodes: ElNode[] = [];
  for (let col = 0; col < cols; col += 1) {
    const kids = slice.filter((_, index) => index % cols === col);
    colNodes.push({
      id: eid(),
      elType: "container",
      isInner: true,
      settings: cleanSettings({
        _title: `Column ${col + 1}`,
        container_type: "flex",
        content_width: "full",
        flex_direction: "column",
        flex_gap: gap(12),
        width: px(percent, "%"),
        width_mobile: px(100, "%"),
      }),
      elements: kids,
    });
  }
  const row: ElNode = {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: cleanSettings({
      _title: `${cols} columns`,
      container_type: "flex",
      content_width: "full",
      width: px(100, "%"),
      flex_direction: "row",
      flex_wrap: "nowrap",
      flex_align_items: "flex-start",
      flex_gap: gap(12),
      flex_direction_mobile: "column",
      flex_wrap_mobile: "wrap",
    }),
    elements: colNodes,
  };
  return [...nodes.slice(0, from), row, ...nodes.slice(from + slice.length)];
}

function rowContainer(row: PlannedRow): ElNode {
  const multi = row.columns.length > 1;
  const stackTablet = row.columns.some((column) => column.widthTablet === 100);
  const rowGap = row.gap ?? (multi ? 28 : 0);
  return {
    id: eid(),
    elType: "container",
    isInner: true,
    settings: cleanSettings({
      _title: multi ? `${row.columns.length} columns` : "Row",
      container_type: "flex",
      content_width: "full",
      width: px(100, "%"),
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
    }),
    elements: row.columns.map((column, index) => innerContainer(column, index)),
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
  const multi = rows.length > 1;
  const children = multi
    ? rows.map((item) => rowContainer(item))
    : (rows[0]?.columns ?? []).map((column, index) => innerContainer(column, index));
  const padding = sectionPadding(section);
  const banner = section.banner;
  const compact = Boolean(banner?.compact);
  const background = banner
    ? {
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
      }
    : section.gradient
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
        : {};
  return {
    id: eid(),
    elType: "container",
    isInner: false,
    settings: cleanSettings({
      _title: section.label,
      container_type: "flex",
      content_width: section.fullBleed && !banner ? "full" : "boxed",
      boxed_width: px(section.boxedWidth ?? 1180),
      flex_direction: multi ? "column" : "row",
      flex_wrap: "nowrap",
      flex_align_items: banner ? "center" : "stretch",
      flex_justify_content: multi ? "flex-start" : banner ? "space-between" : "center",
      flex_gap: gap(multi ? 20 : banner ? (compact ? 12 : 24) : section.columnCount > 1 ? 20 : 0),
      flex_direction_tablet: multi ? "column" : compact || !banner ? "row" : "column",
      flex_wrap_tablet: "nowrap",
      flex_direction_mobile: multi || section.columnCount > 1 ? "column" : "row",
      flex_wrap_mobile: "wrap",
      flex_gap_mobile: gap(16),
      ...background,
      padding: banner ? (compact ? pad("10", "22", "10", "22") : pad("32", "36", "32", "36")) : padding.desktop,
      padding_tablet: banner ? (compact ? pad("10", "18", "10", "18") : pad("24", "24", "24", "24")) : padding.tablet,
      padding_mobile: banner ? (compact ? pad("10", "16", "10", "16") : pad("22", "20", "22", "20")) : padding.mobile,
    }),
    elements: children,
  };
}

export function buildElementorDocument(options: {
  title: string;
  analysis: DesignAnalysis;
  widgets: CatalogWidget[];
  extras: LayoutExtras;
}): { json: string; widgetsUsed: string[]; sectionRoles: string[]; repairs: { from: string; to: string; reason: string }[] } {
  const plan = planPageLayout({
    analysis: options.analysis,
    widgets: options.widgets,
    extras: options.extras,
  });
  const content = plan.map((section) => outerContainer(section));
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

  if (content.length === 0) {
    return {
      json: JSON.stringify({ version: "0.4", title: options.title, type: "page", content: [] }, null, 2),
      widgetsUsed: [],
      sectionRoles: [],
      repairs: [],
    };
  }

  const repaired = repairElementorDocument(JSON.stringify(document), options.widgets);
  return {
    json: repaired.json,
    widgetsUsed: repaired.widgetsUsed,
    sectionRoles: layoutSummary(plan),
    repairs: repaired.repairs,
  };
}
