"""Render horizontal slices of a design PDF as PNGs.

Vector art — logos, icons, buttons, illustrations — cannot be rebuilt as HTML
and email clients cannot draw it. Rendering those bands straight from the PDF
reproduces them exactly.

    python scripts/pdf_slice.py design.pdf outdir width ranges.json

ranges.json is [{"id": "band-3", "y0": 0.12, "y1": 0.21}, ...] with y values
normalized 0..1 over the whole stacked document. Prints JSON mapping id to the
written filename and its pixel height.
"""

import json
import os
import sys

import pypdfium2 as pdfium
from PIL import Image


def main():
    src, outdir, width, ranges_path = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
    os.makedirs(outdir, exist_ok=True)
    with open(ranges_path, encoding="utf-8") as handle:
        ranges = json.load(handle)

    doc = pdfium.PdfDocument(src)
    # Render at 2x the target width so the slices stay sharp on retina screens.
    pages = []
    total_h = 0
    max_w = 0
    for page in doc:
        scale = (width * 2) / page.get_width()
        img = page.render(scale=scale).to_pil().convert("RGB")
        pages.append(img)
        total_h += img.height
        max_w = max(max_w, img.width)

    if len(pages) == 1:
        canvas = pages[0]
    else:
        canvas = Image.new("RGB", (max_w, total_h), "white")
        y = 0
        for img in pages:
            canvas.paste(img, (0, y))
            y += img.height

    out = {}
    for entry in ranges:
        top = max(0, int(entry["y0"] * canvas.height))
        bottom = min(canvas.height, int(entry["y1"] * canvas.height))
        if bottom - top < 4:
            continue
        crop = canvas.crop((0, top, canvas.width, bottom))
        # Downscale to the target width; the 2x render keeps it crisp.
        crop = crop.resize((width, max(1, round(crop.height * width / crop.width))), Image.LANCZOS)
        name = "%s.png" % entry["id"]
        crop.save(os.path.join(outdir, name), optimize=True)
        out[entry["id"]] = {"file": name, "height": crop.height}

    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
