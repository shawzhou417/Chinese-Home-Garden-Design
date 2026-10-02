"""Shared helpers: load the floor-plan PDF as flat line segments (PDF points, y down)."""
import pymupdf

import os
PDF = os.environ.get('GARDEN_PDF', os.path.join(os.path.dirname(__file__), '..', 'plan', 'ww1.pdf'))


def bez(p0, p1, p2, p3, n=8):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; e = t ** 3
        pts.append((a * p0.x + b * p1.x + c * p2.x + e * p3.x, a * p0.y + b * p1.y + c * p2.y + e * p3.y))
    return pts


def load(path=PDF):
    """Return list of drawings: dict(kind, width, segs=[((x1,y1),(x2,y2)),...], fill)."""
    page = pymupdf.open(path)[0]
    out = []
    for d in page.get_drawings():
        segs = []
        for it in d['items']:
            if it[0] == 'l':
                segs.append(((it[1].x, it[1].y), (it[2].x, it[2].y)))
            elif it[0] == 'c':
                pts = bez(*it[1:5])
                segs += list(zip(pts[:-1], pts[1:]))
            elif it[0] == 're':
                r = it[1]
                q = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
                segs += [(q[i], q[(i + 1) % 4]) for i in range(4)]
            elif it[0] == 'qu':
                q = it[1]
                q = [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]
                segs += [(q[i], q[(i + 1) % 4]) for i in range(4)]
        out.append(dict(kind=d['type'], width=round(d.get('width') or 0, 2), segs=segs,
                        rect=tuple(d['rect']), n=len(d['items'])))
    return out


def render(segs_list, fn, box=None, scale=4, colors=None):
    from PIL import Image, ImageDraw
    if box is None:
        box = (0, 0, 842, 1191)
    x0, y0, x1, y1 = box
    im = Image.new('RGB', (int((x1 - x0) * scale), int((y1 - y0) * scale)), 'white')
    dr = ImageDraw.Draw(im)
    for k, segs in enumerate(segs_list):
        col = colors[k] if colors else 'black'
        for (a, b) in segs:
            dr.line([((a[0] - x0) * scale, (a[1] - y0) * scale), ((b[0] - x0) * scale, (b[1] - y0) * scale)], fill=col, width=1)
    im.save(fn)


def render_grid(D, fn, box, scale=3.5, step=10, hl=None):
    """Render all drawings in box with a labelled pt grid (for reading coordinates)."""
    from PIL import Image, ImageDraw
    x0, y0, x1, y1 = box
    im = Image.new('RGB', (int((x1 - x0) * scale), int((y1 - y0) * scale)), 'white')
    dr = ImageDraw.Draw(im)
    import math
    gx = math.ceil(x0 / step) * step
    while gx < x1:
        X = (gx - x0) * scale
        dr.line([(X, 0), (X, im.size[1])], fill=(255, 190, 190) if gx % 50 == 0 else (225, 225, 255))
        if gx % 20 == 0:
            dr.text((X + 2, 2), str(gx), fill='red')
        gx += step
    gy = math.ceil(y0 / step) * step
    while gy < y1:
        Y = (gy - y0) * scale
        dr.line([(0, Y), (im.size[0], Y)], fill=(255, 190, 190) if gy % 50 == 0 else (225, 225, 255))
        if gy % 20 == 0:
            dr.text((2, Y + 2), str(gy), fill='red')
        gy += step
    for i, d in enumerate(D):
        r = d['rect']
        if r[2] < x0 or r[0] > x1 or r[3] < y0 or r[1] > y1:
            continue
        col = 'blue' if hl and i in hl else 'black'
        for (a, b) in d['segs']:
            dr.line([((a[0] - x0) * scale, (a[1] - y0) * scale), ((b[0] - x0) * scale, (b[1] - y0) * scale)], fill=col)
    im.save(fn)
