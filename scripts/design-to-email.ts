/**
 * Turn a design PDF into table-based HTML for an email newsletter.
 *
 *   npx tsx scripts/design-to-email.ts "design.pdf" outdir [--inline-images]
 *
 * Writes newsletter.html plus the images lifted out of the design. By default
 * images are referenced as cid: attachments; --inline-images embeds them as
 * data URIs so the file previews on its own (Gmail strips those, so use real
 * hosted URLs for a live send).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildEmailHtml } from "../src/lib/email-html";
import { extractPdfStructure, hasUsableTextLayer } from "../src/lib/pdf-structure";

async function main() {
  const [source, outdir] = process.argv.slice(2);
  const inline = process.argv.includes("--inline-images");
  if (!source || !outdir) {
    console.error('usage: design-to-email.ts "design.pdf" outdir [--inline-images]');
    process.exit(2);
  }

  const structure = await extractPdfStructure(await readFile(source));
  if (!hasUsableTextLayer(structure)) {
    console.error("That PDF has no usable text layer, so there is nothing to lay out.");
    process.exit(2);
  }

  const title = path.basename(source).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
  const build = buildEmailHtml(structure, title);

  await mkdir(outdir, { recursive: true });
  let html = build.html;
  for (const image of build.images) {
    await writeFile(path.join(outdir, image.filename), image.buffer);
    if (inline) {
      html = html
        .split(image.placeholder)
        .join(`data:image/png;base64,${image.buffer.toString("base64")}`);
    }
  }
  const target = path.join(outdir, "newsletter.html");
  await writeFile(target, html, "utf8");

  console.log(`rows: ${build.rows}   images: ${build.images.length}`);
  console.log(`wrote ${target} (${Math.round(html.length / 1024)} KB)`);
  if (!inline) {
    console.log("images referenced as cid: — swap for hosted URLs before sending.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
