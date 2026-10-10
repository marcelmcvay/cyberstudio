#!/usr/bin/env python3
"""Cut a four-view turnaround sheet into its panels.

    python3 crop_sheet.py <sheet.png> <out_prefix>

Finds the four objects by their white gaps (not equal quarters, which can cut
an object), trims each to its content plus a margin and writes
<out_prefix>_1.png .. _4.png in sheet order. Prints each panel's drawn width
over height, to compare with the real footprint. Needs Pillow.
"""
import sys
from PIL import Image

WHITE = 236  # pixels lighter than this count as background


def segments(profile, min_gap, min_run):
    runs, start, gap = [], None, 0
    for i, v in enumerate(profile + [0] * (min_gap + 1)):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap > min_gap:
                end = i - gap + 1
                if end - start >= min_run:
                    runs.append((start, end))
                start, gap = None, 0
    return runs


def main(src, prefix):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    g = im.convert('L').point(lambda p: 255 if p < WHITE else 0)
    px = g.load()
    cols = [sum(1 for y in range(0, h, 4) if px[x, y]) for x in range(w)]
    cols = [1 if c > 2 else 0 for c in cols]
    runs = segments(cols, min_gap=w // 120, min_run=w // 40)
    if len(runs) != 4:
        raise SystemExit(f'expected 4 objects, found {len(runs)}: {runs}')
    m = w // 80
    for n, (x0, x1) in enumerate(runs, 1):
        box = g.crop((x0, 0, x1, h)).getbbox()
        y0, y1 = box[1], box[3]
        crop = im.crop((max(0, x0 - m), max(0, y0 - m), min(w, x1 + m), min(h, y1 + m)))
        crop.save(f'{prefix}_{n}.png')
        print(f'{prefix}_{n}.png  drawn {x1 - x0}x{y1 - y0} px  w:h {(x1 - x0) / (y1 - y0):.2f}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
