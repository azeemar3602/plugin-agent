import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

import type { DesignAnalysis, DesignSection } from "./elementor-builder";

type Raster = { width: number; height: number; data: Buffer | Uint8Array };

function decodeRaster(buffer: Buffer, filename: string): Raster {
  const name = filename.toLowerCase();
  if (name.endsWith(".png")) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return decodeJpeg(buffer, { maxMemoryUsageInMB: 1024, maxResolutionInMP: 200 });
  }
  throw new Error(
    "Drop a JPEG or PNG of the design, or a PDF (Convert PDF in Plugin Agent).",
  );
}

function gray(data: Uint8Array | Buffer, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

function rgbAt(data: Uint8Array | Buffer, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]] as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function resize(src: Raster, targetW: number): Raster {
  const targetH = Math.max(80, Math.round((src.height * targetW) / src.width));
  const data = Buffer.alloc(targetW * targetH * 4);
  for (let y = 0; y < targetH; y += 1) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / targetH));
    for (let x = 0; x < targetW; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / targetW));
      const si = (sy * src.width + sx) * 4;
      const di = (y * targetW + x) * 4;
      data[di] = src.data[si];
      data[di + 1] = src.data[si + 1];
      data[di + 2] = src.data[si + 2];
      data[di + 3] = 255;
    }
  }
  return { width: targetW, height: targetH, data };
}

function smooth(values: number[], win = 7): number[] {
  const half = Math.floor(win / 2);
  return values.map((_, i) => {
    const sl = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1));
    return sl.reduce((a, b) => a + b, 0) / sl.length;
  });
}

function rowStds(img: Raster): number[] {
  const { width, height, data } = img;
  const out: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const vals: number[] = [];
    for (let x = 0; x < width; x += 1) {
      const g = gray(data, width, x, y);
      vals.push(g);
      sum += g;
    }
    const avg = sum / width;
    const v = vals.reduce((acc, n) => acc + (n - avg) ** 2, 0) / width;
    out.push(Math.sqrt(v));
  }
  return out;
}

function findCuts(stds: number[], height: number): number[] {
  const sorted = [...stds].sort((a, b) => a - b);
  const thresh = sorted[Math.max(0, Math.floor(sorted.length * 0.22))] ?? 0;
  const minRun = Math.max(6, Math.floor(height / 80));
  const gaps: number[] = [];
  let run = 0;
  let start = 0;
  for (let i = 0; i < stds.length; i += 1) {
    if (stds[i] <= thresh) {
      if (run === 0) start = i;
      run += 1;
    } else {
      if (run >= minRun) gaps.push(Math.floor((start + i) / 2));
      run = 0;
    }
  }
  if (run >= minRun) gaps.push(Math.floor((start + height) / 2));
  const cuts = [0];
  for (const g of gaps) {
    if (g - cuts[cuts.length - 1] > height * 0.06) cuts.push(g);
  }
  if (height - cuts[cuts.length - 1] > height * 0.05) cuts.push(height);
  else cuts[cuts.length - 1] = height;
  while (cuts.length - 1 > 7) {
    let smallest = 0;
    let size = Infinity;
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const s = cuts[i + 1] - cuts[i];
      if (s < size) {
        size = s;
        smallest = i;
      }
    }
    cuts.splice(smallest === 0 ? 1 : smallest, 1);
  }
  while (cuts.length - 1 < 3) {
    let largest = 0;
    let size = 0;
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const s = cuts[i + 1] - cuts[i];
      if (s > size) {
        size = s;
        largest = i;
      }
    }
    cuts.splice(largest + 1, 0, Math.floor((cuts[largest] + cuts[largest + 1]) / 2));
  }
  return cuts;
}

