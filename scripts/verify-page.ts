/**
 * Compare a published page against the design it was built from, section by
 * section, and report what did not make it across.
 *
 *   npx tsx scripts/verify-page.ts "design.pdf" https://site/page-slug/
 *
 * Exits non-zero when coverage falls below the threshold, so it can gate a run.
 */
import { readFile } from "node:fs/promises";

import { extractPdfStructure, hasUsableTextLayer } from "../src/lib/pdf-structure";
import { comparePageToStructure } from "../src/lib/verify-page";

const MIN_COVERAGE = Number(process.env.VERIFY_MIN_COVERAGE ?? 90);

async function main() {
  const [source, url] = process.argv.slice(2);
  if (!source || !url) {
    console.error('usage: verify-page.ts "design.pdf" https://site/page/');
    process.exit(2);
  }

  const structure = await extractPdfStructure(await readFile(source));
  if (!hasUsableTextLayer(structure)) {
    console.error("No text layer in that design — nothing to compare against.");
    process.exit(2);
  }

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Page returned HTTP ${response.status}`);
    process.exit(1);
  }
  const result = comparePageToStructure(structure, await response.text());
  const rows = result.blocks;
  const missing = result.missing;
  const coverage = result.coverage;

  console.log(`\nDesign blocks: ${rows.length}   images in PDF: ${structure.images.length}`);
  console.log("─".repeat(72));
  for (const row of rows) {
    const mark = row.ok ? "OK  " : "MISS";
    const where = `y=${row.y.toFixed(3)}`;
    console.log(`${mark} ${row.role.padEnd(10)} ${where}  ${JSON.stringify(row.text.slice(0, 58))}`);
  }
  console.log("─".repeat(72));
  console.log(`Coverage: ${coverage.toFixed(1)}%  (${rows.length - missing.length}/${rows.length} blocks)`);

  if (missing.length) {
    console.log(`\nMissing ${missing.length}:`);
    for (const row of missing) console.log(`  - [${row.role}] ${row.text.slice(0, 70)}`);
  }

  if (coverage < MIN_COVERAGE) {
    console.error(`\nBelow the ${MIN_COVERAGE}% threshold.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
