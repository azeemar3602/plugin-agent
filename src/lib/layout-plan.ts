import type { CatalogWidget, WidgetRole } from "./elementor-widgets";
import {
  hasDetectedLayout,
  pickWidget,
  planPageFromDetectedWidgets,
  settingsFromWidget,
} from "./elementor-widgets";
import { ICONS, ICON_IMGS, type ElementorSvgIcon } from "./icons";

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
  card?: boolean;
  direction?: "row" | "column";
};

export type PlannedRow = {
  columns: PlannedColumn[];
  align?: "center" | "stretch" | "flex-start";
  gap?: number;
};

export type PlannedSection = {
  analysisRole: string;
  label: string;
  detectedColumns: number;
  columnCount: number;
  bg: string;
  fg: string;
  fullBleed: boolean;
  boxedWidth?: number;
  banner?: { color: string; radius: number; compact?: boolean };
  gradient?: { from: string; to: string };
  pad?: "none" | "tight" | "normal" | "hero";
  rows: PlannedRow[];
};

export type LayoutExtras = {
  donation: boolean;
  search: boolean;
  form: boolean;
  language: boolean;
};

const INK = "#1D2025";
const NAVY = "#002751";
const ACCENT = "#0498DA";
const GOLD = "#FFD800";
const MUTED = "#6B7280";
const WHITE = "#ffffff";
const FOOTER_TO = "#0170A8";
const TAG_BG = "#E8F4FB";
const HERO_IMAGE = "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1400&q=80";
const AVATAR = "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=128&h=128&q=80";
const PLACEHOLDER_IMAGE = "https://placehold.co/1200x640/png?text=Image";
const PLACEHOLDER_ICON = ICONS.bell;
const PLACEHOLDER_ICON_CIRCLE = ICONS.dot;
const ARTICLE_TITLE = "How Can Vets Reduce No-Shows At Their Clinic Effectively?";

const TAKEAWAYS = [
  "Confirm appointments the day before with a two-way text, not a voicemail.",
  "Let clients reschedule in one tap so a cancellation becomes a filled slot.",
  "Watch the 9:40 AM gap — that is where no-shows concentrate.",
  "Treat vet no-shows as a communication problem, not a client problem.",
];

const RELATED = [
  {
    cat: "Practice Management",
    title: "How reminder timing changes show-up rates",
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
  },
  {
    cat: "Client Communications",
    title: "Two-way texting that clients actually answer",
    image: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=800&q=80",
  },
  {
    cat: "Reminders",
    title: "Same-day openings: filling the 9:40 AM gap",
    image: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80",
  },
  {
    cat: "After hours",
    title: "After-hours booking without a front-desk bottleneck",
    image: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=800&q=80",
  },
];

export function clampColumns(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(6, Math.max(1, Math.round(value)));
}

export function columnWidths(count: number): Array<{ desktop: number; tablet: number; mobile: number }> {
  const n = clampColumns(count);
  const base = Math.floor(100 / n);
  const desktop = Array.from({ length: n }, (_, i) => (i === n - 1 ? 100 - base * (n - 1) : base));
  const tablet =
    n === 1 ? [100] : n === 3 ? [50, 50, 100] : Array.from({ length: n }, () => (n >= 4 ? 48 : 50));
  return desktop.map((size, i) => ({
    desktop: size,
    tablet: tablet[i] ?? 100,
    mobile: 100,
  }));
}

export function columnsFromPercents(percents: number[]): PlannedColumn[] {
  const n = percents.length;
  const stackTablet = n === 3 || (n === 2 && percents.some((value) => value >= 65));
  return percents.map((percent) => ({
    width: percent,
    widthTablet: n === 1 ? 100 : stackTablet ? 100 : n >= 4 ? 48 : 50,
    widthMobile: 100,
    widgets: [],
  }));
}

export function layoutSummary(plan: PlannedSection[]): string[] {
  return plan.map((section) => {
    const multi = section.rows.find((row) => row.columns.length > 1);
    if (!multi) return `${section.analysisRole} 1-col`;
    return `${section.analysisRole} ${multi.columns.map((column) => column.width).join("/")}`;
  });
}

