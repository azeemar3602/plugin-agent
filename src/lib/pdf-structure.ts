import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appRoot } from "./paths";
import { runPythonScript } from "./python";

export type StructureBox = { x0: number; x1: number; y0: number; y1: number };

export type StructureBlock = StructureBox & {
  text: string;
  size: number;
  color?: string | null;
  role: "heading" | "subheading" | "paragraph";
};

export type StructureImage = StructureBox & { file: string; buffer: Buffer };

export type StructureShape = StructureBox & { color?: string | null };

export type StructureText = StructureBox & {
  text: string;
  size: number;
  font?: string;
  color?: string | null;
};

export type PdfStructure = {
  width: number;
  height: number;
  pages: number;
  /** Raw runs, before line/paragraph merging — exact positions for fidelity work. */
  texts: StructureText[];
  blocks: StructureBlock[];
  images: StructureImage[];
  shapes: StructureShape[];
};

/**
 * A design PDF exported from Figma carries its text, images and fills as real
 * objects. Rasterizing throws that away and leaves the converter guessing from
 * pixels, so read the structure directly when it is there.
 *
 * Returns null when the PDF has no usable text layer (a flat scan, or an image
 * exported to PDF), so callers can fall back to the raster pipeline.
 */
export async function extractPdfStructure(buffer: Buffer): Promise<PdfStructure | null> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pa-struct-"));
  try {
    const pdfPath = path.join(dir, "design.pdf");
    await writeFile(pdfPath, buffer);
    const script = path.join(appRoot(), "scripts", "pdf_extract.py");
    const { stdout } = await runPythonScript([script, pdfPath, dir], { timeout: 120000 });
    if (!stdout.trim()) return null;

    let parsed: Omit<PdfStructure, "images"> & { images: Array<StructureBox & { file: string }> };
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return null;
    }
    if (!parsed?.blocks?.length) return null;

    const present = new Set(await readdir(dir));
    const images: StructureImage[] = [];
    for (const image of parsed.images ?? []) {
      if (!present.has(image.file)) continue;
      images.push({ ...image, buffer: await readFile(path.join(dir, image.file)) });
    }

    return {
      width: parsed.width,
      height: parsed.height,
      pages: parsed.pages,
      texts: parsed.texts ?? [],
      blocks: parsed.blocks ?? [],
      images,
      shapes: parsed.shapes ?? [],
    };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Enough real prose to be worth building from, rather than a title card or a
 * handful of stray glyphs on an otherwise flat export.
 */
export function hasUsableTextLayer(structure: PdfStructure | null): structure is PdfStructure {
  if (!structure) return false;
  const words = structure.blocks.reduce(
    (sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length,
    0,
  );
  return structure.blocks.length >= 6 && words >= 40;
}
