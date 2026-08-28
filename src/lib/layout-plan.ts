import type { CatalogWidget, WidgetRole } from "./elementor-widgets";
import {
  hasDetectedLayout,
  pickWidget,
  planPageFromDetectedWidgets,
  settingsFromWidget,
  titleFromDetectedWidgets,
} from "./elementor-widgets";
import { FA, ICON_IMGS, type ElementorIcon } from "./icons";

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
  cardBg?: string;
  cardBorder?: string;
  cardRadius?: number;
  cardPad?: number;
  cardShadow?: boolean;
  direction?: "row" | "column";
  alignItems?: "center" | "stretch" | "flex-start";
  /** Wrap a slice of widgets into an N-column grid (used for the hero check boxes). */
  grid?: { from: number; count: number; columns: number };
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
const PLACEHOLDER_ICON = FA.bell;
const PLACEHOLDER_ICON_CIRCLE = FA.circle;
const ARTICLE_TITLE = "How Can Vets Reduce No-Shows At Their Clinic Effectively?";

const TAKEAWAYS = [
  "Confirm appointments the day before with a two-way text, not a voicemail.",
  "Let clients reschedule in one tap so a cancellation becomes a filled slot.",
  "Watch the 9:40 AM gap — that is where no-shows concentrate.",
  "Treat vet no-shows as a communication problem, not a client problem.",
];

const HERO_CHECKS = [
  { title: "Increase Revenue", copy: "Capture every opportunity" },
  { title: "Reduce No-Shows", copy: "Automated reminders" },
  { title: "Delight Clients", copy: "Fast, reliable responses" },
  { title: "Cover After-Hours", copy: "Live answer when you are closed" },
];

const TRUSTED_BRANDS = ["otto", "covetrus avimark", "covetrus pulse", "covetrus ascend", "covetrus impromed"];
const INTEGRATION_BRANDS = ["otto", "covetrus avimark", "covetrus pulse", "covetrus ascend", "covetrus impromed"];

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

export type PageKind = "landing" | "article" | "primitive";

