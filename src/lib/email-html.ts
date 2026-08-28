import { slicePdfBands, type PdfStructure, type StructureBlock, type StructureImage } from "./pdf-structure";

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

/**
 * Does this band contain artwork? Vector paths beyond the plain background
 * rectangle mean icons, buttons, rules or illustrations, none of which survive
 * being rebuilt as HTML.
 */
function hasArtwork(structure: PdfStructure, y0: number, y1: number): boolean {
  const overlapping = structure.vectors.filter(
    (vector) => vector.y1 > y0 + 0.001 && vector.y0 < y1 - 0.001,
  );
  const artwork = overlapping.filter((vector) => {
    const wide = vector.x1 - vector.x0 > 0.9;
    const tall = vector.y1 - vector.y0 > (y1 - y0) * 0.9;
    // A full-bleed rectangle is the band's background, not artwork.
    return !(wide && tall);
  });
  return artwork.length > 0;
}

export async function buildEmailHtml(
  structure: PdfStructure,
  title: string,
): Promise<EmailBuild> {
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

  let bands = toBands(items, structure);
  // A band too short to render its own slice must be folded into its neighbour
  // before ranges are cut. Leaving it with a range of its own made the two
  // slices either side both cover that strip, repeating a line at the seam.
  const MIN_BAND = 0.004;
  bands = bands.reduce<Item[][]>((acc, band) => {
    const top = Math.min(...band.map((b) => b.y0));
    const bottom = Math.max(...band.map((b) => b.y1));
    if (acc.length && bottom - top < MIN_BAND) {
      acc[acc.length - 1].push(...band);
      return acc;
    }
    acc.push(band);
    return acc;
  }, []);
  // Pad each band's range slightly so a slice keeps the design's own breathing
  // room instead of cropping tight to the glyphs.
  const extents = bands.map((band) => ({
    top: Math.min(...band.map((b) => b.y0)),
    bottom: Math.max(...band.map((b) => b.y1)),
  }));
  // Fidelity mode renders every band. Mixing rendered artwork with rebuilt text
  // kept duplicating content, because this design stacks decorative headlines on
  // top of one another and they land in two bands at once. Rendering throughout
  // is exact and has no seams; PLUGIN_AGENT_EMAIL_TEXT=1 restores the hybrid.
  const hybrid = process.env.PLUGIN_AGENT_EMAIL_TEXT === "1";
  const isArt = extents.map((extent) =>
    hybrid ? hasArtwork(structure, extent.top, extent.bottom) : true,
  );

  // Tile neighbouring slices edge to edge so nothing falls in the gap between
  // them, but stop at a band's own edge when the neighbour stays as HTML text —
  // otherwise the slice swallows that text and it renders twice.
  const PAD = 0.003;
  const bounds = extents.map((extent, index) => {
    const previous = extents[index - 1];
    const next = extents[index + 1];
    const y0 = !previous
      ? 0
      : isArt[index - 1]
        ? (previous.bottom + extent.top) / 2
        : Math.max(previous.bottom, extent.top - PAD);
    const y1 = !next
      ? 1
      : isArt[index + 1]
        ? (extent.bottom + next.top) / 2
        : Math.min(next.top, extent.bottom + PAD);
    return { y0, y1 };
  });
  // Bands can overlap in y — the design draws a headline across the one above
  // it — so clamp every range to start where the last one ended. Without this
  // both slices contain the shared strip and the line renders twice.
  let cursor = 0;
  for (const bound of bounds) {
    bound.y0 = Math.max(bound.y0, cursor);
    bound.y1 = Math.max(bound.y1, bound.y0);
    cursor = bound.y1;
  }

  const ranges = bands
    .map((_band, index) => ({
      index,
      id: `band-${index}`,
      y0: bounds[index].y0,
      y1: bounds[index].y1,
    }))
    .filter((range) => isArt[range.index] && range.y1 - range.y0 > 0.0005);

  const slices = await slicePdfBands(structure.source, ranges, CANVAS);
  const sliced = new Set(ranges.map((range) => range.index));

  // A text band sitting inside a rendered slice is already in the picture.
  // Emitting it again as HTML is how a decorative headline appeared twice.
  const covered = new Set<number>();
  for (const [index, extent] of extents.entries()) {
    if (sliced.has(index)) continue;
    // Overlap, not containment: the design stacks decorative headlines on top of
    // one another, so the duplicate straddles the slice edge rather than sitting
    // inside it.
    const height = Math.max(1e-6, extent.bottom - extent.top);
    const inside = ranges.some((range) => {
      if (!slices.has(range.id)) return false;
      const overlap = Math.min(extent.bottom, range.y1) - Math.max(extent.top, range.y0);
      return overlap > height * 0.5;
    });
    if (inside) covered.add(index);
  }

  for (const [bandIndex, band] of bands.entries()) {
    if (covered.has(bandIndex)) continue;
    const top = Math.min(...band.map((b) => b.y0));
    const bottom = Math.max(...band.map((b) => b.y1));
    const background = bandBackground(structure, top, bottom);

    // Artwork bands are rendered from the PDF; only flat text is rebuilt.
    const slice = sliced.has(bandIndex) ? slices.get(`band-${bandIndex}`) : undefined;
    if (!slice && sliced.has(bandIndex)) {
      // A band too thin to render — a decorative headline drawn over another —
      // is already inside its neighbour's slice. Rebuilding it as HTML is how a
      // stray yellow "You've Already Earned" appeared mid-section.
      continue;
    }
    if (slice) {
      const filename = `band-${String(images.length).padStart(3, "0")}.png`;
      const placeholder = `https://plugin-agent.local/structure/${filename}`;
      images.push({ placeholder, filename, buffer: slice.buffer });
      const bg = background ? ` bgcolor="${background}"` : "";
      const bgStyle = background ? `background-color:${background};` : "";
      rows.push(
        `<tr>
    <td${bg} style="${bgStyle}padding:0;font-size:0;line-height:0;">
` +
          `      <img src="${placeholder}" width="${CANVAS}" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:${CANVAS}px;height:auto;" />
` +
          `    </td>
  </tr>`,
      );
      continue;
    }

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
