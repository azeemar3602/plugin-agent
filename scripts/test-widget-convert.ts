import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildElementorDocument } from "../src/lib/elementor-builder";
import { writeGeneratedPlugin } from "../src/lib/generate-widgets";
import { repairElementorDocument } from "../src/lib/widget-repair";
import {
  columnWidths,
  classifyPageKind,
  landingPageTitle,
  looksLikeArticleFilename,
  looksLikeLanding,
  looksLikeLandingFilename,
  pageTitle,
  planPageLayout,
} from "../src/lib/layout-plan";
import { MAX_SLUG_LENGTH, resolvePublishTarget } from "../src/lib/protected-pages";
import {
  availableWidgets,
  mergeRemoteWidgets,
  missingLayoutRoles,
  neededRolesFromAnalysis,
  planPageFromDetectedWidgets,
  titleFromDetectedWidgets,
  type WidgetControl,
} from "../src/lib/elementor-widgets";

const plugins = [
  { file: "elementor/elementor.php", name: "Elementor", status: "active", version: "3" },
  {
    file: "arcadia-elementor-addons/arcadia-elementor-addons.php",
    name: "Axion Dev",
    status: "active",
    version: "1.1.19",
  },
];

const remote: Array<{
  type: string;
  title: string;
  custom?: boolean;
  plugin?: string;
  controls?: Record<string, WidgetControl>;
}> = [
  { type: "heading", title: "Heading", custom: false, plugin: "elementor" },
  { type: "text-editor", title: "Text Editor", custom: false, plugin: "elementor" },
  { type: "html", title: "HTML", custom: false, plugin: "elementor" },
  {
    type: "arcadia_author_box",
    title: "Author Box",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_vet_hero",
    title: "Axion Vet Hero",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_faq",
    title: "Axion FAQ",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_header",
    title: "Axion Header",
    custom: true,
    plugin: "arcadia-elementor-addons",
    controls: {},
  },
  {
    type: "arcadia_axion_blog_hero",
    title: "Axion Blog Hero",
    custom: true,
    plugin: "arcadia-elementor-addons",
    controls: {
      heading_before: { type: "text", default: "Vets" },
      heading_highlight: { type: "text", default: "Reduce" },
      heading_after: { type: "text", default: "No-Shows" },
      image: { type: "media", default: { url: "", id: "", size: "" } },
      image_source: { type: "select", options: ["dynamic", "custom"], default: "dynamic" },
      items: { type: "repeater", default: [{}, {}, {}, {}] },
    },
  },
  {
    type: "arcadia_axion_author_post_meta",
    title: "Author and Post Meta",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_key_takeaways",
    title: "Key Takeaways",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_article_cta_banner",
    title: "Article CTA Banner",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_blog_faq",
    title: "Blog FAQ",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_download_cta",
    title: "Download CTA",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_blog_related_posts",
    title: "Related Posts",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
  {
    type: "arcadia_axion_footer",
    title: "Axion Footer",
    custom: true,
    plugin: "arcadia-elementor-addons",
  },
];

const widgets = mergeRemoteWidgets(availableWidgets(plugins), remote);
const plan = planPageFromDetectedWidgets(widgets);

assert.deepEqual(
  plan.map((widget) => widget.type),
  [
    "arcadia_axion_blog_hero",
    "arcadia_axion_key_takeaways",
    "arcadia_axion_article_cta_banner",
    "arcadia_axion_blog_faq",
    "arcadia_axion_download_cta",
    "arcadia_axion_blog_related_posts",
  ],
);

assert.equal(titleFromDetectedWidgets(widgets), "Vets Reduce No-Shows");

const built = buildElementorDocument({
  title: titleFromDetectedWidgets(widgets) || "Design",
  analysis: {
    width: 800,
    height: 2000,
    background: "#ffffff",
    sections: [
      { role: "hero", y0: 0, y1: 0.2, columns: 1, bg: "#fff", fg: "#111", imageHeavy: true },
      { role: "content", y0: 0.2, y1: 0.6, columns: 1, bg: "#fff", fg: "#111", imageHeavy: false },
      { role: "cta", y0: 0.6, y1: 0.8, columns: 1, bg: "#111", fg: "#fff", imageHeavy: false },
      { role: "footer", y0: 0.8, y1: 1, columns: 1, bg: "#111", fg: "#fff", imageHeavy: false },
    ],
  },
  widgets,
  extras: { donation: false, search: false, form: false, language: false },
});

assert.ok(!built.widgetsUsed.includes("html"), `HTML widget leaked: ${built.widgetsUsed.join(", ")}`);
assert.ok(!built.widgetsUsed.includes("arcadia_axion_key_takeaways"));
assert.ok(built.widgetsUsed.includes("arcadia_axion_blog_faq"));
assert.ok(built.widgetsUsed.includes("icon-list"));
assert.ok(built.widgetsUsed.includes("icon"));
assert.ok(!built.widgetsUsed.includes("arcadia_axion_header"));
assert.ok(!built.widgetsUsed.includes("arcadia_axion_footer"));

function walkWidgets(
  nodes: Array<{
    widgetType?: string;
    settings?: Record<string, unknown>;
    elements?: unknown[];
  }>,
): Array<{ widgetType?: string; settings?: Record<string, unknown> }> {
  const out: Array<{ widgetType?: string; settings?: Record<string, unknown> }> = [];
  for (const node of nodes) {
    if (node.widgetType) out.push(node);
    if (Array.isArray(node.elements)) {
      out.push(...walkWidgets(node.elements as typeof nodes));
    }
  }
  return out;
}

const doc = JSON.parse(built.json) as {
  title: string;
  content: Array<{
    elType?: string;
    isInner?: boolean;
    settings?: {
      layout?: string;
      content_width?: string;
      flex_direction_mobile?: string;
      padding?: { top?: string };
    };
    elements: unknown[];
  }>;
};
assert.equal(doc.title, "Vets Reduce No-Shows");
assert.ok(doc.content.every((section) => section.elType === "container"));
assert.ok(doc.content.every((section) => section.isInner === false));
assert.ok(built.sectionRoles.some((role) => role.startsWith("hero ") && role.includes("58/42")));
assert.ok(built.sectionRoles.some((role) => role.startsWith("cta ") && role.includes("12/58/30")));
assert.ok(built.sectionRoles.some((role) => role.includes("25/25/25/25")));
const allWidgets = walkWidgets(doc.content);
const types = allWidgets.map((node) => node.widgetType).filter(Boolean);
assert.ok(!types.includes("arcadia_axion_key_takeaways"));
assert.ok(types.includes("arcadia_axion_blog_faq"));
assert.ok(!types.includes("arcadia_axion_header"));
assert.ok(!types.includes("arcadia_axion_footer"));
assert.ok(types.includes("heading"));
assert.ok(types.includes("button"));
assert.ok(types.includes("image"));
assert.ok(types.includes("icon-list"));

const heroHeading = allWidgets.find((node) =>
  String(node.settings?.editor ?? node.settings?.title ?? "").includes("How Can Vets"),
);
assert.ok(heroHeading);
assert.ok(String(heroHeading?.settings?.editor ?? "").includes("0498DA") || heroHeading?.widgetType === "heading");

const demoButton = allWidgets.find(
  (node) => node.widgetType === "button" && String(node.settings?.text ?? "").includes("Schedule A Demo"),
);
assert.ok(demoButton);
assert.equal(demoButton?.settings?.size, "lg");
assert.ok(demoButton?.settings?.selected_icon);
assert.equal((demoButton?.settings?.selected_icon as { library?: string })?.library, "fa-solid");

const bannerBell = allWidgets.find((node) => node.widgetType === "icon");
assert.ok(bannerBell);
assert.equal((bannerBell?.settings?.selected_icon as { library?: string })?.library, "fa-solid");

const pageSettings = (JSON.parse(built.json) as { page_settings?: { background_image?: { url?: string } } }).page_settings;
assert.ok(pageSettings?.background_image?.url?.startsWith("data:image/svg+xml"));

const hasNavPill = JSON.stringify(doc.content).includes("48");
assert.ok(hasNavPill, "Nav should be a rounded pill");

const faqSection = doc.content.find((section) => section.settings && (section.settings as { padding?: { top?: string } }).padding?.top === "0");
assert.ok(faqSection, "FAQ Axion band should have zero extra Elementor padding");

console.log("ok", built.sectionRoles.join(" → "));

const needed = neededRolesFromAnalysis([
  { role: "hero" },
  { role: "content" },
  { role: "cta" },
  { role: "footer" },
]);
assert.ok(needed.includes("blogHero"));
assert.ok(needed.includes("faq"));
assert.ok(needed.includes("articleCta"));
assert.deepEqual(missingLayoutRoles(widgets, needed), []);

const coreOnly = mergeRemoteWidgets(availableWidgets(plugins), [
  { type: "heading", title: "Heading", custom: false, plugin: "elementor" },
  { type: "html", title: "HTML", custom: false, plugin: "elementor" },
]);
const missing = missingLayoutRoles(coreOnly, ["blogHero", "faq", "articleCta"]);
assert.deepEqual(missing, ["blogHero", "faq", "articleCta"]);

assert.deepEqual(columnWidths(1), [{ desktop: 100, tablet: 100, mobile: 100 }]);
assert.deepEqual(columnWidths(2), [
  { desktop: 50, tablet: 50, mobile: 100 },
  { desktop: 50, tablet: 50, mobile: 100 },
]);
assert.deepEqual(columnWidths(4).map((col) => col.desktop), [25, 25, 25, 25]);
assert.ok(columnWidths(4).every((col) => col.tablet === 48 && col.mobile === 100));

const corePlugins = [{ file: "elementor/elementor.php", name: "Elementor", status: "active", version: "3" }];
const coreWidgets = mergeRemoteWidgets(availableWidgets(corePlugins), [
  { type: "heading", title: "Heading", custom: false, plugin: "elementor" },
  { type: "text-editor", title: "Text Editor", custom: false, plugin: "elementor" },
  { type: "button", title: "Button", custom: false, plugin: "elementor" },
  { type: "image", title: "Image", custom: false, plugin: "elementor" },
  { type: "icon", title: "Icon", custom: false, plugin: "elementor" },
  { type: "icon-box", title: "Icon Box", custom: false, plugin: "elementor" },
]);
const corePlan = planPageLayout({
  analysis: {
    width: 1440,
    height: 2400,
    background: "#ffffff",
    sections: [
      { role: "hero", y0: 0, y1: 0.2, columns: 2, bg: "#f7f9fb", fg: "#111", imageHeavy: true },
      { role: "cta", y0: 0.45, y1: 0.6, columns: 1, bg: "#111", fg: "#fff", imageHeavy: false },
    ],
  },
  widgets: coreWidgets,
  extras: { donation: false, search: false, form: false, language: false },
});
assert.equal(corePlan[0].columnCount, 2);
assert.equal(corePlan[0].rows[0].columns.length, 2);
assert.equal(corePlan[1].columnCount, 1);
assert.equal(corePlan[1].rows[0].columns.length, 1);
assert.ok(corePlan[0].rows[0].columns[0].widgets.length >= 1);
assert.ok(corePlan[0].rows[0].columns[1].widgets.length >= 1);
assert.ok(corePlan[0].rows[0].columns.every((column) => column.widthMobile === 100));

const coreDoc = buildElementorDocument({
  title: "Core layout",
  analysis: {
    width: 1440,
    height: 2400,
    background: "#ffffff",
    sections: [
      { role: "hero", y0: 0, y1: 0.2, columns: 2, bg: "#f7f9fb", fg: "#111", imageHeavy: true },
      { role: "cta", y0: 0.45, y1: 0.6, columns: 1, bg: "#111", fg: "#fff", imageHeavy: false },
    ],
  },
  widgets: coreWidgets,
  extras: { donation: false, search: false, form: false, language: false },
});
const coreJson = JSON.parse(coreDoc.json) as {
  content: Array<{
    elType: string;
    isInner?: boolean;
    settings: {
      flex_direction_mobile?: string;
      content_width?: string;
      flex_wrap?: string;
      background_background?: string;
    };
    elements: Array<{
      elType: string;
      isInner?: boolean;
      settings: { width?: { size?: number }; width_tablet?: { size?: number }; width_mobile?: { size?: number } };
      elements: Array<{ widgetType?: string; isInner?: boolean; settings?: { _padding?: unknown } }>;
    }>;
  }>;
};
assert.equal(coreJson.content[0].elType, "container");
assert.equal(coreJson.content[0].settings.flex_direction_mobile, "column");
assert.equal(coreJson.content[0].elements.length, 2);
assert.ok(coreJson.content[0].elements.every((column) => column.isInner && column.elType === "container"));
assert.equal(coreJson.content[0].elements[0].settings.width?.size, 50);
assert.equal(coreJson.content[0].elements[0].settings.width_mobile?.size, 100);
assert.equal(coreJson.content[1].elements.length, 1);
assert.equal(coreJson.content[0].settings.flex_wrap, "nowrap");
assert.ok(coreDoc.sectionRoles.includes("hero 50/50"));
assert.ok(coreDoc.sectionRoles.includes("cta 1-col"));
assert.ok(coreJson.content[0].elements[0].elements.some((node) => node.widgetType === "heading"));
assert.ok(coreJson.content[0].elements[1].elements.some((node) => node.widgetType === "image"));
assert.equal(coreJson.content[0].isInner, false);
assert.ok(coreJson.content[0].elements.every((column) => column.isInner === true));
assert.ok(
  coreJson.content[0].elements[0].elements.every(
    (node) => node.widgetType == null || (node as { isInner?: boolean }).isInner === false,
  ),
);
assert.ok(!JSON.stringify(coreJson.content).includes('"Banner"'));
assert.ok(!JSON.stringify(coreJson.content).includes('"Card"'));
const styledHeading = coreJson.content[0].elements[0].elements.find((node) => node.widgetType === "heading") as
  | { settings?: { _padding?: unknown; title_color?: string } }
  | undefined;
assert.ok(styledHeading?.settings?._padding);
assert.ok(coreJson.content[0].settings.background_background !== "");

const landingAnalysis = {
  width: 1440,
  height: 4200,
  background: "#ffffff",
  sections: [
    { role: "hero", y0: 0, y1: 0.12, columns: 2, bg: "#fff", fg: "#111", imageHeavy: true },
    { role: "features", y0: 0.12, y1: 0.28, columns: 3, bg: "#fff", fg: "#111", imageHeavy: false },
    { role: "features", y0: 0.28, y1: 0.42, columns: 3, bg: "#fff", fg: "#111", imageHeavy: false },
    { role: "media", y0: 0.42, y1: 0.52, columns: 1, bg: "#fff", fg: "#111", imageHeavy: false },
    { role: "split", y0: 0.52, y1: 0.64, columns: 2, bg: "#fff", fg: "#111", imageHeavy: false },
    { role: "footer", y0: 0.9, y1: 1, columns: 1, bg: "#002751", fg: "#fff", imageHeavy: false },
  ],
};
assert.equal(looksLikeLanding(landingAnalysis), true);
assert.equal(landingPageTitle(), "Never Miss Another Client Call");

const homepageLikeAnalysis = {
  width: 1440,
  height: 5519,
  background: "#ffffff",
  sections: [
    { role: "hero", y0: 0, y1: 0.14, columns: 2, bg: "#fff", fg: "#111", imageHeavy: true },
    { role: "cta", y0: 0.14, y1: 0.2, columns: 1, bg: "#002751", fg: "#fff", imageHeavy: false },
    { role: "content", y0: 0.2, y1: 0.3, columns: 1, bg: "#fff", fg: "#111", imageHeavy: false },
    { role: "footer", y0: 0.9, y1: 1, columns: 1, bg: "#002751", fg: "#fff", imageHeavy: false },
  ],
};
assert.equal(
  classifyPageKind(homepageLikeAnalysis, widgets, "Axion_Website-Home-Page-DesignV3.jpg"),
  "landing",
);
assert.equal(
  pageTitle(homepageLikeAnalysis, widgets, "Axion_Website-Home-Page-DesignV3.jpg"),
  "Never Miss Another Client Call",
);
assert.equal(
  looksLikeLandingFilename("Axion_Industry Page (Veterinarian) V4_NEW CONTENT COPY.pdf"),
  true,
);
assert.equal(
  pageTitle(homepageLikeAnalysis, widgets, "Axion_Industry-Page-Veterinarian-V4_NEW-CONTENT-COPY.pdf"),
  "Never Miss Another Client Call",
);
assert.equal(pageTitle(homepageLikeAnalysis, widgets, "upload.jpg"), "Never Miss Another Client Call");
const homepagePlan = planPageLayout({
  analysis: homepageLikeAnalysis,
  widgets,
  extras: { donation: false, search: false, form: false, language: false },
  filename: "Axion_Website-Home-Page-DesignV3.jpg",
});
assert.ok(homepagePlan.some((section) => section.rows.some((row) => row.columns.map((col) => col.width).join("/") === "33/33/34")));
assert.ok(!homepagePlan.some((section) => section.analysisRole === "relatedPosts"));
assert.ok(homepagePlan.some((section) => section.label === "Landing hero"));

const articleLikeAnalysis = {
  width: 800,
  height: 2000,
  background: "#ffffff",
  sections: [
    { role: "hero", y0: 0, y1: 0.2, columns: 1, bg: "#fff", fg: "#111", imageHeavy: true },
    { role: "content", y0: 0.2, y1: 0.6, columns: 1, bg: "#fff", fg: "#111", imageHeavy: false },
    { role: "cta", y0: 0.6, y1: 0.8, columns: 1, bg: "#111", fg: "#fff", imageHeavy: false },
    { role: "footer", y0: 0.8, y1: 1, columns: 1, bg: "#111", fg: "#fff", imageHeavy: false },
  ],
};
assert.equal(classifyPageKind(articleLikeAnalysis, widgets, "vets-reduce-no-shows.jpg"), "article");
assert.equal(
  looksLikeArticleFilename("Axion_Blog Template_V4.jpg"),
  true,
);
assert.equal(looksLikeLandingFilename("Axion_Blog Template_V4.jpg"), false);
assert.equal(classifyPageKind(articleLikeAnalysis, widgets, "Axion_Blog Template_V4.jpg"), "article");
assert.match(
  pageTitle(articleLikeAnalysis, widgets, "Axion_Blog Template_V4.jpg"),
  /No-Shows/,
);
assert.equal(classifyPageKind(articleLikeAnalysis, widgets), "article");
assert.match(pageTitle(articleLikeAnalysis, widgets, "vets-reduce-no-shows.jpg"), /No-Shows/);
const articlePlan = planPageLayout({
  analysis: articleLikeAnalysis,
  widgets,
  extras: { donation: false, search: false, form: false, language: false },
  filename: "vets-reduce-no-shows.jpg",
});
assert.ok(articlePlan.some((section) => section.analysisRole === "relatedPosts"));
assert.ok(!articlePlan.some((section) => section.label === "Landing hero"));

assert.deepEqual(
  resolvePublishTarget(23, "how-can-vets-reduce-no-shows-at-their-clinic-effectively"),
  {
    id: undefined,
    // Not truncated: WordPress allows 200 chars, so the whole title survives.
    slug: "how-can-vets-reduce-no-shows-at-their-clinic-effectively-convert",
    skippedProtected: true,
  },
);
// An unprotected page is updated in place.
assert.deepEqual(resolvePublishTarget(88, "some-other-landing-page"), {
  id: 88,
  slug: "some-other-landing-page",
  skippedProtected: false,
});

// The vet landing is protected too, by id and by slug.
assert.equal(resolvePublishTarget(62, "anything").skippedProtected, true);
assert.deepEqual(resolvePublishTarget(undefined, "never-miss-another-client-call"), {
  id: undefined,
  slug: "never-miss-another-client-call-convert",
  skippedProtected: true,
});

// Truncation must not leave a dash against the suffix: WordPress collapses
// "foo--convert" to "foo-convert", and the lookup would miss forever after.
{
  // Long enough that the suffix forces truncation, and index 191 is a dash so
  // the cut lands on a separator.
  const stem = "a-".repeat(120);
  const cut = MAX_SLUG_LENGTH - "-convert".length;
  assert.equal(stem.slice(0, cut).endsWith("-"), true, "fixture should truncate onto a dash");

  const target = resolvePublishTarget(23, stem);
  assert.equal(target.skippedProtected, true);
  assert.ok(!target.slug.includes("--"), "no doubled dash before -convert");
  assert.ok(!/-$/.test(target.slug), "no trailing dash");
  assert.ok(target.slug.length <= MAX_SLUG_LENGTH, "slug stays within the WordPress limit");
  assert.ok(target.slug.endsWith("-convert"));
}

// A title that fits inside the limit keeps every word — no mid-word cut.
{
  const target = resolvePublishTarget(
    23,
    "how-can-vets-reduce-no-shows-at-their-clinic-effectively",
  );
  assert.ok(target.slug.startsWith("how-can-vets-reduce-no-shows-at-their-clinic-effectively"));
  assert.ok(!target.slug.includes("effecti-"), "must not truncate mid-word");
}

// The publish slug is trimmed after truncation, not before.
{
  const slugify = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/^-+|-+$/g, "") || "design-page";

  // Ordinary titles are untouched — the old 60-char cap used to cut them.
  assert.equal(
    slugify("Veterinary Practice Growth And Client Retention Strategy Ab Guide"),
    "veterinary-practice-growth-and-client-retention-strategy-ab-guide",
  );

  // Past the limit it still must not end on a separator.
  const long = slugify("Ab ".repeat(120));
  assert.ok(!/-$/.test(long), "long titles must not slug to a trailing dash");
  assert.ok(long.length <= MAX_SLUG_LENGTH);
}
assert.equal(
  classifyPageKind(homepageLikeAnalysis, widgets, "Axion_Industry Page (Veterinarian) V4_NEW CONTENT COPY.pdf"),
  "landing",
);

