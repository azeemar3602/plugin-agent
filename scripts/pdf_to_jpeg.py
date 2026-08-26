#!/usr/bin/env python3
"""Rasterize every PDF page to one stacked JPEG for Plugin Agent."""

from __future__ import annotations

import sys

from PIL import Image
import pypdfium2 as pdfium


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: pdf_to_jpeg.py <input.pdf> <output.jpg>")
    src, dest = sys.argv[1], sys.argv[2]
    pdf = pdfium.PdfDocument(src)
    if len(pdf) == 0:
        raise SystemExit("PDF has no pages.")
    pages: list[Image.Image] = []
    for page in pdf:
        pages.append(page.render(scale=1.5).to_pil().convert("RGB"))
    pdf.close()
    if len(pages) == 1:
        out = pages[0]
    else:
        width = max(page.width for page in pages)
        height = sum(page.height for page in pages)
        out = Image.new("RGB", (width, height), (255, 255, 255))
        y = 0
        for page in pages:
            out.paste(page, (0, y))
            y += page.height
    max_height = 12000
    if out.height > max_height:
        out = out.resize(
            (max(1, int(out.width * max_height / out.height)), max_height),
            Image.Resampling.LANCZOS,
        )
    out.save(dest, "JPEG", quality=88, optimize=True)


if __name__ == "__main__":
    main()
