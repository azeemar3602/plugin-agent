import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { appRoot } from "./paths";

const execFile = promisify(execFileCb);

export function isPdfFilename(filename: string): boolean {
  return /\.pdf$/i.test(filename);
}

export async function rasterizePdfToJpeg(buffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pa-pdf-"));
  const pdfPath = path.join(dir, "design.pdf");
  const jpgPath = path.join(dir, "design.jpg");
  await writeFile(pdfPath, buffer);
  const script = path.join(appRoot(), "scripts", "pdf_to_jpeg.py");
  const errors: string[] = [];
  for (const bin of ["python3", "python", "py"]) {
    try {
      const { stderr } = await execFile(bin, [script, pdfPath, jpgPath], {
        timeout: 90000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      const jpeg = await readFile(jpgPath);
      if (jpeg.length < 100) {
        throw new Error(stderr.trim() || "PDF raster was empty.");
      }
      return jpeg;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/ENOENT|not found|Can't find/i.test(message)) continue;
      errors.push(`${bin}: ${message}`);
    }
  }
  throw new Error(
    `Could not read that PDF. ${errors[0] || "Install Python with pillow and pypdfium2 (`pip3 install -r requirements.txt`), or export the first page as a JPEG/PNG."}`,
  );
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
