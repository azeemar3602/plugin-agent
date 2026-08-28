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
  /** Every vector path, so bands holding artwork can be rendered instead of rebuilt. */
  vectors: StructureBox[];
  /** The source PDF, kept so bands can be re-rendered as slices. */
  source: Buffer;
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
      vectors: parsed.vectors ?? [],
      source: buffer,
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

export type SlicedBand = { id: string; buffer: Buffer; height: number };

/**
 * Render horizontal bands of the design as images.
 *
 * Logos, icons, pill buttons and illustrations are vector art. They cannot be
 * rebuilt as HTML and email clients cannot draw them, so the bands holding them
 * are rendered from the PDF instead — which reproduces them exactly.
 */
export async function slicePdfBands(
  source: Buffer,
  ranges: Array<{ id: string; y0: number; y1: number }>,
  width = 600,
): Promise<Map<string, SlicedBand>> {
  const out = new Map<string, SlicedBand>();
  if (!ranges.length) return out;

  const dir = await mkdtemp(path.join(os.tmpdir(), "pa-slice-"));
  try {
    const pdfPath = path.join(dir, "design.pdf");
    const rangesPath = path.join(dir, "ranges.json");
    await writeFile(pdfPath, source);
    await writeFile(rangesPath, JSON.stringify(ranges), "utf8");
    const script = path.join(appRoot(), "scripts", "pdf_slice.py");
    const { stdout } = await runPythonScript(
      [script, pdfPath, dir, String(width), rangesPath],
      { timeout: 180000 },
    );
    const parsed = JSON.parse(stdout) as Record<string, { file: string; height: number }>;
    for (const [id, entry] of Object.entries(parsed)) {
      try {
        out.set(id, {
          id,
          height: entry.height,
          buffer: await readFile(path.join(dir, entry.file)),
        });
      } catch {
        /* a slice that failed to write just falls back to HTML text */
      }
    }
  } catch {
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  return out;
}
