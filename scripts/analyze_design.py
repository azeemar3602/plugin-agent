#!/usr/bin/env python3
"""Split a JPEG/PNG/PDF mockup into layout bands for Elementor JSON generation."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def load_image(path: str):
    from PIL import Image

    suffix = Path(path).suffix.lower()
    if suffix == ".pdf":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(path)
        if len(pdf) == 0:
            raise SystemExit("PDF has no pages.")
        page = pdf[0]
        pil = page.render(scale=1.6).to_pil().convert("RGB")
        pdf.close()
        return pil
    return Image.open(path).convert("RGB")


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def dominant_color(im) -> tuple[int, int, int]:
    small = im.resize((24, 24))
    colors = small.getcolors(24 * 24) or []
    colors.sort(key=lambda item: item[0], reverse=True)
    return colors[0][1] if colors else (245, 245, 245)


def row_stats(gray_bytes: list[int], width: int, height: int):
    means = []
    stds = []
    for y in range(height):
        row = gray_bytes[y * width : (y + 1) * width]
        avg = sum(row) / width
        var = sum((v - avg) ** 2 for v in row) / width
        means.append(avg)
        stds.append(var ** 0.5)
    return means, stds


def smooth(values: list[float], win: int = 7) -> list[float]:
    if win < 2:
        return values
    half = win // 2
    out = []
    n = len(values)
    for i in range(n):
        sl = values[max(0, i - half) : min(n, i + half + 1)]
        out.append(sum(sl) / len(sl))
    return out


def find_gaps(stds: list[float], height: int) -> list[int]:
    if not stds:
        return [0, height]
    thresh = sorted(stds)[max(0, int(len(stds) * 0.22))]
    min_run = max(6, height // 80)
    gaps = []
    run = 0
    start = 0
    for i, val in enumerate(stds):
        if val <= thresh:
            if run == 0:
                start = i
            run += 1
        else:
            if run >= min_run:
                gaps.append((start + i) // 2)
            run = 0
    if run >= min_run:
        gaps.append((start + height) // 2)
    cuts = [0]
    for g in gaps:
        if g - cuts[-1] > height * 0.06:
            cuts.append(g)
    if height - cuts[-1] > height * 0.05:
        cuts.append(height)
    else:
        cuts[-1] = height
    # Force between 3 and 7 sections by merging or splitting.
    while len(cuts) - 1 > 7:
        # merge the smallest section
        sizes = [(cuts[i + 1] - cuts[i], i) for i in range(len(cuts) - 1)]
        sizes.sort()
        idx = sizes[0][1]
        del cuts[idx if idx > 0 else 1]
    while len(cuts) - 1 < 3:
        sizes = [(cuts[i + 1] - cuts[i], i) for i in range(len(cuts) - 1)]
        sizes.sort(reverse=True)
        idx = sizes[0][1]
        mid = (cuts[idx] + cuts[idx + 1]) // 2
        cuts.insert(idx + 1, mid)
    return cuts


def column_count(im) -> int:
    w, h = im.size
    gray = im.convert("L")
    px = list(gray.getdata())
    col_std = []
    for x in range(w):
        col = [px[y * w + x] for y in range(h)]
        avg = sum(col) / h
        var = sum((v - avg) ** 2 for v in col) / h
        col_std.append(var ** 0.5)
    sm = smooth(col_std, max(5, w // 40))
    thresh = sorted(sm)[max(0, int(len(sm) * 0.18))]
    gutters = []
    run = 0
    start = 0
    min_run = max(8, w // 30)
    for i, val in enumerate(sm):
        if val <= thresh:
            if run == 0:
                start = i
            run += 1
        else:
            if run >= min_run and 0.18 * w < (start + i) / 2 < 0.82 * w:
                gutters.append((start + i) // 2)
            run = 0
    # unique-ish gutters
    kept = []
    for g in gutters:
        if not kept or abs(g - kept[-1]) > w * 0.18:
            kept.append(g)
    if len(kept) >= 2:
        return 3
    if len(kept) == 1:
        return 2
    return 1


def classify(index: int, total: int, image_heavy: bool, columns: int, lum: float) -> str:
    if index == 0:
        return "hero"
    if index == total - 1:
        return "footer"
    if image_heavy and columns == 1:
        return "media"
    if columns >= 3:
        return "features"
    if columns == 2:
        return "split"
    if lum < 0.35:
        return "cta"
    if index == total - 2:
        return "cta"
    return "content"


def analyze(path: str) -> dict:
    im = load_image(path)
    orig_w, orig_h = im.size
    target_w = 480
    scale = target_w / orig_w
    work = im.resize((target_w, max(80, int(orig_h * scale))))
    gray = work.convert("L")
    gw, gh = gray.size
    means, stds = row_stats(list(gray.getdata()), gw, gh)
    stds = smooth(stds, 9)
    cuts = find_gaps(stds, gh)
    sections = []
    total = len(cuts) - 1
    for i in range(total):
        y0, y1 = cuts[i], cuts[i + 1]
        crop = work.crop((0, y0, gw, y1))
        bg = dominant_color(crop)
        lum = luminance(bg)
        cols = column_count(crop)
        # high std => photos / busy graphics
        band_std = sum(stds[y0:y1]) / max(1, y1 - y0)
        image_heavy = band_std > 28
        role = classify(i, total, image_heavy, cols, lum)
        sections.append(
            {
                "role": role,
                "y0": round(y0 / gh, 4),
                "y1": round(y1 / gh, 4),
                "columns": cols,
                "bg": rgb_to_hex(bg),
                "fg": "#f8f8f8" if lum < 0.45 else "#1a1a1a",
                "imageHeavy": image_heavy,
            }
        )
    return {
        "width": orig_w,
        "height": orig_h,
        "background": rgb_to_hex(dominant_color(work)),
        "sections": sections,
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: analyze_design.py <image-or-pdf>")
    print(json.dumps(analyze(sys.argv[1])))


if __name__ == "__main__":
    main()
