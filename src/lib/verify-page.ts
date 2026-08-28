import type { PdfStructure } from "./pdf-structure";

export type BlockCheck = {
  ok: boolean;
  role: string;
  y: number;
  text: string;
};

export type PageVerification = {
  checked: number;
  present: number;
  coverage: number;
  missing: BlockCheck[];
  blocks: BlockCheck[];
};

function normalize(value: string): string {
  return value
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/**
 * Check the published page against the design it was built from, block by
 * block. A block counts as present when most of its distinctive words are on
 * the page — PDF text layers split ligatures and hyphens unpredictably, so an
 * exact match would report false misses.
 */
export function comparePageToStructure(structure: PdfStructure, html: string): PageVerification {
  const pageText = normalize(stripHtml(html));
  const blocks: BlockCheck[] = [];

  for (const block of structure.blocks) {
    const words = normalize(block.text).split(" ").filter((word) => word.length > 2);
    if (!words.length) continue;
    const hits = words.filter((word) => pageText.includes(word)).length;
    blocks.push({
      ok: hits / words.length >= 0.7,
      role: block.role,
      y: block.y0,
      text: block.text,
    });
  }

  const missing = blocks.filter((block) => !block.ok);
  return {
    checked: blocks.length,
    present: blocks.length - missing.length,
    coverage: blocks.length ? ((blocks.length - missing.length) / blocks.length) * 100 : 0,
    missing,
    blocks,
  };
}

export async function verifyPublishedPage(
  structure: PdfStructure,
  url: string,
): Promise<PageVerification | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return comparePageToStructure(structure, await response.text());
  } catch {
    return null;
  }
}

/** One line for the chat, naming what did not make it across. */
export function summarizeVerification(result: PageVerification | null): string {
  if (!result || !result.checked) return "";
  const head = ` Checked the published page against the design: ${result.present}/${result.checked} sections matched (${result.coverage.toFixed(0)}%).`;
  if (!result.missing.length) return `${head} Every section came across.`;
  const names = result.missing
    .slice(0, 3)
    .map((block) => `"${block.text.slice(0, 40)}"`)
    .join(", ");
  const more = result.missing.length > 3 ? ` and ${result.missing.length - 3} more` : "";
  return `${head} Missing: ${names}${more}.`;
}
