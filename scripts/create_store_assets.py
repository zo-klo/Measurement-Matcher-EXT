#!/usr/bin/env python3
"""Render original measuring-tape/check artwork; requires Pillow for development only."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
S = 4

def icon(size):
    canvas = Image.new('RGBA', (128*S, 128*S))
    d = ImageDraw.Draw(canvas)
    def box(bounds): return tuple(round(v*S) for v in bounds)
    d.rounded_rectangle(box((16, 16, 112, 112)), radius=23*S, fill='#156459')
    d.rounded_rectangle(box((33, 44, 95, 78)), radius=7*S, fill='#fff8e7')
    for i, x in enumerate(range(41, 92, 10)):
        d.line(box((x, 45, x, 56 if i%2 else 61)), fill='#156459', width=3*S)
    d.line(box((38, 72, 58, 72)), fill='#156459', width=3*S)
    d.ellipse(box((72, 70, 102, 100)), fill='#b8e7cf')
    d.line([box((79, 85)), box((85, 91)), box((96, 79))], fill='#154d43', width=4*S, joint='curve')
    return canvas.resize((size, size), Image.Resampling.LANCZOS)

(ROOT/'icons').mkdir(exist_ok=True)
for size in [16, 32, 48, 128]:
    icon(size).save(ROOT/f'icons/icon-{size}.png')
# Optional small promotion tile: brand artwork, no site logos or performance claims.
promo = Image.new('RGB', (440, 280), '#156459')
promo.paste(icon(256), (92, 12), icon(256))
promo.save(ROOT/'store/promo-small-440x280.png')
print('Created four extension icons and optional 440×280 promotional tile.')