export function planPageLayout(options: {
  analysis: DesignAnalysis;
  widgets: CatalogWidget[];
  extras: LayoutExtras;
}): PlannedSection[] {
  if (hasDetectedLayout(options.widgets) || looksLikeArticle(options.analysis)) {
    return planArticlePage(options.widgets, options.extras);
  }
  const sections = options.analysis.sections.length
    ? options.analysis.sections
    : defaultPrimitiveSections();
  return sections.map((section, index) => planPrimitiveSection(section, index, options.widgets, options.extras));
}

function looksLikeArticle(analysis: DesignAnalysis): boolean {
  const roles = new Set(analysis.sections.map((section) => section.role));
  return roles.has("hero") && roles.has("content");
}

function defaultPrimitiveSections(): DesignSection[] {
  return [
    { role: "hero", y0: 0, y1: 0.25, columns: 2, bg: "#f7f9fb", fg: INK, imageHeavy: true },
    { role: "features", y0: 0.25, y1: 0.45, columns: 4, bg: WHITE, fg: INK, imageHeavy: false },
    { role: "cta", y0: 0.45, y1: 0.58, columns: 1, bg: NAVY, fg: "#f8f8f8", imageHeavy: false },
    { role: "content", y0: 0.58, y1: 0.78, columns: 1, bg: WHITE, fg: INK, imageHeavy: false },
    { role: "media", y0: 0.78, y1: 0.9, columns: 4, bg: WHITE, fg: INK, imageHeavy: true },
    { role: "footer", y0: 0.9, y1: 1, columns: 4, bg: NAVY, fg: "#f8f8f8", imageHeavy: false },
  ];
}

function addonsByRole(widgets: CatalogWidget[]): Partial<Record<WidgetRole, CatalogWidget>> {
  const out: Partial<Record<WidgetRole, CatalogWidget>> = {};
  for (const widget of planPageFromDetectedWidgets(widgets)) {
    out[widget.role] = widget;
  }
  return out;
}

function pack(
  analysisRole: string,
  label: string,
  rows: PlannedRow[],
  extra: Partial<PlannedSection> = {},
): PlannedSection {
  const columnCount = Math.max(1, ...rows.map((row) => row.columns.length));
  return {
    analysisRole,
    label,
    detectedColumns: columnCount,
    columnCount,
    bg: "transparent",
    fg: INK,
    fullBleed: false,
    boxedWidth: 1180,
    rows,
    ...extra,
  };
}

function row(
  percents: number[],
  fill: PlannedWidget[][],
  opts?: { align?: PlannedRow["align"]; card?: boolean; gap?: number },
): PlannedRow {
  const columns = columnsFromPercents(percents);
  fill.forEach((widgets, index) => {
    if (columns[index]) {
      columns[index].widgets = widgets;
      if (opts?.card) columns[index].card = true;
    }
  });
  return { columns, align: opts?.align, gap: opts?.gap };
}

function articleTitle(hero: Record<string, unknown>): string {
  const joined = [hero.heading_before, hero.heading_highlight, hero.heading_after]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (joined.split(/\s+/).length >= 8) return joined;
  return ARTICLE_TITLE;
}

