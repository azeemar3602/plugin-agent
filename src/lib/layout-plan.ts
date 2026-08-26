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

export type PlannedRow = {
  columns: PlannedColumn[];
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
  banner?: { color: string; radius: number };
  rows: PlannedRow[];
};

export type LayoutExtras = {
  donation: boolean;
  search: boolean;
  form: boolean;
  language: boolean;
};

const INK = "#1C1C1C";
const NAVY = "#115696";
const NAVY_DARK = "#0d3d66";
const GOLD = "#FFD800";
const MUTED = "#5b6570";
const TOPBAR = "#f4f6f9";
const WHITE = "#ffffff";
const HERO_IMAGE = "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1400&q=80";
const AVATAR = "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=128&h=128&q=80";
const PLACEHOLDER_IMAGE = "https://placehold.co/1200x640/png?text=Image";
const PLACEHOLDER_ICON = { value: "fas fa-star", library: "fa-solid" };
const PLACEHOLDER_ICON_CIRCLE = { value: "fas fa-circle", library: "fa-solid" };
const CHECK = { value: "fas fa-check", library: "fa-solid" };

const TAKEAWAYS = [
  "Confirm appointments the day before with a two-way text, not a voicemail.",
  "Let clients reschedule in one tap so a cancellation becomes a filled slot.",
  "Watch the 9:40 AM gap — that is where no-shows concentrate.",
  "Treat vet no-shows as a communication problem, not a client problem.",
];

const RELATED = [
  { cat: "Practice Management", title: "How reminder timing changes show-up rates" },
  { cat: "Client Communications", title: "Two-way texting that clients actually answer" },
  { cat: "Reminders", title: "Same-day openings: filling the 9:40 AM gap" },
  { cat: "After hours", title: "After-hours booking without a front-desk bottleneck" },
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
    n === 1 ? [100] : n === 3 ? [50, 50, 100] : Array.from({ length: n }, () => (n >= 2 ? 50 : 100));
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
    widthTablet: n === 1 ? 100 : stackTablet ? 100 : n >= 4 ? 50 : n === 2 ? 50 : 50,
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
    { role: "cta", y0: 0.45, y1: 0.58, columns: 1, bg: NAVY_DARK, fg: "#f8f8f8", imageHeavy: false },
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
    bg: WHITE,
    fg: INK,
    fullBleed: false,
    boxedWidth: 1180,
    rows,
    ...extra,
  };
}

function row(percents: number[], fill: PlannedWidget[][]): PlannedRow {
  const columns = columnsFromPercents(percents);
  fill.forEach((widgets, index) => {
    if (columns[index]) columns[index].widgets = widgets;
  });
  return { columns };
}

