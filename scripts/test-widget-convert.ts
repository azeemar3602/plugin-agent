import assert from "node:assert/strict";

import { buildElementorDocument } from "../src/lib/elementor-builder";
import {
  availableWidgets,
  mergeRemoteWidgets,
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
    "arcadia_axion_header",
    "arcadia_axion_blog_hero",
    "arcadia_axion_author_post_meta",
    "arcadia_axion_key_takeaways",
    "arcadia_axion_article_cta_banner",
    "arcadia_axion_blog_faq",
    "arcadia_axion_download_cta",
    "arcadia_axion_blog_related_posts",
    "arcadia_axion_footer",
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
assert.equal(built.widgetsUsed.length, 9);

const doc = JSON.parse(built.json) as {
  title: string;
  content: Array<{ elements: Array<{ elements: Array<{ widgetType?: string }> }> }>;
};
assert.equal(doc.title, "Vets Reduce No-Shows");
const types = doc.content.flatMap((section) =>
  section.elements.flatMap((column) => column.elements.map((node) => node.widgetType)),
);
assert.ok(types.every((type) => type && type.startsWith("arcadia_axion_")));

console.log("ok", types.join(" → "));