function planArticlePage(widgets: CatalogWidget[], _extras: LayoutExtras): PlannedSection[] {
  const addons = addonsByRole(widgets);
  const hero = addons.blogHero ? settingsFromWidget(addons.blogHero) : {};
  const title = articleTitle(hero);
  const headline = title.includes("No-Shows")
    ? title.replace("No-Shows", mark("No-Shows"))
    : `How Can Vets Reduce ${mark("No-Shows")} At Their Clinic Effectively?`;
  const imageUrl =
    hero.image && typeof hero.image === "object" && "url" in hero.image && typeof hero.image.url === "string" && hero.image.url
      ? hero.image.url
      : HERO_IMAGE;

  const navActions = row(
    [22, 50, 28],
    [
      [
        heading(widgets, "AXION", {
          as: "h3",
          color: WHITE,
          px: 22,
          extra: { typography_letter_spacing: { unit: "px", size: 1.2 } },
        }),
      ],
      [
        primitive(widgets, "text", {
          editor: `<p style="margin:0;text-align:center">${["Products", "Solutions", "Company", "Resources", "Our Network"]
            .map(
              (link) =>
                `<a href="#" style="color:#ffffff;text-decoration:none;margin:0 12px;font-weight:500;font-size:14px">${link}</a>`,
            )
            .join("")}</p>`,
          align: "center",
          text_color: WHITE,
        }),
      ],
      [
        goldButton(widgets, "Let's Get Started", true),
        primitive(widgets, "text", {
          editor: `<p style="margin:0"><a href="#" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:14px">${ICON_IMGS.user}Login</a></p>`,
          align: "right",
          text_color: WHITE,
        }),
      ],
    ],
    { align: "center" },
  );
  navActions.columns[2].direction = "row";

  return [
    pack(
      "header",
      "Top bar",
      [
        row(
          [100],
          [
            [
              primitive(widgets, "text", {
                editor: `<p style="margin:0;text-align:right;font-size:13px;color:${MUTED}">${ICON_IMGS.clock}Mon – Fri — 8:30 – 6:30 &nbsp;&nbsp;|&nbsp;&nbsp; ${ICON_IMGS.phone}Call Us: <strong style="color:${INK}">(855) 982-9466</strong></p>`,
                align: "right",
                text_color: MUTED,
              }),
            ],
          ],
          { align: "center" },
        ),
      ],
      { fullBleed: true, boxedWidth: 1180, pad: "tight" },
    ),
    pack("header", "Main nav", [navActions], {
      fg: WHITE,
      fullBleed: true,
      boxedWidth: 1180,
      pad: "tight",
      banner: { color: NAVY, radius: 48, compact: true },
    }),
    pack(
      "hero",
      "Article hero",
      [
        row([100], [[richTitle(widgets, headline, "h1", 52)]]),
        row(
          [58, 42],
          [
            [
              authorLine(widgets),
              richTitle(widgets, `Key ${mark("Takeaways")}`, "h2", 28),
              takeawayList(widgets),
            ],
            [
              primitive(widgets, "image", {
                image: { url: imageUrl, id: "", alt: "Veterinary technician at a desk", source: "url" },
                image_size: "full",
                align: "center",
                border_radius: { unit: "px", top: "22", right: "22", bottom: "22", left: "22", isLinked: true },
              }),
            ],
          ],
          { align: "flex-start", gap: 32 },
        ),
      ],
      { boxedWidth: 1180, pad: "hero" },
    ),
    pack(
      "content",
      "Article body",
      [
        row(
          [100],
          [
            [
              heading(widgets, "The 9:40 AM Gap That Costs Your Clinic $180", { as: "h2", color: INK, px: 32 }),
              bodyText(
                widgets,
                "<p>A single no-show is not an empty chair. It is a block of doctor time, technician time, and a client who still needs care later in the week. The 9:40 AM slot is where that leak shows up first.</p>",
              ),
              richTitle(widgets, `Why Vet ${mark("No-Shows")} Aren't Like Other No-Shows`, "h2", 32),
              bodyText(
                widgets,
                "<p>Pet owners are not skipping a haircut. They are juggling a sick animal, a work day, and a reminder they never saw. Voicemail does not close that loop. Two-way texting does.</p>",
              ),
              richTitle(widgets, `Three Communication Fixes That Actually Move the ${mark("No-Show Rate")}`, "h2", 32),
              heading(widgets, "1. Two-Way SMS Reminders From Your Clinic's Main Number", { as: "h3", color: INK, px: 20 }),
              bodyText(
                widgets,
                "<p>Confirm the day before with a reply, not a broadcast. When the reminder comes from the clinic number, clients answer it.</p>",
              ),
              heading(widgets, "2. Let Clients Reschedule In One Tap", { as: "h3", color: INK, px: 20 }),
              bodyText(
                widgets,
                "<p>A cancellation should become a filled slot. One-tap reschedule puts that opening back on the board before the morning rush.</p>",
              ),
              heading(widgets, "3. Outbound Confirmation Calls For High-Risk Slots", { as: "h3", color: INK, px: 20 }),
              bodyText(
                widgets,
                "<p>Watch same-day openings and offer them to the wait list automatically. The 9:40 AM gap is where that work pays for itself.</p>",
              ),
            ],
          ],
        ),
      ],
      { boxedWidth: 760 },
    ),
    pack(
      "cta",
      "Schedule demo",
      [
        row(
          [12, 58, 30],
          [
            [bannerIcon(widgets, ICONS.bell, "#111111", GOLD)],
            [
              heading(widgets, "Want fewer no-shows and a fuller schedule?", { as: "h3", color: WHITE, px: 24 }),
              bodyText(widgets, "<p>See how automated reminders and online booking can help your clinic.</p>", "#e8eef4"),
            ],
            [goldButton(widgets, "Schedule A Demo Now", true)],
          ],
          { align: "center" },
        ),
      ],
      { boxedWidth: 1180, banner: { color: NAVY, radius: 28 } },
    ),
    addons.faq
      ? pack(
          "faq",
          "FAQ",
          [row([100], [[{ widget: addons.faq, settings: settingsFromWidget(addons.faq) }]])],
          { bg: "transparent", fullBleed: true, boxedWidth: 1180, pad: "none" },
        )
      : pack(
          "faq",
          "FAQ",
          [
            row(
              [100],
              [[heading(widgets, "Frequently Asked Questions", { as: "h2", color: NAVY, px: 36 }), accordion(widgets)]],
            ),
          ],
          { boxedWidth: 800 },
        ),
    pack(
      "downloadCta",
      "Checklist",
      [
        row(
          [12, 58, 30],
          [
            [bannerIcon(widgets, ICONS.clipboard, WHITE, NAVY)],
            [
              heading(widgets, "10 Ways to Reduce No-Shows at Your Clinic", { as: "h3", color: NAVY, px: 24 }),
              bodyText(widgets, "<p>A practical checklist you can implement today.</p>", NAVY),
            ],
            [navyButton(widgets, "Download Free Checklist", true)],
          ],
          { align: "center" },
        ),
      ],
      { boxedWidth: 1180, banner: { color: GOLD, radius: 28 } },
    ),
    pack(
      "relatedPosts",
      "Related posts",
      [
        row([100], [[heading(widgets, "Related posts", { as: "h2", color: NAVY, px: 32 })]]),
        row(
          [25, 25, 25, 25],
          RELATED.map((card) => [
            primitive(widgets, "image", {
              image: { url: card.image, id: "", alt: card.title, source: "url" },
              image_size: "full",
              align: "center",
            }),
            primitive(widgets, "text", {
              editor: `<p><span style="display:inline-block;background:${TAG_BG};color:${NAVY};border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700">${card.cat}</span></p>`,
              align: "left",
              text_color: NAVY,
            }),
            heading(widgets, card.title, { as: "h3", color: NAVY, px: 18 }),
            primitive(widgets, "text", {
              editor: "<p>July 14, 2026 · 9 min read</p>",
              align: "left",
              text_color: MUTED,
            }),
          ]),
          { card: true, align: "stretch" },
        ),
      ],
      { boxedWidth: 1180 },
    ),
    pack(
      "footer",
      "Footer",
      [
        row(
          [28, 18, 18, 18, 18],
          [
            [
              heading(widgets, "AXION", { as: "h3", color: WHITE, px: 24 }),
              bodyText(
                widgets,
                "<p>All-in-one business communication — VoIP, messaging, VFAX and AI on one reliable cloud platform.</p>",
                "#d7e4f2",
              ),
              heading(widgets, "(855) 982-9466", { as: "h4", color: GOLD, px: 20 }),
            ],
            footerLinks(widgets, "Products", ["Softphone", "PBX", "SMS", "VFax"]),
            footerLinks(widgets, "Solutions", ["Healthcare", "Real Estate", "Finance", "Logistics"]),
            footerLinks(widgets, "Company", ["About", "Network", "Careers", "Contact"]),
            footerLinks(widgets, "Resources", ["Docs", "Status", "Security", "Pricing"]),
          ],
          { align: "flex-start" },
        ),
        row(
          [50, 50],
          [
            [
              primitive(widgets, "text", {
                editor: "<p>© 2026 Axion Communications. All rights reserved.</p>",
                align: "left",
                text_color: "#d7e4f2",
              }),
            ],
            [
              primitive(widgets, "text", {
                editor: "<p>Privacy · Terms · Security</p>",
                align: "right",
                text_color: "#d7e4f2",
              }),
            ],
          ],
          { align: "center" },
        ),
      ],
      { bg: NAVY, fg: WHITE, fullBleed: true, boxedWidth: 1180, gradient: { from: NAVY, to: FOOTER_TO } },
    ),
  ];
}