function planArticlePage(widgets: CatalogWidget[], _extras: LayoutExtras): PlannedSection[] {
  const addons = addonsByRole(widgets);
  const hero = addons.blogHero ? settingsFromWidget(addons.blogHero) : {};
  const title =
    [hero.heading_before, hero.heading_highlight, hero.heading_after]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ")
      .trim() || "How Can Vets Reduce No-Shows At Their Clinic Effectively?";
  const imageUrl =
    hero.image && typeof hero.image === "object" && "url" in hero.image && typeof hero.image.url === "string" && hero.image.url
      ? hero.image.url
      : HERO_IMAGE;

  return [
    pack(
      "header",
      "Top bar",
      [
        row(
          [50, 50],
          [
            [
              primitive(widgets, "text", {
                editor: "<p>Mon – Fri — 8:00 – 6:00</p>",
                align: "left",
                text_color: MUTED,
              }),
            ],
            [
              primitive(widgets, "text", {
                editor: "<p>☎ (800) 555-0148</p>",
                align: "right",
                text_color: MUTED,
              }),
            ],
          ],
        ),
      ],
      { bg: TOPBAR, fullBleed: true, boxedWidth: 1180 },
    ),
    pack(
      "header",
      "Main nav",
      [
        row(
          [20, 58, 22],
          [
            [
              primitive(widgets, "heading", {
                title: "Axion",
                header_size: "h3",
                align: "left",
                title_color: NAVY,
              }),
            ],
            [
              primitive(widgets, "text", {
                editor:
                  '<p><a href="#">Products</a> &nbsp; <a href="#">Solutions</a> &nbsp; <a href="#">Company</a> &nbsp; <a href="#">Resources</a> &nbsp; <a href="#">Our Network</a></p>',
                align: "center",
                text_color: INK,
              }),
            ],
            [
              goldButton(widgets, "Let's Get Started"),
              primitive(widgets, "text", {
                editor: "<p>Login</p>",
                align: "right",
                text_color: NAVY,
              }),
            ],
          ],
        ),
      ],
      { bg: WHITE, fullBleed: true },
    ),
    pack(
      "hero",
      "Article hero",
      [
        row(
          [100],
          [
            [
              primitive(widgets, "heading", {
                title,
                header_size: "h1",
                align: "left",
                title_color: INK,
              }),
            ],
          ],
        ),
        row(
          [58, 42],
          [
            [
              primitive(widgets, "image", {
                image: { url: AVATAR, id: "", alt: "Author", source: "url" },
                image_size: "full",
                align: "left",
                width: { unit: "px", size: 44 },
                border_radius: { unit: "%", top: "50", right: "50", bottom: "50", left: "50", isLinked: true },
              }),
              primitive(widgets, "text", {
                editor: "<p><strong>Admin</strong> · May 12, 2023</p>",
                align: "left",
                text_color: MUTED,
              }),
              ...(addons.takeaways
                ? [{ widget: addons.takeaways, settings: takeawaySettings(addons.takeaways) }]
                : [
                    primitive(widgets, "heading", {
                      title: "Key Takeaways",
                      header_size: "h2",
                      align: "left",
                      title_color: NAVY,
                    }),
                    takeawayList(widgets),
                  ]),
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
        ),
      ],
      { bg: WHITE, boxedWidth: 1180 },
    ),
    pack(
      "content",
      "Article body",
      [
        row(
          [100],
          [
            [
              primitive(widgets, "heading", {
                title: "The 9:40 AM Gap That Costs Your Clinic $180",
                header_size: "h2",
                align: "left",
                title_color: NAVY,
              }),
              primitive(widgets, "text", {
                editor:
                  "<p>A single no-show is not an empty chair. It is a block of doctor time, technician time, and a client who still needs care later in the week. The 9:40 AM slot is where that leak shows up first.</p>",
                align: "left",
                text_color: INK,
              }),
              primitive(widgets, "heading", {
                title: "Why Vet No-Shows Aren't Like Other No-Shows",
                header_size: "h2",
                align: "left",
                title_color: NAVY,
              }),
              primitive(widgets, "text", {
                editor:
                  "<p>Pet owners are not skipping a haircut. They are juggling a sick animal, a work day, and a reminder they never saw. Voicemail does not close that loop. Two-way texting does.</p>",
                align: "left",
                text_color: INK,
              }),
              primitive(widgets, "heading", {
                title: "Three Communication Fixes That Actually Move the No-Show Rate",
                header_size: "h2",
                align: "left",
                title_color: NAVY,
              }),
              primitive(widgets, "text", {
                editor:
                  "<p>1. Confirm the day before with a reply, not a broadcast.<br>2. Let the client reschedule in one tap so the slot can be refilled.<br>3. Watch same-day openings and offer them to the wait list automatically.</p>",
                align: "left",
                text_color: INK,
              }),
            ],
          ],
        ),
      ],
      { bg: WHITE, boxedWidth: 800 },
    ),
    pack(
      "cta",
      "Schedule demo",
      [
        row(
          [70, 30],
          [
            [
              primitive(widgets, "heading", {
                title: "Want fewer no-shows and a fuller schedule?",
                header_size: "h3",
                align: "left",
                title_color: WHITE,
              }),
              primitive(widgets, "text", {
                editor:
                  "<p>See how automated reminders and online booking can help your clinic.</p>",
                align: "left",
                text_color: "#e8eef4",
              }),
            ],
            [goldButton(widgets, "Schedule A Demo Now")],
          ],
        ),
      ],
      { bg: WHITE, boxedWidth: 1180, banner: { color: NAVY_DARK, radius: 24 } },
    ),
    pack(
      "faq",
      "FAQ",
      [
        row(
          [100],
          [
            [
              primitive(widgets, "heading", {
                title: "Frequently Asked Questions",
                header_size: "h2",
                align: "left",
                title_color: NAVY,
              }),
              addons.faq
                ? { widget: addons.faq, settings: settingsFromWidget(addons.faq) }
                : accordion(widgets),
            ],
          ],
        ),
      ],
      { bg: WHITE, boxedWidth: 800 },
    ),
    pack(
      "downloadCta",
      "Checklist",
      [
        row(
          [70, 30],
          [
            [
              primitive(widgets, "heading", {
                title: "10 Ways to Reduce No-Shows at Your Clinic",
                header_size: "h3",
                align: "left",
                title_color: INK,
              }),
              primitive(widgets, "text", {
                editor: "<p>A practical checklist you can implement today.</p>",
                align: "left",
                text_color: INK,
              }),
            ],
            [navyButton(widgets, "Download Free Checklist")],
          ],
        ),
      ],
      { bg: WHITE, boxedWidth: 1180, banner: { color: GOLD, radius: 24 } },
    ),
    pack(
      "relatedPosts",
      "Related posts",
      [
        row(
          [100],
          [
            [
              primitive(widgets, "heading", {
                title: "Related posts",
                header_size: "h2",
                align: "left",
                title_color: INK,
              }),
            ],
          ],
        ),
        row(
          [25, 25, 25, 25],
          RELATED.map((card) => [
            primitive(widgets, "image", {
              image: { url: HERO_IMAGE, id: "", alt: card.title, source: "url" },
              image_size: "full",
              align: "center",
              border_radius: { unit: "px", top: "16", right: "16", bottom: "0", left: "0", isLinked: false },
            }),
            primitive(widgets, "text", {
              editor: `<p><strong>${card.cat}</strong></p>`,
              align: "left",
              text_color: NAVY,
            }),
            primitive(widgets, "heading", {
              title: card.title,
              header_size: "h3",
              align: "left",
              title_color: INK,
            }),
            primitive(widgets, "text", {
              editor: "<p>May 12, 2023 · 4 min read</p>",
              align: "left",
              text_color: MUTED,
            }),
          ]),
        ),
      ],
      { bg: WHITE, boxedWidth: 1180 },
    ),
    pack(
      "footer",
      "Footer",
      [
        row(
          [28, 18, 18, 18, 18],
          [
            [
              primitive(widgets, "heading", {
                title: "Axion",
                header_size: "h3",
                align: "left",
                title_color: WHITE,
              }),
              primitive(widgets, "text", {
                editor:
                  "<p>The communications platform for veterinary clinics that want fewer no-shows and a fuller day.</p>",
                align: "left",
                text_color: "#d7e4f2",
              }),
              primitive(widgets, "heading", {
                title: "(800) 555-0148",
                header_size: "h4",
                align: "left",
                title_color: GOLD,
              }),
            ],
            footerLinks(widgets, "Products", ["Overview", "Reminders", "Booking", "Inbox"]),
            footerLinks(widgets, "Solutions", ["For clinics", "For groups", "Integrations"]),
            footerLinks(widgets, "Company", ["About", "Careers", "Contact"]),
            footerLinks(widgets, "Resources", ["Blog", "Guides", "Support"]),
          ],
        ),
        row(
          [50, 50],
          [
            [
              primitive(widgets, "text", {
                editor: "<p>© 2023 Axion Communications. All rights reserved.</p>",
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
        ),
      ],
      { bg: NAVY, fg: WHITE, fullBleed: true, boxedWidth: 1180 },
    ),
  ];
}

function footerLinks(widgets: CatalogWidget[], heading: string, links: string[]): PlannedWidget[] {
  return [
    primitive(widgets, "heading", {
      title: heading,
      header_size: "h4",
      align: "left",
      title_color: WHITE,
    }),
    primitive(widgets, "text", {
      editor: `<p>${links.map((link) => `<a href="#">${link}</a>`).join("<br>")}</p>`,
      align: "left",
      text_color: "#d7e4f2",
    }),
  ];
}

function takeawaySettings(widget: CatalogWidget): Record<string, unknown> {
  const settings = settingsFromWidget(widget);
  const items = TAKEAWAYS.map((text) => ({ text, title: text, content: text }));
  if (widget.controls?.items) settings.items = items;
  return {
    ...settings,
    heading_before: "Key ",
    heading_highlight: "Takeaways",
    heading_after: "",
  };
}

function takeawayList(widgets: CatalogWidget[]): PlannedWidget {
  const list = widgets.find((widget) => widget.type === "icon-list");
  if (list) {
    return {
      widget: list,
      settings: {
        icon_list: TAKEAWAYS.map((text) => ({
          text,
          selected_icon: CHECK,
          link: { url: "", is_external: "", nofollow: "" },
        })),
        text_color: INK,
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

function goldButton(widgets: CatalogWidget[], text: string): PlannedWidget {
  return primitive(widgets, "button", {
    text,
    align: "center",
    background_color: GOLD,
    button_text_color: "#000000",
    border_radius: { unit: "px", size: 40 },
    link: { url: "#", is_external: "", nofollow: "" },
  });
}

function navyButton(widgets: CatalogWidget[], text: string): PlannedWidget {
  return primitive(widgets, "button", {
    text,
    align: "center",
    background_color: NAVY,
    button_text_color: WHITE,
    border_radius: { unit: "px", size: 40 },
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