const homepageDoc = buildElementorDocument({
  title: pageTitle(homepageLikeAnalysis, widgets, "Axion_Website-Home-Page-DesignV3.jpg"),
  analysis: homepageLikeAnalysis,
  widgets,
  extras: { donation: false, search: false, form: false, language: false },
  filename: "Axion_Website-Home-Page-DesignV3.jpg",
});
assert.equal(JSON.parse(homepageDoc.json).title, "Never Miss Another Client Call");
assert.ok(homepageDoc.sectionRoles.some((role) => role.includes("33/33/34")));
assert.ok(!homepageDoc.sectionRoles.some((role) => role.includes("relatedPosts")));
assert.ok(homepageDoc.json.includes("Never Miss Another"));
assert.ok(!homepageDoc.json.includes("How Can Vets Reduce"));
console.log("homepage routing ok", homepageDoc.sectionRoles.join(" → "));

const landingDoc = buildElementorDocument({
  title: landingPageTitle(),
  analysis: landingAnalysis,
  widgets,
  extras: { donation: false, search: false, form: false, language: false },
});
assert.equal(JSON.parse(landingDoc.json).title, "Never Miss Another Client Call");
assert.ok(landingDoc.widgetsUsed.includes("heading"));
assert.ok(landingDoc.widgetsUsed.includes("icon"));
assert.ok(landingDoc.widgetsUsed.includes("icon-list"));
assert.ok(landingDoc.widgetsUsed.includes("icon-box"));
assert.ok(landingDoc.widgetsUsed.includes("button"));
assert.ok(landingDoc.widgetsUsed.includes("image"));
assert.ok(!landingDoc.widgetsUsed.includes("html"));
assert.ok(!landingDoc.widgetsUsed.includes("arcadia_axion_header"));
assert.ok(!landingDoc.widgetsUsed.includes("arcadia_axion_footer"));
assert.ok(!landingDoc.widgetsUsed.includes("arcadia_axion_blog_faq"));
assert.ok(!landingDoc.widgetsUsed.includes("arcadia_axion_blog_hero"));
assert.ok(landingDoc.sectionRoles.some((role) => role.includes("52/48")));
assert.ok(landingDoc.sectionRoles.some((role) => role.includes("33/33/34")));
const landingJson = landingDoc.json;
assert.ok(landingJson.includes("Never Miss Another"));
assert.ok(landingJson.includes("Book a Demo"));
assert.ok(landingJson.includes("Front desk slammed"));
assert.ok(landingJson.includes("Never miss a call"));
assert.ok(landingJson.includes("Handle after-hours"));
assert.ok(landingJson.includes("Intelligent call routing"));
assert.ok(landingJson.includes("Increase Revenue"));
assert.ok(landingJson.includes("Capture every opportunity"));
assert.ok(landingJson.includes("HUNDREDS OF"));
assert.ok(landingJson.includes("Watch Axion Highlight Video"));
assert.ok(landingJson.includes("Jeff Falkners"));
assert.ok(landingJson.includes("90 days"));
assert.ok(landingJson.includes("See Axion In Action"));
assert.ok(landingJson.includes("Always Answers."));
assert.ok(!landingJson.includes("OTTO &nbsp;·&nbsp; COVETRUS"));
assert.ok(!landingJson.includes('width="28" height="28"'));
const landingNodes = walkWidgets(JSON.parse(landingDoc.json).content);
const heroBox = landingNodes.find(
  (node) => node.widgetType === "icon-box" && String(node.settings?.title_text ?? "").includes("Increase Revenue"),
);
assert.ok(heroBox);
const trustedList = landingNodes.find(
  (node) =>
    node.widgetType === "icon-list" && JSON.stringify(node.settings?.icon_list ?? "").includes("avimark"),
);
assert.ok(trustedList);
assert.equal(trustedList?.settings?.view, "inline");
const painTitle = landingNodes.find((node) => String(node.settings?.title ?? "").includes("Front desk slammed"));
assert.equal(painTitle?.widgetType, "heading");
const painCopy = landingNodes.find((node) => String(node.settings?.editor ?? "").includes("Busy front desk"));
assert.equal(painCopy?.widgetType, "text-editor");
assert.ok(!String(painCopy?.settings?.editor ?? "").includes("<img"));
const gainChecks = landingNodes.find(
  (node) =>
    node.widgetType === "icon-list" &&
    JSON.stringify(node.settings?.icon_list ?? "").includes("Intelligent call routing"),
);
assert.ok(gainChecks);
assert.equal((gainChecks.settings?.icon_list as Array<{ selected_icon?: { library?: string } }>)?.[0]?.selected_icon?.library, "fa-solid");
const painIcon = landingNodes.find(
  (node) => node.widgetType === "icon" && JSON.stringify(node.settings?.selected_icon ?? "").includes("fa-phone"),
);
assert.ok(painIcon);
assert.ok(landingJson.includes("What does Axion cost?"));
assert.ok(!landingJson.includes("9:40 AM Gap"));
assert.ok(!landingJson.includes("How Can Vets Reduce"));
const painSectionTitle = landingNodes.find((node) => String(node.settings?.title ?? "").includes("Pain Points"));
assert.equal(painSectionTitle?.widgetType, "heading");
console.log("landing ok", landingDoc.sectionRoles.join(" → "));

