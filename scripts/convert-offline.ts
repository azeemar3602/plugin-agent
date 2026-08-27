/**
 * Run a design file through the real conversion pipeline without WordPress.
 *   npx tsx scripts/convert-offline.ts "<path to jpg|png|pdf>" [outDir]
 * Mirrors processDesigns() in src/lib/ingest.ts, minus the import/publish step,
 * against the widget catalogue wp.azbuilds.xyz reports.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeDesignFile, buildDesignTemplate } from "../src/lib/design";
import { ensureGeneratedWidgets } from "../src/lib/generate-widgets";
import { isPdfFilename, rasterizePdfToJpeg } from "../src/lib/pdf-raster";
import { classifyPageKind } from "../src/lib/layout-plan";
import {
  availableWidgets,
  mergeRemoteWidgets,
  missingLayoutRoles,
  neededRolesFromAnalysis,
} from "../src/lib/elementor-widgets";
import type { RemoteElementorWidget, RemotePlugin } from "../src/lib/wordpress";

const plugins: RemotePlugin[] = [
  { file: "elementor/elementor.php", name: "Elementor", status: "active", version: "4.2.3" },
  {
    file: "arcadia-elementor-addons/arcadia-elementor-addons.php",
    name: "Axion Dev",
    status: "active",
    version: "1.1.19",
  },
];

const axion = (type: string, title: string): RemoteElementorWidget => ({
  type,
  title,
  custom: true,
  plugin: "arcadia-elementor-addons",
});

const remoteWidgets: RemoteElementorWidget[] = [
  { type: "heading", title: "Heading", custom: false, plugin: "elementor" },
  { type: "text-editor", title: "Text Editor", custom: false, plugin: "elementor" },
  { type: "button", title: "Button", custom: false, plugin: "elementor" },
  { type: "image", title: "Image", custom: false, plugin: "elementor" },
  { type: "icon", title: "Icon", custom: false, plugin: "elementor" },
  { type: "icon-list", title: "Icon List", custom: false, plugin: "elementor" },
  { type: "icon-box", title: "Icon Box", custom: false, plugin: "elementor" },
  { type: "accordion", title: "Accordion", custom: false, plugin: "elementor" },
  { type: "html", title: "HTML", custom: false, plugin: "elementor" },
  axion("arcadia_axion_header", "Axion Header"),
  axion("arcadia_axion_footer", "Axion Footer"),
  axion("arcadia_axion_vet_hero", "Axion Vet Hero"),
  axion("arcadia_axion_faq", "Axion FAQ"),
  {
    ...axion("arcadia_axion_blog_hero", "Axion Blog Hero"),
    controls: {
      heading_before: { type: "text", default: "How Can Vets" },
      heading_highlight: { type: "text", default: "Reduce No-Shows" },
      heading_after: { type: "text", default: "At Their Clinic Effectively?" },
      image: { type: "media", default: { url: "", id: "", size: "" } },
      image_source: { type: "select", options: ["dynamic", "custom"], default: "dynamic" },
      items: { type: "repeater", default: [{}, {}, {}, {}] },
    },
  },
  axion("arcadia_axion_key_takeaways", "Key Takeaways"),
  axion("arcadia_axion_article_cta_banner", "Article CTA Banner"),
  axion("arcadia_axion_blog_faq", "Blog FAQ"),
  axion("arcadia_axion_download_cta", "Download CTA"),
  axion("arcadia_axion_blog_related_posts", "Related Posts"),
  axion("arcadia_author_box", "Author Box"),
  axion("arcadia_axion_author_post_meta", "Author and Post Meta"),
];

type Node = { elType?: string; widgetType?: string; settings?: Record<string, unknown>; elements?: Node[] };

function walk(nodes: Node[], depth = 0): Array<{ node: Node; depth: number }> {
  const out: Array<{ node: Node; depth: number }> = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (Array.isArray(node.elements)) out.push(...walk(node.elements, depth + 1));
  }
  return out;
}

async function main() {
  const source = process.argv[2];
  const outDir = process.argv[3] || "/tmp";
  if (!source) throw new Error("usage: convert-offline.ts <design file> [outDir]");

  const buffer = await readFile(source);
  const filename = path.basename(source);
  const isPdf = isPdfFilename(filename) || buffer.subarray(0, 5).toString("utf8") === "%PDF-";

  console.log(`\n── ${filename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const started = Date.now();
  let raster: Buffer = Buffer.from(buffer);
  if (isPdf) {
    raster = Buffer.from(await rasterizePdfToJpeg(buffer));
    console.log(`   rasterized PDF → JPEG ${(raster.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - started}ms`);
  }

  const rasterName = isPdf ? filename.replace(/\.pdf$/i, ".jpg") : filename;
  const rasterPath = path.join(outDir, rasterName);
  await writeFile(rasterPath, raster);

  const analysis = await analyzeDesignFile(rasterPath, raster);
  console.log(`   analysis: ${analysis.width}×${analysis.height}, ${analysis.sections.length} sections, bg ${analysis.background}`);

  const merged = mergeRemoteWidgets(availableWidgets(plugins), remoteWidgets);
  console.log(`   page kind: ${classifyPageKind(analysis, merged, filename)}`);
  const needed = neededRolesFromAnalysis(analysis.sections);
  console.log(`   roles needed: [${needed.join(", ")}]`);
  console.log(`   missingLayoutRoles: [${missingLayoutRoles(merged, needed).join(", ")}]`);

  const ensured = await ensureGeneratedWidgets({
    site: undefined,
    plugins,
    remoteWidgets,
    analysis,
    filename,
  });
  console.log(`   generated widgets: ${ensured.generated.length ? ensured.generated.join(", ") : "none"}`);

  const built = await buildDesignTemplate({
    filename,
    buffer,
    plugins,
    remoteWidgets,
    analysis,
    generatedRoles: ensured.generated,
  });

  const doc = JSON.parse(built.json) as { title: string; content: Node[] };
  const all = walk(doc.content);
  const widgetNodes = all.filter((entry) => entry.node.widgetType);
  const counts = new Map<string, number>();
  for (const entry of widgetNodes) {
    const type = entry.node.widgetType as string;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const outFile = path.join(outDir, `${path.parse(filename).name}.elementor.json`);
  await writeFile(outFile, built.json, "utf8");

  console.log(`   title: "${doc.title}"`);
  console.log(`   sections: ${doc.content.length}  roles: ${built.sectionRoles.join(" → ")}`);
  console.log(`   widgets (${widgetNodes.length} total):`);
  for (const [type, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(count).padStart(3)} × ${type}`);
  }
  if (built.repairs.length) {
    console.log(`   repairs: ${built.repairs.map((r) => `${r.from}→${r.to} (${r.reason})`).join(", ")}`);
  }
  console.log(`   json: ${outFile} (${(built.json.length / 1024).toFixed(0)} KB)`);
  console.log(`   total: ${Date.now() - started}ms`);
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
