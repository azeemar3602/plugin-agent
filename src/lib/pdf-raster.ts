import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { appRoot } from "./paths";
import { runPythonScript } from "./python";

export function isPdfFilename(filename: string): boolean {
  return /\.pdf$/i.test(filename);
}

export async function rasterizePdfToJpeg(buffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pa-pdf-"));
  try {
    const pdfPath = path.join(dir, "design.pdf");
    const jpgPath = path.join(dir, "design.jpg");
    await writeFile(pdfPath, buffer);
    const script = path.join(appRoot(), "scripts", "pdf_to_jpeg.py");
    const { stderr } = await runPythonScript([script, pdfPath, jpgPath], { timeout: 90000 });
    const jpeg = await readFile(jpgPath).catch(() => Buffer.alloc(0));
    if (jpeg.length < 100) {
      throw new Error(stderr.trim() || "PDF raster was empty.");
    }
    return jpeg;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message.startsWith("Could not read that PDF")
        ? message
        : `Could not read that PDF. ${message}`,
    );
  } finally {
    // The temp dir holds the full source PDF and its raster — drop it either way.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function prepareDesignRaster(filename: string, buffer: Buffer): Promise<{
  sourceName: string;
  rasterName: string;
  raster: Buffer;
}> {
  const sourceName = filename.replace(/[^\w.-]+/g, "-") || "design";
  if (!isPdfFilename(sourceName)) {
    return { sourceName, rasterName: sourceName, raster: buffer };
  }
  const raster = await rasterizePdfToJpeg(buffer);
  return {
    sourceName,
    rasterName: sourceName.replace(/\.pdf$/i, ".jpg"),
    raster,
  };
}
