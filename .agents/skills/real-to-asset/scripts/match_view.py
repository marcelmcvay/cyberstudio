#!/usr/bin/env python3
"""Stretch one side view sideways so its depth matches another side view.

    python3 match_view.py <view_to_fix.png> <reference_view.png> <out.png>

Image models often draw one side of an object shallower than the other. For a
plain side (a panel, a cabinet side) a horizontal stretch is a cheap, honest
fix before multiview meshing. The script measures the body of each view (rows
at least half as wide as the object, so a stack light or antenna on top does
not count), scales the first view's width to match the reference's body width
over height, and prints the factor. Record the factor with the references.
Needs Pillow.
"""
import sys
from PIL import Image

WHITE = 236


def body(path):
    im = Image.open(path).convert('RGB')
    g = im.convert('L').point(lambda v: 255 if v < WHITE else 0)
    x0, y0, x1, y1 = g.getbbox()
    width, px = x1 - x0, g.load()
    rows = [y for y in range(y0, y1) if sum(1 for x in range(x0, x1, 2) if px[x, y]) * 2 > 0.5 * width]
    return im, (x0, y0, x1, y1), width / (rows[-1] - rows[0])


def main(fix, ref, out):
    im, box, current = body(fix)
    _, _, target = body(ref)
    k = target / current
    margin = 40
    crop = im.crop((max(0, box[0] - margin), max(0, box[1] - margin), min(im.width, box[2] + margin), min(im.height, box[3] + margin)))
    crop.resize((round(crop.width * k), crop.height), Image.LANCZOS).save(out)
    print(f'body w:h {current:.2f} -> {target:.2f}, stretched x{k:.2f}: {out}')


if __name__ == '__main__':
    main(*sys.argv[1:4])
