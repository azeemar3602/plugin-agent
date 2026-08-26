import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

export type CroppedAsset = {
  key: string;
  filename: string;
  mime: "image/png";
  buffer: Buffer;
  alt: string;
};

function cropPng(
  src: { width: number; height: number; data: Uint8Array | Buffer },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Buffer {
  const left = Math.max(0, Math.round(x0 * src.width));
  const top = Math.max(0, Math.round(y0 * src.height));
  const width = Math.max(1, Math.round((x1 - x0) * src.width));
  const height = Math.max(1, Math.round((y1 - y0) * src.height));
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(src.width - 1, left + x);
      const sy = Math.min(src.height - 1, top + y);
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      png.data[di] = src.data[si];
      png.data[di + 1] = src.data[si + 1];
      png.data[di + 2] = src.data[si + 2];
      png.data[di + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

export function cropLandingImages(buffer: Buffer): CroppedAsset[] {
  const src = decodeJpeg(buffer, { maxMemoryUsageInMB: 1024, maxResolutionInMP: 200 });
  if (src.height < src.width * 2) return [];
  return [
    {
      key: "hero",
      filename: "axion-hero-devices.png",
      mime: "image/png",
      alt: "Axion on a laptop and phone beside a veterinarian with a dog",
      buffer: cropPng(src, 0.5, 0.04, 0.98, 0.128),
    },
    {
      key: "trustLogos",
      filename: "axion-trusted-logos.png",
      mime: "image/png",
      alt: "otto, Covetrus Avimark, Pulse, Ascend, and Impromed",
      buffer: cropPng(src, 0.38, 0.136, 0.97, 0.154),
    },
    {
      key: "dash",
      filename: "axion-dashboard.png",
      mime: "image/png",
      alt: "Axion communications dashboard",
      buffer: cropPng(src, 0.5, 0.888, 0.97, 0.938),
    },
  ];
}
