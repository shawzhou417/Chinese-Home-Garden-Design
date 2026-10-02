"""Render the plan's line work to a transparent PNG used by the "叠加原平面图" toggle.

Covers PDF box x 260..610pt, y 100..1070pt (same box main.js maps the plane to).
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from pdfgeom import load
from PIL import Image, ImageDraw

K = 0.06888
PX_PER_M = 26
BOX = (260, 100, 610, 1070)
SS = 2   # supersample for anti-aliasing


def main():
    s = PX_PER_M * K * SS
    W, H = int((BOX[2] - BOX[0]) * s), int((BOX[3] - BOX[1]) * s)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    for d in load():
        r = d['rect']
        if r[2] < BOX[0] or r[0] > BOX[2] or r[3] < BOX[1] or r[1] > BOX[3]:
            continue
        for a, b in d['segs']:
            dr.line([((a[0] - BOX[0]) * s, (a[1] - BOX[1]) * s), ((b[0] - BOX[0]) * s, (b[1] - BOX[1]) * s)],
                    fill=(150, 20, 10, 255), width=3)
    im = im.resize((W // SS, H // SS), Image.LANCZOS)
    out = os.path.join(os.path.dirname(__file__), '..', 'web', 'build', 'plan-overlay.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = im.quantize(colors=32, method=Image.Quantize.FASTOCTREE)   # keeps the inlined HTML small
    im.save(out, optimize=True)
    print(out, im.size, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
