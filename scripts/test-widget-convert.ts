import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildElementorDocument } from "../src/lib/elementor-builder";
import { writeGeneratedPlugin } from "../src/lib/generate-widgets";
import {
  columnWidths,
  planPageLayout,
} from "../src/lib/layout-plan";
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
assert.ok(!built.widgetsUsed.includes("heading"), `Core heading leaked: ${built.widgetsUsed.join(", ")}`);
assert.ok(!built.widgetsUsed.includes("text-editor"), `Core text leaked: ${built.widgetsUsed.join(", ")}`);
assert.ok(built.widgetsUsed.includes("arcadia_axion_blog_hero"));
assert.ok(built.widgetsUsed.includes("arcadia_axion_blog_faq"));
assert.equal(built.widgetsUsed.length, 6);

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
    elements: Array<{
      elType?: string;
      isInner?: boolean;
      settings?: { width?: { size?: number }; width_mobile?: { size?: number } };
      elements: Array<{ widgetType?: string; settings?: Record<string, unknown> }>;
    }>;
  }>;
};
assert.equal(doc.title, "Vets Reduce No-Shows");
assert.ok(doc.content.every((section) => section.elType === "container"));
assert.ok(doc.content.every((section) => section.isInner === false));
assert.ok(doc.content.every((section) => section.settings?.content_width === "full"));
assert.ok(doc.content.every((section) => section.settings?.flex_direction_mobile === "column"));
assert.ok(doc.content.every((section) => section.settings?.padding?.top === "0"));
const types = doc.content.flatMap((section) =>
  section.elements.flatMap((column) => column.elements.map((node) => node.widgetType)),
);
assert.ok(doc.content.every((section) => section.elements.every((column) => column.elType === "container" && column.isInner)));
assert.ok(types.every((type) => type && type.startsWith("arcadia_axion_")));
assert.ok(!types.includes("arcadia_axion_author_post_meta"));
assert.ok(!types.includes("arcadia_axion_header"));
assert.ok(!types.includes("arcadia_axion_footer"));

const hero = doc.content
  .flatMap((section) => section.elements.flatMap((column) => column.elements))
  .find((node) => node.widgetType === "arcadia_axion_blog_hero");
assert.ok(hero);
assert.equal(hero.settings?.heading_highlight, "Reduce");
assert.equal(hero.settings?.image && typeof hero.settings.image === "object" && "url" in hero.settings.image
  ? (hero.settings.image as { url: string }).url.includes("unsplash")
  : false, true);

console.log("ok", types.join(" → "));

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
assert.ok(columnWidths(4).every((col) => col.tablet === 50 && col.mobile === 100));

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
      { role: "features", y0: 0.2, y1: 0.45, columns: 4, bg: "#fff", fg: "#111", imageHeavy: false },
      { role: "cta", y0: 0.45, y1: 0.6, columns: 1, bg: "#111", fg: "#fff", imageHeavy: false },
    ],
  },
  widgets: coreWidgets,
  extras: { donation: false, search: false, form: false, language: false },
});
assert.equal(corePlan[0].columnCount, 2);
assert.equal(corePlan[0].columns.length, 2);
assert.equal(corePlan[1].columnCount, 4);
assert.equal(corePlan[1].columns.length, 4);
assert.equal(corePlan[2].columnCount, 1);
assert.ok(corePlan[0].columns[0].widgets.length >= 1);
assert.ok(corePlan[0].columns[1].widgets.length >= 1);
assert.ok(corePlan[0].columns.every((column) => column.widthMobile === 100));

const coreDoc = buildElementorDocument({
  title: "Core layout",
  analysis: {
    width: 1440,
    height: 2400,
    background: "#ffffff",
    sections: [
      { role: "hero", y0: 0, y1: 0.2, columns: 2, bg: "#f7f9fb", fg: "#111", imageHeavy: true },
      { role: "features", y0: 0.2, y1: 0.45, columns: 4, bg: "#fff", fg: "#111", imageHeavy: false },
    ],
  },
  widgets: coreWidgets,
  extras: { donation: false, search: false, form: false, language: false },
});
const coreJson = JSON.parse(coreDoc.json) as {
  content: Array<{
    elType: string;
    settings: { flex_direction_mobile?: string; content_width?: string };
    elements: Array<{
      elType: string;
      isInner?: boolean;
      settings: { width?: { size?: number }; width_tablet?: { size?: number }; width_mobile?: { size?: number } };
      elements: Array<{ widgetType?: string }>;
    }>;
  }>;
};
assert.equal(coreJson.content[0].elType, "container");
assert.equal(coreJson.content[0].settings.flex_direction_mobile, "column");
assert.equal(coreJson.content[0].elements.length, 2);
assert.ok(coreJson.content[0].elements.every((column) => column.isInner && column.elType === "container"));
assert.equal(coreJson.content[0].elements[0].settings.width?.size, 50);
assert.equal(coreJson.content[0].elements[0].settings.width_mobile?.size, 100);
assert.equal(coreJson.content[1].elements.length, 4);
assert.equal(coreJson.content[1].elements[0].settings.width?.size, 25);
assert.equal(coreJson.content[1].elements[0].settings.width_tablet?.size, 50);
assert.equal(coreJson.content[1].elements[0].settings.width_mobile?.size, 100);
assert.ok(coreDoc.sectionRoles.includes("hero 2-col"));
assert.ok(coreDoc.sectionRoles.includes("features 4-col"));
assert.ok(coreJson.content[0].elements[0].elements.some((node) => node.widgetType === "heading"));
assert.ok(coreJson.content[0].elements[1].elements.some((node) => node.widgetType === "image"));

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
  assert.ok(generatedDoc.widgetsUsed.includes("plugin_agent_blog_hero"));
  assert.ok(generatedDoc.widgetsUsed.includes("plugin_agent_faq"));
  assert.ok(!generatedDoc.widgetsUsed.includes("html"));
  console.log("generated plugin ok");
}

testGeneratedPlugin().catch((error) => {
  console.error(error);
  process.exit(1);
});