function dominantColor(img: Raster, x0: number, y0: number, x1: number, y1: number): [number, number, number] {
  const buckets = new Map<string, { n: number; rgb: [number, number, number] }>();
  const stepX = Math.max(1, Math.floor((x1 - x0) / 24));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 24));
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const rgb = rgbAt(img.data, img.width, x, y);
      const key = rgb.map((v) => Math.round(v / 16) * 16).join(",");
      const prev = buckets.get(key);
      if (prev) prev.n += 1;
      else buckets.set(key, { n: 1, rgb });
    }
  }
  let best = { n: 0, rgb: [245, 245, 245] as [number, number, number] };
  for (const item of buckets.values()) {
    if (item.n > best.n) best = item;
  }
  return best.rgb;
}

function columnCount(img: Raster, y0: number, y1: number): number {
  const { width, data } = img;
  const h = y1 - y0;
  const colStd: number[] = [];
  for (let x = 0; x < width; x += 1) {
    const vals: number[] = [];
    let sum = 0;
    for (let y = y0; y < y1; y += 1) {
      const g = gray(data, width, x, y);
      vals.push(g);
      sum += g;
    }
    const avg = sum / h;
    const v = vals.reduce((acc, n) => acc + (n - avg) ** 2, 0) / h;
    colStd.push(Math.sqrt(v));
  }
  const sm = smooth(colStd, Math.max(5, Math.floor(width / 40)));
  const sorted = [...sm].sort((a, b) => a - b);
  const thresh = sorted[Math.max(0, Math.floor(sorted.length * 0.18))] ?? 0;
  const minRun = Math.max(6, Math.floor(width / 40));
  const gutters: number[] = [];
  let run = 0;
  let start = 0;
  for (let i = 0; i < sm.length; i += 1) {
    if (sm[i] <= thresh) {
      if (run === 0) start = i;
      run += 1;
    } else {
      const mid = Math.floor((start + i) / 2);
      if (run >= minRun && mid > width * 0.1 && mid < width * 0.9) gutters.push(mid);
      run = 0;
    }
  }
  const kept: number[] = [];
  for (const g of gutters) {
    if (!kept.length || Math.abs(g - kept[kept.length - 1]) > width * 0.12) kept.push(g);
  }
  if (kept.length >= 3) return 4;
  if (kept.length >= 2) return 3;
  if (kept.length === 1) return 2;
  return 1;
}

function classify(
  index: number,
  total: number,
  imageHeavy: boolean,
  columns: number,
  lum: number,
): string {
  if (index === 0) return "hero";
  if (index === total - 1) return "footer";
  if (imageHeavy && columns === 1) return "media";
  if (columns >= 3) return "features";
  if (columns === 2) return "split";
  if (lum < 0.35) return "cta";
  if (index === total - 2) return "cta";
  return "content";
}

export function analyzeDesignBuffer(buffer: Buffer, filename: string): DesignAnalysis {
  const src = decodeRaster(buffer, filename);
  const work = resize(src, 480);
  const stds = smooth(rowStds(work), 9);
  const cuts = findCuts(stds, work.height);
  const total = cuts.length - 1;
  const sections: DesignSection[] = [];
  for (let i = 0; i < total; i += 1) {
    const y0 = cuts[i];
    const y1 = cuts[i + 1];
    const bg = dominantColor(work, 0, y0, work.width, y1);
    const lum = luminance(bg);
    const columns = columnCount(work, y0, y1);
    const band = stds.slice(y0, y1);
    const bandStd = band.reduce((a, b) => a + b, 0) / Math.max(1, band.length);
    const imageHeavy = bandStd > 28;
    sections.push({
      role: classify(i, total, imageHeavy, columns, lum),
      y0: Number((y0 / work.height).toFixed(4)),
      y1: Number((y1 / work.height).toFixed(4)),
      columns,
      bg: rgbToHex(bg),
      fg: lum < 0.45 ? "#f8f8f8" : "#1a1a1a",
      imageHeavy,
    });
  }
  return {
    width: src.width,
    height: src.height,
    background: rgbToHex(dominantColor(work, 0, 0, work.width, work.height)),
    sections,
  };
}