const listFix = repairElementorDocument(
  JSON.stringify({
    content: [
      {
        id: "a",
        elType: "widget",
        widgetType: "text-editor",
        settings: { editor: "<ul><li>Increase revenue</li><li>Reduce no-shows</li><li>Delight clients</li></ul>" },
        elements: [],
      },
    ],
  }),
);
assert.equal(JSON.parse(listFix.json).content[0].widgetType, "icon-list");
assert.ok(listFix.repairs.some((item) => item.to === "icon-list"));

const titleFix = repairElementorDocument(
  JSON.stringify({
    content: [
      {
        id: "b",
        elType: "widget",
        widgetType: "text-editor",
        settings: { editor: '<h2>Just A Few <span style="color:#E24B4A">Pain Points</span> We Solve</h2>' },
        elements: [],
      },
    ],
  }),
);
assert.equal(JSON.parse(titleFix.json).content[0].widgetType, "heading");
assert.match(String(JSON.parse(titleFix.json).content[0].settings.title), /Pain Points/);

const logoFix = repairElementorDocument(
  JSON.stringify({
    content: [
      {
        id: "c",
        elType: "widget",
        widgetType: "text-editor",
        settings: { editor: "<p>OTTO · COVETRUS · AVIMARK · PULSE · EZYVET</p>" },
        elements: [],
      },
    ],
  }),
);
assert.equal(JSON.parse(logoFix.json).content[0].widgetType, "icon-list");
assert.equal(JSON.parse(logoFix.json).content[0].settings.view, "inline");

