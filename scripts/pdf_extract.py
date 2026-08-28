"""Extract the real structure of a PDF design: text with positions and font
sizes, embedded images, and filled shapes.

The rasterizing path throws all of this away and guesses layout from pixels.
When a PDF carries a text layer this recovers the actual content instead.

    python scripts/pdf_extract.py design.pdf outdir

Prints JSON on stdout. Coordinates are normalized 0..1 from the TOP-LEFT, so
they can be used directly for ordering and column math.
"""

import json
import os
import sys

import ctypes

import pypdfium2 as pdfium
import pypdfium2.raw as raw
from PIL import Image

TEXT, PATH, IMAGE = 1, 2, 3


def fill_color(obj):
    """The object's own fill colour, straight from the PDF."""
    r, g, b, a = (ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint())
    try:
        if not raw.FPDFPageObj_GetFillColor(obj.raw, r, g, b, a):
            return None
    except Exception:
        return None
    if a.value == 0:
        return None
    return "#%02x%02x%02x" % (r.value, g.value, b.value)


def sample_color(raster, page_w, page_h, box):
    """Average colour of a region, read off the rendered page."""
    if raster is None:
        return None
    x0, y0, x1, y1 = box
    w, h = raster.size
    left = max(0, min(w - 1, int(x0 / page_w * w)))
    right = max(left + 1, min(w, int(x1 / page_w * w)))
    top = max(0, min(h - 1, int(y0 / page_h * h)))
    bottom = max(top + 1, min(h, int(y1 / page_h * h)))
    crop = raster.crop((left, top, right, bottom))
    crop.thumbnail((8, 8))
    pixels = list(crop.convert("RGB").getdata()) if not hasattr(crop, "get_flattened_data") else list(crop.get_flattened_data())
    if not pixels:
        return None
    n = len(pixels)
    r = sum(p[0] for p in pixels) // n
    g = sum(p[1] for p in pixels) // n
    b = sum(p[2] for p in pixels) // n
    return "#%02x%02x%02x" % (r, g, b)


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)

    doc = pdfium.PdfDocument(src)
    pages = []
    total_h = 0.0
    max_w = 0.0
    for page in doc:
        w, h = page.get_width(), page.get_height()
        max_w = max(max_w, w)
        total_h += h
        pages.append((page, w, h))

    out = {
        "width": max_w,
        "height": total_h,
        "pages": len(pages),
        "texts": [],
        "images": [],
        "shapes": [],
        # Every path, including the small ones: icons, buttons, rules and
        # illustrations live here, and a band containing them has to be rendered.
        "vectors": [],
    }

    # Stack pages vertically, matching how pdf_to_jpeg.py rasterizes them.
    y_offset = 0.0
    img_index = 0
    for page, pw, ph in pages:
        try:
            raster = page.render(scale=1.0).to_pil().convert("RGB")
        except Exception:
            raster = None
        try:
            textpage = page.get_textpage()
        except Exception:
            textpage = None

        for obj in page.get_objects(max_depth=12):
            try:
                bx0, by0, bx1, by1 = obj.get_bounds()
            except Exception:
                continue
            # PDF y grows upward; flip to top-left origin and stack.
            top = (ph - by1) + y_offset
            bottom = (ph - by0) + y_offset
            left, right = bx0, bx1
            if right - left <= 0 or bottom - top <= 0:
                continue

            box = {
                "x0": round(left / max_w, 5),
                "x1": round(right / max_w, 5),
                "y0": round(top / total_h, 5),
                "y1": round(bottom / total_h, 5),
            }

            if obj.type == TEXT:
                try:
                    # extract() reads through a textpage that must be attached first.
                    obj.textpage = textpage
                    text = obj.extract()
                except Exception:
                    text = ""
                text = (text or "").replace("\r", " ").replace("\n", " ").strip()
                if not text:
                    continue
                # get_font_size() reports the pre-matrix size (usually 1.0), so the
                # rendered height of the run is the usable signal for hierarchy.
                size = round(bottom - top, 2)
                try:
                    font = str(obj.get_font().name)
                except Exception:
                    font = ""
                out["texts"].append(
                    {
                        **box,
                        "text": text,
                        "size": round(size, 2),
                        "font": font,
                        "color": fill_color(obj),
                    }
                )
            elif obj.type == IMAGE:
                stem = "img-%03d" % img_index
                img_index += 1
                name = stem + ".png"
                dest = os.path.join(outdir, name)
                try:
                    # extract() picks its own extension for the embedded format, so
                    # normalize everything to one PNG the uploader can rely on.
                    obj.get_bitmap().to_pil().convert("RGB").save(dest)
                except Exception:
                    try:
                        obj.extract(os.path.join(outdir, stem))
                        produced = [f for f in os.listdir(outdir) if f.startswith(stem)]
                        if not produced:
                            continue
                        Image.open(os.path.join(outdir, produced[0])).convert("RGB").save(dest)
                        for f in produced:
                            if f != name:
                                os.remove(os.path.join(outdir, f))
                    except Exception:
                        continue
                if os.path.exists(dest):
                    out["images"].append({**box, "file": name})
            elif obj.type == PATH:
                out["vectors"].append(box)
                area = (right - left) * (bottom - top)
                # Only large fills are usable as backgrounds; the rest is artwork.
                if area < (max_w * total_h) * 0.002:
                    continue
                out["shapes"].append({**box, "color": fill_color(obj)})

        y_offset += ph

    out["texts"].sort(key=lambda t: (t["y0"], t["x0"]))
    out["images"].sort(key=lambda t: (t["y0"], t["x0"]))
    out["shapes"].sort(key=lambda t: (t["y0"], t["x0"]))
    out["vectors"].sort(key=lambda t: (t["y0"], t["x0"]))
    out["blocks"] = group_blocks(out["texts"], total_h)
    json.dump(out, sys.stdout)


