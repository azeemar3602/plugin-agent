import type { PdfStructure, StructureBlock, StructureImage } from "./pdf-structure";

/**
 * Build table-based HTML for an email newsletter from an extracted design.
 *
 * Email clients have no flexbox, no grid and no external stylesheets, so this
 * emits nested tables with inline styles and explicit pixel widths — the only
 * layout model Outlook, Gmail and Salesforce all render the same way. That
 * fixed-width model is also why an email can reproduce a design far more
 * closely than a flow-based page builder can.
 */

export type EmailImage = { placeholder: string; filename: string; buffer: Buffer };

export type EmailBuild = { html: string; images: EmailImage[]; rows: number };

type Cell = { x0: number; x1: number; items: Item[] };
type Item =
  | { kind: "text"; y0: number; y1: number; x0: number; x1: number; block: StructureBlock }
  | { kind: "image"; y0: number; y1: number; x0: number; x1: number; image: StructureImage };

const CANVAS = 600;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isNearWhite(color?: string | null): boolean {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return true;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return r > 244 && g > 244 && b > 244;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Text must stay readable on its band even when the design's own colour would not. */
function textColor(own: string | null | undefined, background?: string): string {
  const valid = own && /^#[0-9a-f]{6}$/i.test(own) ? own.toLowerCase() : "#000000";
  if (!background) return valid;
  const bgDark = luminance(background) < 0.5;
  const fgDark = luminance(valid) < 0.5;
  if (bgDark && fgDark) return "#ffffff";
  if (!bgDark && !fgDark) return "#111111";
  return valid;
}

/** The widest filled shape covering a band, used as its background colour. */
function bandBackground(structure: PdfStructure, y0: number, y1: number): string | undefined {
  // White cards must stay in the running: skipping them first would let a band
  // sitting on a white panel fall through to the dark page backdrop behind it.
  let best: { area: number; color: string } | undefined;
  for (const shape of structure.shapes) {
    if (!shape.color) continue;
    if (shape.y0 > y0 + 0.004 || shape.y1 < y1 - 0.004) continue;
    if (shape.x1 - shape.x0 < 0.6) continue;
    const area = (shape.x1 - shape.x0) * (shape.y1 - shape.y0);
    if (!best || area < best.area) best = { area, color: shape.color };
  }
  if (!best || isNearWhite(best.color)) return undefined;
  return best.color;
}

/** Split items into horizontal bands, breaking on a real vertical gap. */
function toBands(items: Item[], structure: PdfStructure): Item[][] {
  const sorted = [...items].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const bands: Item[][] = [];
  for (const item of sorted) {
    const band = bands[bands.length - 1];
    if (band) {
      const bottom = Math.max(...band.map((b) => b.y1));
      const overlaps = item.y0 < bottom - 0.002;
      const tight = (item.y0 - bottom) * structure.height < 26;
      const sameBg =
        bandBackground(structure, Math.min(...band.map((b) => b.y0)), bottom) ===
        bandBackground(structure, item.y0, item.y1);
      if ((overlaps || tight) && sameBg) {
        band.push(item);
        continue;
      }
    }
    bands.push([item]);
  }
  return bands;
}

/** Columns of a band, from where its items actually sit. */
function toCells(band: Item[]): Cell[] {
  const cells: Cell[] = [];
  for (const item of [...band].sort((a, b) => a.x0 - b.x0)) {
    const cell = cells.find((c) => item.x0 < c.x1 + 0.03 && item.x1 > c.x0 - 0.03);
    if (cell) {
      cell.x0 = Math.min(cell.x0, item.x0);
      cell.x1 = Math.max(cell.x1, item.x1);
      cell.items.push(item);
    } else {
      cells.push({ x0: item.x0, x1: item.x1, items: [item] });
    }
  }
  for (const cell of cells) cell.items.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return cells;
}

function renderItem(item: Item, background: string | undefined, images: EmailImage[]): string {
  if (item.kind === "image") {
    const filename = `design-image-${String(images.length).padStart(3, "0")}.png`;
    const placeholder = `https://plugin-agent.local/structure/${filename}`;
    images.push({ placeholder, filename, buffer: item.image.buffer });
    const width = Math.round((item.x1 - item.x0) * CANVAS);
    return `<img src="${placeholder}" width="${width}" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:${width}px;height:auto;" />`;
  }

  const block = item.block;
  const size = Math.max(11, Math.round(block.size * 0.78));
  const color = textColor(block.color, background);
  const weight = block.role === "paragraph" ? 400 : 700;
  const lineHeight = block.role === "paragraph" ? 1.5 : 1.2;
  const marginBottom = block.role === "paragraph" ? 12 : 8;
  return (
    `<div style="margin:0 0 ${marginBottom}px 0;font-family:Arial,Helvetica,sans-serif;` +
    `font-size:${size}px;line-height:${lineHeight};font-weight:${weight};color:${color};">` +
    `${esc(block.text)}</div>`
  );
}

export function buildEmailHtml(structure: PdfStructure, title: string): EmailBuild {
  const items: Item[] = [
    ...structure.blocks.map((block) => ({
      kind: "text" as const,
      y0: block.y0,
      y1: block.y1,
      x0: block.x0,
      x1: block.x1,
      block,
    })),
    ...structure.images.map((image) => ({
      kind: "image" as const,
      y0: image.y0,
      y1: image.y1,
      x0: image.x0,
      x1: image.x1,
      image,
    })),
  ];

  const images: EmailImage[] = [];
  const rows: string[] = [];

  for (const band of toBands(items, structure)) {
    const top = Math.min(...band.map((b) => b.y0));
    const bottom = Math.max(...band.map((b) => b.y1));
    const background = bandBackground(structure, top, bottom);
    const cells = toCells(band);

    const widths = cells.map((c) => Math.max(0.06, c.x1 - c.x0));
    const total = widths.reduce((sum, w) => sum + w, 0);

    const tds = cells
      .map((cell, index) => {
        const width = Math.round((widths[index] / total) * CANVAS);
        const body = cell.items.map((item) => renderItem(item, background, images)).join("\n          ");
        return (
          `<td width="${width}" valign="top" style="width:${width}px;padding:0 10px;">\n` +
          `          ${body}\n        </td>`
        );
      })
      .join("\n        ");

    const bg = background ? ` bgcolor="${background}"` : "";
    const bgStyle = background ? `background-color:${background};` : "";
    rows.push(
      `<tr>\n    <td${bg} style="${bgStyle}padding:20px 10px;">\n` +
        `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">\n` +
        `        <tr>\n        ${tds}\n        </tr>\n` +
        `      </table>\n    </td>\n  </tr>`,
    );
  }

  const html =
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml">\n<head>\n` +
    `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
    `<title>${esc(title)}</title>\n` +
    `<!--[if mso]><style type="text/css">table,td{border-collapse:collapse;mso-line-height-rule:exactly;}</style><![endif]-->\n` +
    `</head>\n<body style="margin:0;padding:0;background-color:#f4f4f4;">\n` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">\n` +
    `  <tr>\n    <td align="center" style="padding:0;">\n` +
    `      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${CANVAS}" style="width:${CANVAS}px;max-width:${CANVAS}px;border-collapse:collapse;background-color:#ffffff;">\n` +
    rows.map((row) => `  ${row}`).join("\n") +
    `\n      </table>\n    </td>\n  </tr>\n</table>\n</body>\n</html>\n`;

  return { html, images, rows: rows.length };
}