function footerLinks(widgets: CatalogWidget[], headingText: string, links: string[]): PlannedWidget[] {
  return [
    heading(widgets, headingText, { as: "h4", color: WHITE, px: 15 }),
    primitive(widgets, "text", {
      editor: `<p>${links.map((link) => `<a href="#" style="color:#d7e4f2;text-decoration:none">${link}</a>`).join("<br>")}</p>`,
      align: "left",
      text_color: "#d7e4f2",
    }),
  ];
}

function heading(
  widgets: CatalogWidget[],
  title: string,
  opts: {
    as?: "h1" | "h2" | "h3" | "h4";
    color?: string;
    align?: string;
    px?: number;
    extra?: Record<string, unknown>;
  } = {},
): PlannedWidget {
  const as = opts.as ?? "h2";
  const px = opts.px ?? (as === "h1" ? 52 : as === "h2" ? 32 : as === "h3" ? 24 : 16);
  const size = as === "h1" ? "xxl" : as === "h2" ? "xl" : as === "h3" ? "large" : "medium";
  return primitive(widgets, "heading", {
    title,
    header_size: as,
    size,
    align: opts.align ?? "left",
    title_color: opts.color ?? INK,
    typography_typography: "custom",
    typography_font_size: { unit: "px", size: px },
    typography_font_weight: as === "h4" ? "700" : "800",
    typography_line_height: { unit: "em", size: as === "h1" ? 1.12 : 1.25 },
    ...(opts.extra ?? {}),
  });
}