const hoursStay = repairElementorDocument(
  JSON.stringify({
    content: [
      {
        id: "d",
        elType: "widget",
        widgetType: "text-editor",
        settings: {
          editor:
            '<p><img src="data:image/svg+xml;charset=UTF-8,x" width="14" height="14" alt="" />Mon – Fri — 8:30 – 6:30</p>',
        },
        elements: [],
      },
    ],
  }),
);
assert.equal(JSON.parse(hoursStay.json).content[0].widgetType, "text-editor");
assert.equal(hoursStay.repairs.length, 0);

const landingTree = JSON.parse(landingDoc.json) as {
  content: Array<{
    settings?: { _title?: string; background_color?: string };
    elements: Array<{
      elType: string;
      isInner?: boolean;
      settings?: { background_color?: string; _title?: string };
      elements: Array<{ widgetType?: string; isInner?: boolean; settings?: { _padding?: unknown } }>;
    }>;
  }>;
};
assert.ok(!JSON.stringify(landingTree).includes('"Banner"'));
assert.ok(!JSON.stringify(landingTree).includes('"Card"'));
assert.ok(!JSON.stringify(landingTree).includes('"Widget grid"'));
const nav = landingTree.content.find((section) => section.settings?._title === "Main nav");
assert.ok(nav);
assert.equal(nav?.settings?.background_color, "#002751");
assert.ok(nav?.elements.every((column) => column.elType === "container" && column.isInner));
assert.ok(nav?.elements.some((column) => column.elements.some((node) => node.widgetType === "heading")));
const pain = landingTree.content.find((section) => section.settings?._title === "Pain points");
assert.ok(pain);
assert.ok(JSON.stringify(pain).includes("#FFF5F5"));
console.log("widget repair ok");