function normalizedFilename(filename?: string): string {
  return (filename ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function looksLikeLandingFilename(filename?: string): boolean {
  const name = normalizedFilename(filename);
  return /home-?page|homepage|landing-page|(?:^|-)landing(?:-|$)|never-miss|client-call|(?:^|-)index(?:-|$)|industry-page|veterinar/.test(
    name,
  );
}

export function looksLikeArticleFilename(filename?: string): boolean {
  const name = normalizedFilename(filename);
  return /no-shows?|article|(?:^|-)blog(?:-|$)|blog-post|vets-reduce|clinic-effectively/.test(name);
}

function sectionShare(sections: DesignSection[], match: (section: DesignSection) => boolean): number {
  return sections.reduce((sum, section) => (match(section) ? sum + Math.max(0, section.y1 - section.y0) : sum), 0);
}

function contentShare(analysis: DesignAnalysis): number {
  return sectionShare(
    analysis.sections,
    (section) => section.role === "content" && section.columns <= 1 && !section.imageHeavy,
  );
}

function splitCount(analysis: DesignAnalysis): number {
  return analysis.sections.filter(
    (section) =>
      section.role === "split" || (section.columns === 2 && section.role !== "hero" && section.role !== "header"),
  ).length;
}

function ctaCount(analysis: DesignAnalysis): number {
  return analysis.sections.filter((section) => section.role === "cta").length;
}

function hasFeatureGrid(analysis: DesignAnalysis): boolean {
  return analysis.sections.some((section, index) => {
    if (section.role === "features") return true;
    const nearEnd = index >= Math.max(0, analysis.sections.length - 2);
    if (section.columns >= 4 && nearEnd) return false;
    return section.columns >= 3;
  });
}

function hasRelatedGrid(analysis: DesignAnalysis): boolean {
  const total = analysis.sections.length;
  return analysis.sections.some(
    (section, index) => section.columns >= 4 && index > 0 && index >= Math.max(0, total - 3),
  );
}

function landingScore(analysis: DesignAnalysis, filename?: string): number {
  let score = 0;
  if (looksLikeLandingFilename(filename)) score += 8;
  if (hasFeatureGrid(analysis)) score += 5;
  score += Math.min(6, splitCount(analysis) * 2);
  score += Math.min(6, ctaCount(analysis) * 2);
  if (analysis.sections.length >= 5) score += 3;
  if (analysis.width > 0 && analysis.height / analysis.width > 2.4) score += 3;
  if (sectionShare(analysis.sections, (section) => section.imageHeavy) > 0.12) score += 2;
  if (contentShare(analysis) > 0.22) score -= 4;
  return score;
}

function articleScore(analysis: DesignAnalysis, filename?: string): number {
  let score = 0;
  if (looksLikeArticleFilename(filename)) score += 8;
  if (looksLikeLandingFilename(filename)) score -= 8;
  const share = contentShare(analysis);
  if (share >= 0.18) score += 5;
  if (share >= 0.28) score += 3;
  if (hasRelatedGrid(analysis)) score += 4;
  if (hasFeatureGrid(analysis)) score -= 3;
  if (splitCount(analysis) >= 2) score -= 3;
  if (ctaCount(analysis) >= 2) score -= 2;
  if (analysis.sections.length >= 7) score -= 3;
  return score;
}

export function looksLikeLanding(analysis: DesignAnalysis, filename?: string): boolean {
  if (looksLikeLandingFilename(filename) && !looksLikeArticleFilename(filename)) return true;
  if (looksLikeArticleFilename(filename) && !looksLikeLandingFilename(filename)) return false;
  const landing = landingScore(analysis, filename);
  const article = articleScore(analysis, filename);
  return landing >= 5 && landing >= article;
}

export function looksLikeArticle(analysis: DesignAnalysis, filename?: string): boolean {
  if (looksLikeArticleFilename(filename) && !looksLikeLandingFilename(filename)) return true;
  if (looksLikeLanding(analysis, filename)) return false;
  const landing = landingScore(analysis, filename);
  const article = articleScore(analysis, filename);
  return article >= 4 && article > landing;
}

export function classifyPageKind(
  analysis: DesignAnalysis,
  widgets: CatalogWidget[] = [],
  filename?: string,
): PageKind {
  if (looksLikeLandingFilename(filename) && !looksLikeArticleFilename(filename)) return "landing";
  if (looksLikeArticleFilename(filename) && !looksLikeLandingFilename(filename)) return "article";

  // planLandingPage and planArticlePage emit fixed Axion copy and never read the
  // analysed design, so committing to them on structure alone replaces an
  // unrelated design with the wrong page. Structure cannot tell them apart
  // either: the partner newsletter scores 19 on landingScore while the real vet
  // landing scores 13. Unless the filename names the page, convert the design
  // from its own sections.
  if (analysis.sections.length === 0) {
    return hasDetectedLayout(widgets) ? "article" : "primitive";
  }
  return "primitive";
}

export function landingPageTitle(): string {
  return "Never Miss Another Client Call";
}

export function pageTitle(analysis: DesignAnalysis, widgets: CatalogWidget[], filename?: string): string {
  const kind = classifyPageKind(analysis, widgets, filename);
  if (kind === "landing") return landingPageTitle();
  // titleFromDetectedWidgets reads the Axion blog widgets' own defaults, so it
  // only describes the design when this really is that article. For anything
  // else it would title an unrelated design "Vets Reduce No-Shows".
  if (kind === "article") {
    const fromWidgets = titleFromDetectedWidgets(widgets);
    if (fromWidgets) return fromWidgets;
  }
  return titleFromFilename(filename);
}

/** "Axion_Partner Newsletter_FeedbackV5-B4.pdf" → "Axion Partner Newsletter FeedbackV5-B4" */
export function titleFromFilename(filename?: string): string {
  const base = (filename ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || "Design";
}

export function planPageLayout(options: {
  analysis: DesignAnalysis;
  widgets: CatalogWidget[];
  extras: LayoutExtras;
  filename?: string;
}): PlannedSection[] {
  const kind = classifyPageKind(options.analysis, options.widgets, options.filename);
  if (kind === "landing") {
    return planLandingPage(options.widgets, options.extras);
  }
  if (kind === "article") {
    return planArticlePage(options.widgets, options.extras);
  }
  const sections = options.analysis.sections.length
    ? options.analysis.sections
    : defaultPrimitiveSections();
  return sections.map((section, index) => planPrimitiveSection(section, index, options.widgets, options.extras));
}

const LANDING_HERO =
  "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=1400&q=80";
const LANDING_SUPPORT =
  "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=800&q=80";
const LANDING_DASH =
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80";
const LANDING_TRUST_LOGOS =
  "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=1400&q=80";
const PAIN_BG = "#FFF5F5";
const RED = "#E24B4A";
const GREEN = "#22C55E";

export const LANDING_STOCK = {
  hero: LANDING_HERO,
  support: LANDING_SUPPORT,
  dash: LANDING_DASH,
  avatar: AVATAR,
  trustLogos: LANDING_TRUST_LOGOS,
};

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
  opts?: {
    align?: PlannedRow["align"];
    card?: boolean;
    cardBg?: string[];
    cardBorder?: Array<string | undefined>;
    cardRadius?: number;
    cardPad?: number;
    cardShadow?: boolean[];
    gap?: number;
    columnAlign?: Array<PlannedColumn["alignItems"]>;
  },
): PlannedRow {
  const columns = columnsFromPercents(percents);
  fill.forEach((widgets, index) => {
    const column = columns[index];
    if (!column) return;
    column.widgets = widgets;
    if (opts?.card) column.card = true;
    if (opts?.cardBg?.[index]) column.cardBg = opts.cardBg[index];
    if (opts?.cardBorder?.[index]) column.cardBorder = opts.cardBorder[index];
    if (opts?.cardRadius != null) column.cardRadius = opts.cardRadius;
    if (opts?.cardPad != null) column.cardPad = opts.cardPad;
    if (opts?.cardShadow?.[index]) column.cardShadow = true;
    if (opts?.columnAlign?.[index]) column.alignItems = opts.columnAlign[index];
  });
  return { columns, align: opts?.align, gap: opts?.gap };
}

function planLandingPage(widgets: CatalogWidget[], extras: LayoutExtras): PlannedSection[] {
  const pains = [
    {
      n: "1",
      icon: FA.phone,
      title: "Front desk slammed",
      copy: "Busy front desk, calls on hold, clients get frustrated and hang up.",
    },
    {
      n: "2",
      icon: FA.calendar,
      title: "No-shows",
      copy: "Missed appointments hurt your schedule and your bottom line.",
    },
    {
      n: "3",
      icon: FA.clock,
      title: "After-hours emergencies",
      copy: "Calls after hours go unanswered when your team is unavailable.",
    },
  ];
  const gains = [
    {
      n: "1",
      icon: FA.phone,
      title: "Never miss a call",
      bullets: ["Intelligent call routing", "Unlimited extensions", "Calls answered in seconds"],
      result: "More calls answered, more revenue captured.",
      featured: false,
    },
    {
      n: "2",
      icon: FA.calendar,
      title: "Reduce no-shows",
      bullets: ["Automated text and email reminders", "Two-way texting", "Easy rescheduling"],
      result: "Fewer no-shows, healthier schedules.",
      featured: false,
    },
    {
      n: "3",
      icon: FA.clock,
      title: "Handle after-hours",
      bullets: ["After-hours call routing", "Voicemail to text", "Emergency notifications"],
      result: "Happier clients, better outcomes.",
      featured: true,
    },
  ];

  const nav = row(
    [22, 50, 28],
    [
      [heading(widgets, "AXION COMMUNICATIONS", { as: "h3", color: WHITE, px: 15 })],
      [
        primitive(widgets, "text", {
          editor: `<p style="margin:0;text-align:center">${["Products", "Solutions", "Company", "Resources", "Our Network"]
            .map((link) => `<a href="#" style="color:#ffffff;text-decoration:none;margin:0 12px;font-weight:500;font-size:14px">${link} ▾</a>`)
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
  nav.columns[2].direction = "row";

  const form = extras.form
    ? [{ widget: pickWidget("form", widgets), settings: { shortcode: pickWidget("form", widgets).shortcode || "[contact-form]" } }]
    : [
        primitive(widgets, "text", {
          editor:
            '<p style="margin:0 0 10px"><input type="text" placeholder="Full name" style="width:100%;box-sizing:border-box;border:1px solid #e6edf4;background:#f4f7fb;border-radius:10px;padding:14px 16px;font-size:15px" /></p><p style="margin:0 0 10px"><input type="email" placeholder="Email" style="width:100%;box-sizing:border-box;border:1px solid #e6edf4;background:#f4f7fb;border-radius:10px;padding:14px 16px;font-size:15px" /></p><p style="margin:0 0 16px"><input type="text" placeholder="Practice name" style="width:100%;box-sizing:border-box;border:1px solid #e6edf4;background:#f4f7fb;border-radius:10px;padding:14px 16px;font-size:15px" /></p>',
          align: "left",
        }),
        goldButton(widgets, "Book My Live Demo", true, "left"),
      ];

  const demo = row(
    [50, 50],
    [
      [
        heading(widgets, "See Axion In Action", { as: "h2", color: WHITE, px: 32 }),
        bodyText(widgets, "<p>Book your personalized demo.</p>", "#e8eef4"),
        ...form,
        bodyText(
          widgets,
          `<p>${ICON_IMGS.clock} See it live and lock in WVC show pricing—available to booth visitors only.</p>`,
          "#d7e4f2",
        ),
      ],
      [
        primitive(widgets, "image", {
          image: { url: LANDING_SUPPORT, id: "", alt: "Live U.S. support specialist", source: "url" },
          image_size: "full",
          align: "center",
          border_radius: { unit: "%", top: "50", right: "50", bottom: "50", left: "50", isLinked: true },
        }),
        iconBox(widgets, "Live U.S. Support 24/7", "The same team you'll call after you switch", FA.headset),
        iconBox(widgets, "About 7 Seconds", "Average answer time", FA.clock),
        iconBox(widgets, "The Same Team", "You'll call after you switch", FA.users),
      ],
    ],
    { align: "center", gap: 32 },
  );
  demo.columns[0].card = true;
  demo.columns[0].cardBg = WHITE;

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
        ),
      ],
      { fullBleed: true, boxedWidth: 1180, pad: "tight" },
    ),
    pack("header", "Main nav", [nav], {
      fg: WHITE,
      fullBleed: true,
      boxedWidth: 1180,
      pad: "tight",
      banner: { color: NAVY, radius: 48, compact: true },
    }),
    pack(
      "hero",
      "Landing hero",
      [
        (() => {
          const heroRow = row(
            [52, 48],
            [
              [
                heading(widgets, "BUILT FOR VETERINARY PRACTICES", {
                  as: "h4",
                  color: ACCENT,
                  px: 12,
                  extra: { typography_letter_spacing: { unit: "em", size: 0.14 } },
                }),
                richTitle(widgets, `Never Miss Another ${mark("Client Call.")}`, "h1", 48),
                bodyText(
                  widgets,
                  "<p>Missed calls cost veterinary practices time, clients, and revenue. Axion makes sure every call is answered, every time.</p>",
                ),
                ...HERO_CHECKS.map((item) => iconBox(widgets, item.title, item.copy)),
                goldButton(widgets, "Book a Demo", true, "left"),
                primitive(widgets, "text", {
                  editor: `<p style="margin:8px 0 0;color:${ACCENT};font-weight:600">15 minutes. No pressure.</p>`,
                  align: "left",
                  text_color: ACCENT,
                }),
              ],
              [
                primitive(widgets, "image", {
                  image: { url: LANDING_HERO, id: "", alt: "Veterinarian with a golden retriever", source: "url" },
                  image_size: "full",
                  align: "center",
                  border_radius: { unit: "px", top: "22", right: "22", bottom: "22", left: "22", isLinked: true },
                }),
              ],
            ],
            { align: "center", gap: 32 },
          );
          heroRow.columns[0].grid = { from: 3, count: 4, columns: 2 };
          return heroRow;
        })(),
      ],
      { boxedWidth: 1180, pad: "hero" },
    ),
    pack(
      "cta",
      "Trusted by",
      [
        row(
          [10, 26, 64],
          [
            [bannerIcon(widgets, FA.users, GOLD), bannerIcon(widgets, FA.star, GOLD)],
            [
              heading(widgets, "Trusted By", { as: "h4", color: WHITE, px: 13 }),
              heading(widgets, "HUNDREDS OF", { as: "h3", color: GOLD, px: 22 }),
              heading(widgets, "Veterinary Practices", { as: "h4", color: WHITE, px: 16 }),
            ],
            [
              primitive(widgets, "image", {
                image: { url: LANDING_TRUST_LOGOS, id: "", alt: "otto, Covetrus Avimark, Pulse, Ascend, Impromed", source: "url" },
                image_size: "full",
                align: "center",
              }),
              takeawayList(widgets, TRUSTED_BRANDS, FA.circle, "#d7e4f2", "inline"),
            ],
          ],
          { align: "center", gap: 16 },
        ),
      ],
      { bg: NAVY, fullBleed: true, boxedWidth: 1180, pad: "tight" },
    ),
    pack(
      "features",
      "Pain points",
      [
        row([100], [[richTitle(widgets, `Just A Few ${mark("Pain Points", RED)} We Solve`, "h2", 40)]]),
        row(
          [33, 33, 34],
          pains.map((item) => [
            numberBadge(widgets, item.n, RED, WHITE),
            bannerIcon(widgets, item.icon, RED),
            heading(widgets, item.title, { as: "h3", color: RED, px: 20, align: "center" }),
            bodyText(widgets, `<p style="text-align:center">${item.copy}</p>`),
          ]),
          {
            card: true,
            cardBg: [PAIN_BG, PAIN_BG, PAIN_BG],
            cardBorder: ["none", "none", "none"],
            cardRadius: 18,
            cardPad: 32,
            align: "stretch",
            gap: 22,
            columnAlign: ["center", "center", "center"],
          },
        ),
      ],
      { boxedWidth: 1180 },
    ),
    pack(
      "features",
      "What you gain",
      [
        row([100], [[heading(widgets, "WHAT YOU GAIN", { as: "h2", color: NAVY, px: 28, align: "center" })]]),
        row(
          [33, 33, 34],
          gains.map((item) => [
            numberBadge(widgets, item.n, item.featured ? GOLD : NAVY, item.featured ? INK : WHITE),
            bannerIcon(widgets, item.icon, item.featured ? GOLD : NAVY),
            heading(widgets, item.title, {
              as: "h3",
              color: item.featured ? GOLD : NAVY,
              px: 20,
              align: "center",
            }),
            takeawayList(widgets, item.bullets, FA.check, item.featured ? WHITE : INK),
            bodyText(
              widgets,
              `<p style="text-align:center"><strong>Result:</strong> ${item.result}</p>`,
              item.featured ? GOLD : INK,
            ),
          ]),
          {
            card: true,
            cardBg: [WHITE, WHITE, NAVY],
            cardBorder: ["#E6EDF4", "#E6EDF4", NAVY],
            cardRadius: 18,
            cardPad: 36,
            cardShadow: [false, false, true],
            align: "stretch",
            gap: 22,
            columnAlign: ["center", "center", "center"],
          },
        ),
        row(
          [50, 50],
          [
            [goldButton(widgets, "Book a Demo", true, "right")],
            [ghostButton(widgets, "Watch Axion Highlight Video")],
          ],
          { align: "center", gap: 16 },
        ),
      ],
      { boxedWidth: 1180 },
    ),
    pack(
      "media",
      "Integrations",
      [
        row([100], [[richTitle(widgets, `Works Seamlessly With ${mark("Your Practice Software")}`, "h2", 32)]]),
        row([100], [[takeawayList(widgets, INTEGRATION_BRANDS, FA.circle, MUTED, "inline")]]),
      ],
      { boxedWidth: 1180 },
    ),
    pack(
      "split",
      "Proof",
      [
        row(
          [58, 42],
          [
            [
              bannerIcon(widgets, FA.quote, NAVY, undefined, "left"),
              bodyText(
                widgets,
                "<p>“By far, they are the best VoIP provider that I have worked with. Great support. The longest I have ever sat on hold to talk to a tech was 30 seconds. You can’t ask for anything better.”</p>",
              ),
              primitive(widgets, "text", {
                editor: `<p style="margin:0;display:flex;align-items:center;gap:10px"><img src="${AVATAR}" alt="" width="40" height="40" style="width:40px;height:40px;border-radius:50%" /> <strong style="color:${ACCENT}">Jeff Falkners</strong><br><span style="color:${MUTED}">Vetcor</span></p>`,
                align: "left",
              }),
            ],
            [
              bannerIcon(widgets, FA.chart, ACCENT),
              heading(widgets, "312", { as: "h2", color: ACCENT, px: 56, align: "center" }),
              heading(widgets, "Missed Calls Recovered", { as: "h3", color: ACCENT, px: 18, align: "center" }),
              bodyText(widgets, '<p style="text-align:center">in the last 90 days by Axion customers.</p>'),
            ],
          ],
          {
            card: true,
            cardBg: [TAG_BG, TAG_BG],
            cardBorder: ["none", "none"],
            align: "center",
            gap: 28,
            columnAlign: ["stretch", "center"],
          },
        ),
      ],
      { boxedWidth: 1180 },
    ),
    pack(
      "content",
      "Compare",
      [
        row([100], [[richTitle(widgets, `${mark("Axion")} Vs. Others`, "h2", 32)]]),
        row(
          [32, 36, 32],
          [
            [
              heading(widgets, "Feature", { as: "h4", color: MUTED, px: 14 }),
              takeawayList(
                widgets,
                [
                  "Unlimited Users",
                  "Two-Way Texting",
                  "After-Hours Routing",
                  "Voicemail To Email/Text",
                  "Transparent Pricing",
                  "Built For Veterinary Practices",
                ],
                FA.circle,
                INK,
              ),
            ],
            [
              heading(widgets, "Axion Communications", { as: "h4", color: WHITE, px: 14, align: "center" }),
              takeawayList(
                widgets,
                ["Yes", "Included", "Included", "Included", "Yes", "Yes"],
                FA.check,
                WHITE,
              ),
            ],
            [
              heading(widgets, "Others", { as: "h4", color: NAVY, px: 14 }),
              bodyText(
                widgets,
                `<p style="color:${RED}">Limited / Add-On<br>Add-On<br>Add-On<br>Add-On<br>Not Always<br>General Practices</p>`,
                RED,
              ),
            ],
          ],
          { card: true, cardBg: ["#ffffff", NAVY, "#eef6ff"], align: "stretch" },
        ),
      ],
      { boxedWidth: 1180 },
    ),
    pack(
      "cta",
      "Book demo",
      [demo],
      { bg: NAVY, boxedWidth: 1180, banner: { color: NAVY, radius: 28 } },
    ),
    pack(
      "faq",
      "FAQ",
      [
        row([100], [[richTitle(widgets, `Frequently Asked ${mark("Questions")}`, "h2", 36)]]),
        row([100], [[landingFaq(widgets)]]),
      ],
      { boxedWidth: 800 },
    ),
    pack(
      "cta",
      "Always answers",
      [
        row(
          [48, 52],
          [
            [
              heading(widgets, "Be The Clinic That", { as: "h2", color: WHITE, px: 32 }),
              heading(widgets, "Always Answers.", { as: "h2", color: GOLD, px: 32 }),
              bodyText(
                widgets,
                "<p>Cloud phone, automated reminders, and two-way texting in one platform—so every client reaches you and your team gets back to caring for patients.</p>",
                "#e8eef4",
              ),
              goldButton(widgets, "Schedule a 15-Minute Demo", true, "left"),
              bodyText(widgets, "<p>Need answers now? <strong>(855) 982-9466</strong></p>", WHITE),
            ],
            [
              primitive(widgets, "image", {
                image: { url: LANDING_DASH, id: "", alt: "Axion dashboard", source: "url" },
                image_size: "full",
                align: "center",
                border_radius: { unit: "px", top: "16", right: "16", bottom: "16", left: "16", isLinked: true },
              }),
            ],
          ],
          { align: "center" },
        ),
      ],
      { boxedWidth: 1180, banner: { color: NAVY, radius: 28 } },
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
            [bannerIcon(widgets, FA.bell, "#111111", GOLD)],
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
            [bannerIcon(widgets, FA.clipboard, WHITE, NAVY)],
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
    typography_font_size: { unit: "px", size: px, sizes: [] },
    typography_font_weight: as === "h4" ? "700" : "800",
    typography_line_height: { unit: "em", size: as === "h1" ? 1.12 : 1.25, sizes: [] },
    _padding: { unit: "px", top: "0", right: "0", bottom: "8", left: "0", isLinked: false },
    ...(opts.extra ?? {}),
  });
}

function numberBadge(widgets: CatalogWidget[], n: string, bg: string, fg: string): PlannedWidget {
  return primitive(widgets, "heading", {
    title: n,
    header_size: "h4",
    size: "small",
    align: "center",
    title_color: fg,
    typography_typography: "custom",
    typography_font_size: { unit: "px", size: 16, sizes: [] },
    typography_font_weight: "800",
    background_background: "classic",
    background_color: bg,
    border_radius: { unit: "px", top: "8", right: "8", bottom: "8", left: "8", isLinked: true },
    _padding: { unit: "px", top: "8", right: "14", bottom: "8", left: "14", isLinked: true },
    _margin: { unit: "px", top: "-28", right: "0", bottom: "8", left: "0", isLinked: false },
  });
}

function mark(word: string, color = ACCENT): string {
  return `<span style="color:${color}">${word}</span>`;
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
  icon: ElementorIcon,
  color: string,
  circle?: string,
  align: "left" | "center" | "right" = "center",
): PlannedWidget {
  return primitive(widgets, "icon", {
    selected_icon: icon,
    icon_type: icon.library === "svg" ? "svg" : "icon",
    view: circle ? "stacked" : "default",
    shape: circle ? "circle" : "",
    primary_color: color,
    hover_primary_color: color,
    secondary_color: circle ?? color,
    hover_secondary_color: circle ?? color,
    size: { unit: "px", size: circle ? 20 : 28 },
    align,
  });
}

function iconBox(
  widgets: CatalogWidget[],
  title: string,
  description: string,
  icon: ElementorIcon = FA.check,
): PlannedWidget {
  const widget = widgets.find((item) => item.type === "icon-box");
  if (!widget) {
    return takeawayList(widgets, [`${title} — ${description}`], FA.check);
  }
  return {
    widget,
    settings: {
      ...settingsFromWidget(widget),
      selected_icon: icon,
      title_text: title,
      description_text: description,
      title_size: "h4",
      title_color: INK,
      description_color: MUTED,
      primary_color: WHITE,
      hover_primary_color: WHITE,
      icon_secondary_color: GREEN,
      hover_secondary_color: GREEN,
      view: "stacked",
      shape: "circle",
      position: "left",
      icon_vertical_alignment: "top",
      icon_size: { unit: "px", size: 14 },
      icon_padding: { unit: "px", top: "10", right: "10", bottom: "10", left: "10", isLinked: true },
      icon_space: { unit: "px", size: 12 },
      title_bottom_space: { unit: "px", size: 2 },
    },
  };
}

function takeawayList(
  widgets: CatalogWidget[],
  items: string[] = TAKEAWAYS,
  icon: ElementorIcon = FA.circle,
  textColor?: string,
  layout: "traditional" | "inline" = "traditional",
): PlannedWidget {
  const list = widgets.find((widget) => widget.type === "icon-list");
  const check = icon.value === FA.check.value;
  if (list) {
    return {
      widget: list,
      settings: {
        icon_list: items.map((text) => ({
          text,
          selected_icon: icon,
          link: { url: "", is_external: "", nofollow: "" },
        })),
        text_color: textColor ?? INK,
        icon_color: check ? (textColor === WHITE ? WHITE : GREEN) : textColor ?? INK,
        space_between: { unit: "px", size: layout === "inline" ? 22 : 14 },
        icon_size: { unit: "px", size: check ? 16 : 8 },
        view: layout,
      },
    };
  }
  return primitive(widgets, "text", {
    editor: `<ul>${items.map((text) => `<li>${text}</li>`).join("")}</ul>`,
    align: "left",
    text_color: textColor ?? INK,
  });
}

function landingFaq(widgets: CatalogWidget[]): PlannedWidget {
  const widget =
    widgets.find((item) => item.type === "accordion" || item.type === "nested-accordion" || item.type === "toggle") ??
    pickWidget("faq", widgets);
  const items = [
    {
      tab_title: "What does Axion cost?",
      tab_content:
        "<p>You'll get the complete price list in your first conversation—every seat, tier, and fee, in writing. No quote walls, and no add-on fees that appear later. Want the comparison first? Send us your current bill for a free line-by-line analysis.</p>",
    },
    {
      tab_title: "What's included, and what costs extra?",
      tab_content:
        "<p>Routing, reminders, two-way texting, and live answer are in the plan. The demo walks every line so nothing shows up later as an add-on.</p>",
    },
    {
      tab_title: "How does Axion reduce no-shows?",
      tab_content:
        "<p>Two-way reminders, one-tap reschedule, and a wait list that fills the same-day gap instead of leaving an empty chair.</p>",
    },
    {
      tab_title: "How fast is your support, really?",
      tab_content:
        "<p>Live U.S. support. Average answer time is about 7 seconds — the same team you get after you switch.</p>",
    },
    {
      tab_title: "How long does it take to switch, and will we keep our number?",
      tab_content:
        "<p>Keep the numbers clients already know. Axion sits in front of the existing lines and the mobile app.</p>",
    },
    {
      tab_title: "Who trains our team, including new hires?",
      tab_content:
        "<p>Onboarding covers the front desk and the floor. New hires get the same walkthrough without a second implementation fee.</p>",
    },
    {
      tab_title: "Will Axion work with the software our practice already uses?",
      tab_content:
        "<p>Yes. Axion syncs with Avimark, Pulse, ezyVet, Impromed, and other common veterinary practice systems.</p>",
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

function goldButton(
  widgets: CatalogWidget[],
  text: string,
  arrow = false,
  align = "center",
): PlannedWidget {
  return primitive(widgets, "button", {
    text,
    size: "lg",
    align,
    background_color: GOLD,
    button_text_color: "#000000",
    border_radius: { unit: "px", top: "40", right: "40", bottom: "40", left: "40", isLinked: true },
    typography_typography: "custom",
    typography_font_weight: "700",
    typography_font_size: { unit: "px", size: 15 },
    ...(arrow
      ? {
          selected_icon: FA.arrow,
          icon_align: "right",
          icon_indent: { unit: "px", size: 8 },
        }
      : {}),
    link: { url: "#", is_external: "", nofollow: "" },
  });
}

function ghostButton(widgets: CatalogWidget[], text: string): PlannedWidget {
  return primitive(widgets, "button", {
    text,
    size: "lg",
    align: "left",
    background_color: "#EEF2F6",
    button_text_color: INK,
    border_radius: { unit: "px", top: "40", right: "40", bottom: "40", left: "40", isLinked: true },
    typography_typography: "custom",
    typography_font_weight: "700",
    typography_font_size: { unit: "px", size: 15 },
    selected_icon: FA.play,
    icon_align: "right",
    icon_indent: { unit: "px", size: 8 },
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
          selected_icon: FA.arrow,
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