function mark(word: string): string {
  return `<span style="color:${ACCENT}">${word}</span>`;
}

function richTitle(widgets: CatalogWidget[], html: string, as: "h1" | "h2", px: number): PlannedWidget {
  return primitive(widgets, "text", {
    editor: `<${as} style="margin:0;font-size:${px}px;font-weight:800;line-height:${as === "h1" ? 1.12 : 1.25};color:${INK}">${html}</${as}>`,
    align: "left",
    text_color: INK,
  });
}

function bodyText(widgets: CatalogWidget[], html: string, color = INK): PlannedWidget {
  return primitive(widgets, "text", {
    editor: html,
    align: "left",
    text_color: color,
    typography_typography: "custom",
    typography_font_size: { unit: "px", size: 17 },
    typography_line_height: { unit: "em", size: 1.65 },
  });
}

function authorLine(widgets: CatalogWidget[]): PlannedWidget {
  return primitive(widgets, "text", {
    editor: `<p style="display:flex;align-items:center;gap:12px;margin:0 0 18px"><img src="${AVATAR}" alt="" width="40" height="40" style="width:40px;height:40px;border-radius:50%;object-fit:cover" /><span style="color:${MUTED}"><strong style="color:${INK}">T</strong> · May 12, 2026</span></p>`,
    align: "left",
    text_color: MUTED,
  });
}

function bannerIcon(
  widgets: CatalogWidget[],
  icon: ElementorSvgIcon,
  color: string,
  circle?: string,
): PlannedWidget {
  return primitive(widgets, "icon", {
    selected_icon: icon,
    icon_type: "svg",
    view: circle ? "stacked" : "default",
    shape: circle ? "circle" : "",
    primary_color: color,
    hover_primary_color: color,
    secondary_color: circle ?? color,
    hover_secondary_color: circle ?? color,
    size: { unit: "px", size: circle ? 20 : 28 },
    align: "center",
  });
}

function takeawayList(widgets: CatalogWidget[]): PlannedWidget {
  const list = widgets.find((widget) => widget.type === "icon-list");
  if (list) {
    return {
      widget: list,
      settings: {
        icon_list: TAKEAWAYS.map((text) => ({
          text,
          selected_icon: ICONS.dot,
          link: { url: "", is_external: "", nofollow: "" },
        })),
        text_color: INK,
        icon_color: INK,
        space_between: { unit: "px", size: 14 },
        icon_size: { unit: "px", size: 8 },
      },
    };
  }
  return primitive(widgets, "text", {
    editor: `<ul>${TAKEAWAYS.map((text) => `<li>${text}</li>`).join("")}</ul>`,
    align: "left",
    text_color: INK,
  });
}