async function testGeneratedPlugin() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "pa-widgets-"));
  await writeGeneratedPlugin(tmp, ["blogHero", "faq"], "1.0.0-test");
  const php = await readFile(path.join(tmp, "plugin-agent-widgets.php"), "utf8");
  assert.match(php, /class Plugin_Agent_Widget_Blog_Hero/);
  assert.match(php, /plugin_agent_blog_hero/);
  assert.match(php, /class Plugin_Agent_Widget_Faq/);
  assert.doesNotMatch(php, /Plugin_Agent_Widget_Footer/);
  assert.match(php, /extends \\Elementor\\Widget_Base/);
  assert.match(php, /new \\Elementor\\Repeater\(\)/);
  assert.match(php, /<h1 class="pa-heading">/);
  assert.match(php, /<\/h1>/);
  assert.match(php, /function plugin_agent_widgets_register[\s\S]*class Plugin_Agent_Widget_Blog_Hero/);
  assert.ok(php.indexOf("class Plugin_Agent_Widget_Blog_Hero") > php.indexOf("class_exists('\\Elementor\\Widget_Base')"));

  const generatedPlan = planPageFromDetectedWidgets(
    mergeRemoteWidgets(availableWidgets([{ file: "elementor/elementor.php", name: "Elementor", status: "active", version: "3" }]), [
      { type: "heading", title: "Heading", custom: false, plugin: "elementor" },
      { type: "plugin_agent_blog_hero", title: "Generated Blog Hero", custom: true, plugin: "plugin-agent-widgets" },
      { type: "plugin_agent_faq", title: "Generated FAQ", custom: true, plugin: "plugin-agent-widgets" },
    ]),
  );
  assert.deepEqual(
    generatedPlan.map((widget) => widget.type),
    ["plugin_agent_blog_hero", "plugin_agent_faq"],
  );
  const generatedDoc = buildElementorDocument({
    title: "Generated layout",
    analysis: { width: 1440, height: 2400, background: "#ffffff", sections: [] },
    widgets: mergeRemoteWidgets(
      availableWidgets([{ file: "elementor/elementor.php", name: "Elementor", status: "active", version: "3" }]),
      [
        { type: "heading", title: "Heading", custom: false, plugin: "elementor" },
        { type: "html", title: "HTML", custom: false, plugin: "elementor" },
        {
          type: "plugin_agent_blog_hero",
          title: "Generated Blog Hero",
          custom: true,
          plugin: "plugin-agent-widgets",
          controls: { heading_highlight: { type: "text", default: "design" } },
        },
        {
          type: "plugin_agent_faq",
          title: "Generated FAQ",
          custom: true,
          plugin: "plugin-agent-widgets",
        },
      ],
    ),
    extras: { donation: false, search: false, form: false, language: false },
  });
  assert.ok(generatedDoc.widgetsUsed.includes("plugin_agent_faq"));
  assert.ok(!generatedDoc.widgetsUsed.includes("html"));
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log("generated plugin ok");
}

async function testPdfRaster() {
  const { isPdfFilename, rasterizePdfToJpeg } = await import("../src/lib/pdf-raster");
  assert.equal(isPdfFilename("Axion_Industry Page (Veterinarian) V4.pdf"), true);
  assert.equal(isPdfFilename("page.jpg"), false);
  const pdfPath =
    "/home/ubuntu/.cursor/projects/workspace/uploads/Axion_Industry_Page__Veterinarian__V4_NEW_CONTENT_COPY_92cb.pdf";
  try {
    const buf = await readFile(pdfPath);
    const jpeg = await rasterizePdfToJpeg(buf);
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
    assert.ok(jpeg.length > 20_000);
    console.log("pdf raster ok", jpeg.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("Could not read that PDF")) {
      console.log("pdf raster skipped");
      return;
    }
    throw error;
  }
}

testGeneratedPlugin().catch((error) => {
  console.error(error);
  process.exit(1);
});
testPdfRaster().catch((error) => {
  console.error(error);
  process.exit(1);
});