def group_blocks(texts, page_h):
    """Merge runs into lines, then lines into paragraphs.

    A PDF emits one run per style change, so a single headline arrives as
    "The Second Sal" + "ary" + "Already". Runs that share a baseline are one
    line; consecutive lines of similar height and tight spacing are one block.
    """
    lines = []
    for t in texts:
        placed = False
        for line in lines:
            same_row = abs(line["y0"] - t["y0"]) < (t["y1"] - t["y0"]) * 0.6
            overlapping_band = t["y0"] < line["y1"] and t["y1"] > line["y0"]
            # Runs sitting side by side in different columns share a baseline but
            # are not one sentence — a wide horizontal gap means a new column.
            gap_x = max(line["x0"] - t["x1"], t["x0"] - line["x1"])
            adjacent = gap_x < 0.04
            if same_row and overlapping_band and adjacent:
                line["parts"].append(t)
                line["x0"] = min(line["x0"], t["x0"])
                line["x1"] = max(line["x1"], t["x1"])
                line["y0"] = min(line["y0"], t["y0"])
                line["y1"] = max(line["y1"], t["y1"])
                placed = True
                break
        if not placed:
            lines.append({"x0": t["x0"], "x1": t["x1"], "y0": t["y0"], "y1": t["y1"], "parts": [t]})

    for line in lines:
        line["parts"].sort(key=lambda p: p["x0"])
        line["text"] = join_runs([p["text"] for p in line["parts"]])
        line["size"] = max(p["size"] for p in line["parts"])
        line["color"] = line["parts"][0].get("color")
    lines.sort(key=lambda l: (l["y0"], l["x0"]))

    blocks = []
    for line in lines:
        if not line["text"].strip():
            continue
        prev = blocks[-1] if blocks else None
        if prev is not None:
            gap = (line["y0"] - prev["y1"]) * page_h
            similar = abs(line["size"] - prev["size"]) <= max(2.0, prev["size"] * 0.25)
            aligned = abs(line["x0"] - prev["x0"]) < 0.06
            # Same column, same size, and less than about a line of blank space.
            if similar and aligned and gap < line["size"] * 1.2:
                prev["lines"].append(line["text"])
                prev["x1"] = max(prev["x1"], line["x1"])
                prev["y1"] = max(prev["y1"], line["y1"])
                prev["size"] = max(prev["size"], line["size"])
                continue
        blocks.append(
            {
                "x0": line["x0"],
                "x1": line["x1"],
                "y0": line["y0"],
                "y1": line["y1"],
                "size": line["size"],
                "color": line["color"],
                "lines": [line["text"]],
            }
        )

    sizes = sorted((b["size"] for b in blocks), reverse=True)
    big = sizes[0] if sizes else 0
    body = median([b["size"] for b in blocks]) if blocks else 0
    for b in blocks:
        b["text"] = " ".join(b["lines"]).strip()
        del b["lines"]
        # Anything clearly larger than the body copy reads as a heading.
        if b["size"] >= max(body * 1.45, big * 0.55):
            b["role"] = "heading"
        elif b["size"] >= body * 1.15:
            b["role"] = "subheading"
        else:
            b["role"] = "paragraph"
    return [b for b in blocks if _is_content(b["text"])]


def _is_content(text):
    stripped = text.strip()
    if len(stripped) < 2:
        return False
    return any(ch.isalnum() for ch in stripped)


def join_runs(parts):
    out = ""
    for p in parts:
        p = p.replace("\n", " ")
        if not out:
            out = p
            continue
        # Runs split mid-word ("The Second Sal" + "ary") must not gain a space.
        if out.endswith(" ") or p.startswith(" "):
            out += p
        elif out[-1:].isalnum() and p[:1].isalnum() and (out[-1:].islower() or p[:1].islower()):
            out += p
        elif len(out) >= 1 and out[-1:].isupper() and p[:1].isupper() and _lone_capital(out):
            # Small-caps set a word's first letter as its own run: "F" + "EATURED".
            out += p
        else:
            out += " " + p
    return " ".join(out.split())


def _lone_capital(value):
    tail = value.split(" ")[-1]
    return len(tail) == 1 and tail.isupper()


def median(values):
    if not values:
        return 0
    s = sorted(values)
    return s[len(s) // 2]


if __name__ == "__main__":
    main()