function accordion(widgets: CatalogWidget[]): PlannedWidget {
  const widget = pickWidget("faq", widgets);
  const items = [
    {
      tab_title: "How can Axion help reduce no-shows?",
      tab_content: "<p>Two-way reminders, online booking, and a wait list that fills the 9:40 AM gap.</p>",
    },
    {
      tab_title: "Do clients need an app?",
      tab_content: "<p>No. They confirm or reschedule from a text message.</p>",
    },
    {
      tab_title: "How fast can a clinic start?",
      tab_content: "<p>Most clinics send the first reminder in the same week they connect their practice software.</p>",
    },
  ];
  return {
    widget,
    settings: {
      ...settingsFromWidget(widget),
      tabs: items,
      items,
    },
  };
}

function goldButton(widgets: CatalogWidget[], text: string, arrow = false): PlannedWidget {
  return primitive(widgets, "button", {
    text,
    size: "lg",
    align: "center",
    background_color: GOLD,
    button_text_color: "#000000",
    border_radius: { unit: "px", top: "40", right: "40", bottom: "40", left: "40", isLinked: true },
    typography_typography: "custom",
    typography_font_weight: "700",
    typography_font_size: { unit: "px", size: 15 },
    ...(arrow
      ? {
          selected_icon: ICONS.arrowDark,
          icon_type: "svg",
          icon_align: "right",
          icon_indent: { unit: "px", size: 8 },
        }
      : {}),
    link: { url: "#", is_external: "", nofollow: "" },
  });
}

function navyButton(widgets: CatalogWidget[], text: string, arrow = false): PlannedWidget {
  return primitive(widgets, "button", {
    text,
    size: "lg",
    align: "center",
    background_color: NAVY,
    button_text_color: WHITE,
    border_radius: { unit: "px", top: "40", right: "40", bottom: "40", left: "40", isLinked: true },
    typography_typography: "custom",
    typography_font_weight: "700",
    typography_font_size: { unit: "px", size: 15 },
    ...(arrow
      ? {
          selected_icon: ICONS.arrowLight,
          icon_type: "svg",
          icon_align: "right",
          icon_indent: { unit: "px", size: 8 },
        }
      : {}),
    link: { url: "#", is_external: "", nofollow: "" },
  });
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
    if (count >= 2) columns[1].widgets = [imageWidget(widgets)];
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
    columns[0].widgets = [
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
      columns[0].widgets.push({ widget: form, settings: { shortcode: form.shortcode || "[contact-form]" } });
    }
    if (extras.donation && index > 0) {
      const donation = pickWidget("donation", widgets);
      columns[0].widgets.push({ widget: donation, settings: { shortcode: donation.shortcode || "[give_form]" } });
    }
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
      columns[count - 1].widgets.push({ widget: lang, settings: { shortcode: lang.shortcode || "[polylang]" } });
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
    if (count >= 2) columns[1].widgets = [imageWidget(widgets)];
  }

  return {
    analysisRole: role,
    label: role,
    detectedColumns: clampColumns(section.columns),
    columnCount: count,
    bg: section.bg,
    fg,
    fullBleed: role === "hero" || role === "cta" || role === "footer",
    rows: [{ columns }],
  };
}

function primitive(
  widgets: CatalogWidget[],
  role: WidgetRole,
  settings: Record<string, unknown>,
): PlannedWidget {
  const exactType =
    role === "heading"
      ? "heading"
      : role === "text"
        ? "text-editor"
        : role === "button"
          ? "button"
          : role === "image"
            ? "image"
            : role === "icon"
              ? "icon"
              : undefined;
  const widget =
    (exactType ? widgets.find((item) => item.type === exactType) : undefined) ?? pickWidget(role, widgets);
  return { widget, settings: { ...settingsFromWidget(widget), ...settings } };
}

function imageWidget(widgets: CatalogWidget[]): PlannedWidget {
  return primitive(widgets, "image", {
    image: { url: PLACEHOLDER_IMAGE, id: "", alt: "Placeholder image", source: "url" },
    image_size: "full",
    align: "center",
  });
}
