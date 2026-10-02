"""Extract garden layout from the CAD floor-plan PDF (ww(1).pdf) into data/layout.json.

Coordinates in the PDF are points (y down). Scale was calibrated from the drawn
boundary: the north edge 268.6..602.5pt is dimensioned 12400+10600 = 23000 mm,
and the east edge 106.4..1061.8pt is 33800+32000 = 65800 mm  ->  68.88 mm/pt.

Output metres: x east, z south, origin = north-west corner of the property
(x=268.6pt, y=106.4pt).

Repeated objects (stepping stones, planks, circles, rocks) are detected
automatically as closed polygons. Plant symbols in this drawing are exploded into
loose strokes, so their centres/radii were read off zoomed grid renders and are
listed by hand below (PDF points).
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from pdfgeom import load

K = 0.06888
OX, OY = 268.6, 106.4


def m(x, y):
    return [round((x - OX) * K, 3), round((y - OY) * K, 3)]


def poly_m(pts):
    return [m(*p) for p in pts]


# ---------------------------------------------------------------- structures (pt)
BOUNDARY = [(448.6, 106.4), (602.5, 106.4), (602.5, 1061.8), (381.8, 1061.8), (381.8, 713.3),
            (302.0, 713.3), (302.0, 498.4), (268.6, 498.4), (268.6, 295.1), (448.6, 295.1)]
HOUSE = [(268.6, 309.7), (428.3, 309.7), (428.3, 422.9), (355.7, 422.9), (355.7, 386.6), (268.6, 386.6)]
NEIGHBOR = [(268.6, 164.5), (275, 140), (290, 120), (305, 110), (322, 106.4), (395.9, 106.4), (395.9, 208.0),
            (448.6, 208.0), (448.6, 295.1), (268.6, 295.1)]
OLD_HOUSE = [(395.9, 106.4), (448.6, 106.4), (448.6, 208.0), (395.9, 208.0)]   # "房子" (dashed)
VEG = [(448.6, 106.4), (502.5, 106.4), (502.5, 208.0), (448.6, 208.0)]          # "菜地"
PATIO = [(453.5, 225.0), (536.5, 225.0), (536.5, 266.3), (517.5, 266.3), (517.5, 307.6), (489.2, 307.6),
         (489.2, 329.4), (453.5, 329.4)]
BOARDWALK = [(495.8, 373.8), (510.4, 373.8), (510.4, 475.4), (495.8, 475.4)]
PAVED_STRIP = [(495.8, 307.6), (510.4, 307.6), (510.4, 373.8), (495.8, 373.8)]
ROAD = [(536.8, 106.4), (602.5, 106.4), (602.5, 1061.8), (413.0, 1061.8), (413.0, 928.0), (509.0, 928.0),
        (520, 926.5), (528, 921), (534, 912), (536.8, 900.0)]
PLANTER = [(381.8, 928.0), (413.0, 928.0), (413.0, 1061.8), (381.8, 1061.8)]
GARDEN_EDGE_SE = [(509.0, 928.0), (520, 926.5), (528, 921), (534, 912), (536.8, 900.0)]
BED = [(355.7, 386.6), (340, 395), (325, 405), (313, 418), (308, 435), (310, 455), (318, 470), (330, 483),
       (345, 493), (365, 494), (385, 494), (400, 500), (415, 511), (438, 514.5), (456, 512), (460, 495),
       (463, 470), (468, 450), (473, 425), (476, 400), (479.4, 380), (479.4, 330), (453.5, 329.4),
       (450.5, 424), (428.3, 424), (428.3, 422.9), (355.7, 422.9)]
POND = [(328, 562), (342, 556), (362, 560), (385, 553), (402, 550), (418, 556), (432, 550), (452, 551),
        (458, 560), (458, 585), (452, 598), (440, 606), (425, 608), (410, 606), (396, 616), (380, 624),
        (362, 626), (346, 620), (334, 608), (326, 594), (324, 578)]
PAVILION = dict(body=(324.5, 647.9, 372.4, 695.8), platform=(318.9, 641.8, 378.2, 701.6),
                bench=(332.0, 650.7, 365.6, 655.6))
PERGOLA = dict(x0=471.7, x1=506.5, y0=525.7, y1=642.1,
               beams=[533.3 + i * 10.18 for i in range(11)], beam_x=(467.3, 510.9))
PEBBLE = (512.45, 734.9, 537.15, 766.9)
LAMPS = [(523.4, 388.3), (523.4, 424.6), (523.4, 460.9)]
GATES = [dict(x0=541.4, x1=600.0, y=106.4), dict(x0=541.4, x1=600.0, y=1061.8)]
CARS = [dict(x=476.3, y=952.1, rot=90), dict(x=476.3, y=994.2, rot=90), dict(x=476.3, y=1038.1, rot=90),
        dict(x=581.4, y=704.4, rot=0)]
PATIO_TABLE = (469.7, 259.5)
BENCH_STONE = (391.0, 821.0, 402.6, 838.8)
SW_CORNER = [(381.8, 872), (418, 872), (426, 900), (424, 928.0), (381.8, 928.0)]   # free design: bamboo + tea
SE_GRASS = [(520, 828), (536.8, 822), (536.8, 900), (530, 918), (518, 925)]

# ---------------------------------------------------------------- plants (pt, read by hand)
# A round umbrella symbol -> osmanthus; C spiky round -> small evergreen/flowering trees;
# D leafy -> camphor (big) / maple; bold starburst -> palm; spiky star w/ dot -> cycad;
# thin-line star -> maple; fluffy cloud -> hydrangea/shrub; G dark dots -> flowers.
PLANTS = []
def add(kind, pts):
    for p in pts:
        PLANTS.append(dict(kind=kind, x=p[0], y=p[1], r=p[2] if len(p) > 2 else 3))

add('osmanthus', [(525.1, 122.9, 9.5), (521.4, 135.7, 9.5), (513.7, 151.4, 9.5), (510, 162.3, 9.5), (526.3, 173.7, 9.5),
                  (522.9, 185.7, 9.5), (509.1, 200.6, 9.5), (526.3, 205.7, 9.5), (522.9, 217.7, 9.5),
                  (531, 325, 9.5), (534, 340.6, 9), (527.3, 353.2, 9), (531.8, 365, 9),
                  (355.5, 435.8, 9.5), (372, 433.7, 9), (414.7, 432.8, 9.5), (355, 454.5, 9.5), (353.3, 484, 10),
                  (522, 609, 9), (533, 613, 9), (533, 633, 9), (533, 645.6, 9), (533, 693, 9), (526.7, 709, 9),
                  (532, 721, 9), (491, 751, 9), (478, 767.5, 9), (471.8, 781, 9)])
add('smalltree', [(457.1, 215.7, 7), (472.9, 212, 7), (521.4, 273.6, 6), (533.7, 276.4, 7), (531.4, 289.3, 7),
                  (471.6, 334.3, 7.5), (462.2, 348.8, 8), (478.4, 346.6, 7.5), (523.3, 517, 7),
                  (375.5, 446.5, 7), (386.7, 450, 7), (376.3, 481.7, 7), (317.8, 624.4, 8.5),
                  (530, 533.6, 8), (525.7, 547, 8), (531.4, 551, 8), (530, 573, 8), (525.7, 587, 8),
                  (391, 635.6, 7), (403.3, 630, 7), (408.9, 642.2, 7), (396.7, 653.3, 6), (433.3, 641, 7), (370.7, 653.3, 6),
                  (478.9, 666.7, 7), (482.2, 677.8, 7), (467.8, 721, 7),
                  (397.8, 785.2, 9), (417.6, 786.3, 9), (386.3, 793.5, 8), (386.3, 810.2, 9), (388.4, 851.9, 8.5),
                  (422.2, 844.6, 8), (486.3, 799.8, 8), (477, 916.5, 7), (502, 905, 8), (505, 893.5, 8), (519.7, 886, 8),
                  (515.5, 903, 8), (504, 917.5, 7), (489.5, 921.7, 7), (404, 917.5, 7)])
add('camphor', [(335, 432, 18), (404, 722, 14), (409, 752, 14), (508.9, 658.9, 14)])
add('maple', [(451.1, 623.3, 8), (471.1, 647.8, 8.5), (405, 694, 11), (508.9, 704.4, 9),
              (493.6, 828, 9), (448.8, 858, 9), (449.9, 867.5, 8), (407.2, 863.3, 8), (394.7, 867.5, 7),
              (494.7, 874.8, 8), (511.3, 845.6, 8), (528, 778, 8), (521.8, 785.2, 7)])
add('palm', [(434.3, 817.5, 20), (432.2, 893.5, 19)])
add('cycad', [(516.7, 313.9, 9), (488.2, 336.1, 9), (470, 410.6, 9), (493.3, 520.6, 9), (445, 491.7, 9.5),
              (514.4, 666.7, 10), (515.7, 567, 9)])
add('hydrangea', [(488.9, 367.2, 7), (458.3, 430.3, 5.5), (460.8, 442, 5), (455.8, 443.7, 4),
                  (372, 462, 4), (370, 470, 4), (371, 478, 4),
                  (310, 525, 5), (313, 535, 5), (309, 545, 5), (312, 555, 5), (305, 565, 5),
                  (445, 678, 5), (462, 682, 5), (472, 700, 5), (447, 712, 5), (460, 716, 5), (510, 724.4, 4)])
add('flowers', [(453.3, 653.3), (461, 652), (475, 633), (453.3, 669), (433, 686.7), (439, 688), (469, 706.7),
                (469, 711), (452, 723), (455.5, 725.5), (450, 726.7)])
add('crapemyrtle', [(397, 943.6, 7), (400, 979, 6), (401.4, 1035, 6)])


def closed(segs):
    if len(segs) < 3:
        return None
    pts = [segs[0][0]]
    for a, b in segs:
        if math.dist(a, pts[-1]) > 0.15:
            return None
        pts.append(b)
    return pts[:-1] if math.dist(pts[0], pts[-1]) <= 0.15 else None


def obb(pts):
    best = None
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        c, s = math.cos(-ang), math.sin(-ang)
        r = [(p[0] * c - p[1] * s, p[0] * s + p[1] * c) for p in pts]
        xs = [q[0] for q in r]; ys = [q[1] for q in r]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        if best is None or area < best[0]:
            best = (area, ang, max(xs) - min(xs), max(ys) - min(ys))
    _, ang, L, W = best
    if W > L:
        L, W, ang = W, L, ang + math.pi / 2
    return L, W, ang


def inside(b, x, y):
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def main():
    polys = []
    for d in load():
        p = closed(d['segs'])
        if not p:
            continue
        xs = [q[0] for q in p]; ys = [q[1] for q in p]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if 1.5 < max(w, h) < 40 and 270 < min(xs) and max(xs) < 540 and 106 < min(ys) and max(ys) < 1062:
            polys.append(dict(n=len(p), w=w, h=h, cx=sum(xs) / len(xs), cy=sum(ys) / len(ys), pts=p))

    pavers, planks, slabs, rocks, shrubs, stools = [], [], [], [], [], []
    for p in polys:
        n, w, h, cx, cy = p['n'], p['w'], p['h'], p['cx'], p['cy']
        if n == 4:
            L, W, ang = obb(p['pts'])
            item = dict(x=m(cx, cy)[0], z=m(cx, cy)[1], l=round(L * K, 3), w=round(W * K, 3), a=round(ang, 4))
            if abs(L - 8.7) < 0.3 and abs(W - 2.9) < 0.3:
                planks.append(item)                     # dark timber planks (pavilion path)
            elif W < 2.6 and L > 9.5 and 485 < cx < 540 and 490 < cy < 505:
                slabs.append(item)                      # upright slate slabs
            elif (3 < W < 7.5 and 9 < L < 20) or (abs(L - 13.2) < .3):
                pavers.append(item)                     # stepping stones
            elif 1.9 < W < 6.5 and 9 < L < 20:
                pavers.append(item)
        elif n >= 10 and abs(w - h) < 0.2 * max(w, h):
            r = w / 2
            if inside((453, 240, 485, 280), cx, cy):
                if all(math.dist((cx, cy), s) > 1 for s in stools):
                    stools.append((cx, cy))
            elif 1.6 <= r <= 11 and not (n in (10, 12) and r < 2):
                if 5.6 < r < 6.1:
                    kind = 'ballshrub'
                elif r > 6.2:
                    kind = 'rhapis'
                else:
                    kind = 'shrub'
                if all(math.dist((cx, cy), (s['x'], s['y'])) > 1 for s in shrubs):
                    shrubs.append(dict(kind=kind, x=cx, y=cy, r=r))
        elif 5 <= n <= 8 and max(w, h) > 3.5 and min(w, h) > 2.5:
            if any(math.dist((cx, cy), (q['cx'], q['cy'])) < 5 for q in rocks):
                continue
            rocks.append(dict(cx=cx, cy=cy, pts=p['pts']))

    # the drawing misses two closed outlines: one patio step and one paver by the house
    for (cx, cy, L, W) in [(489.7, 211.2, 13.2, 6.7), (444.4, 331.1, 13.2, 6.7)]:
        pavers.append(dict(x=m(cx, cy)[0], z=m(cx, cy)[1], l=round(L * K, 3), w=round(W * K, 3), a=0))

    plants = [dict(kind=p['kind'], x=m(p['x'], p['y'])[0], z=m(p['x'], p['y'])[1], r=round(p['r'] * K, 3))
              for p in PLANTS + shrubs]
    rect = lambda b: poly_m([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])])
    out = dict(
        units='m', note='x east, z south, origin = NW corner of property', scale_mm_per_pt=K * 1000,
        boundary=poly_m(BOUNDARY), house=poly_m(HOUSE), neighbor=poly_m(NEIGHBOR), oldHouse=poly_m(OLD_HOUSE),
        veg=poly_m(VEG), patio=poly_m(PATIO), boardwalk=poly_m(BOARDWALK), pavedStrip=poly_m(PAVED_STRIP),
        road=poly_m(ROAD), planter=poly_m(PLANTER), bed=poly_m(BED), pond=poly_m(POND),
        swCorner=poly_m(SW_CORNER), seGrass=poly_m(SE_GRASS), pebble=rect(PEBBLE),
        pavilion=dict(body=rect(PAVILION['body']), platform=rect(PAVILION['platform']), bench=rect(PAVILION['bench'])),
        pergola=dict(x0=m(PERGOLA['x0'], 0)[0], x1=m(PERGOLA['x1'], 0)[0], z0=m(0, PERGOLA['y0'])[1],
                     z1=m(0, PERGOLA['y1'])[1], beams=[m(0, y)[1] for y in PERGOLA['beams']],
                     beamX=[m(PERGOLA['beam_x'][0], 0)[0], m(PERGOLA['beam_x'][1], 0)[0]]),
        lamps=[m(*p) for p in LAMPS],
        gates=[dict(x0=m(g['x0'], 0)[0], x1=m(g['x1'], 0)[0], z=m(0, g['y'])[1]) for g in GATES],
        cars=[dict(x=m(c['x'], c['y'])[0], z=m(c['x'], c['y'])[1], rot=c['rot']) for c in CARS],
        patioTable=m(*PATIO_TABLE), stools=[m(*s) for s in stools], stoneBench=rect(BENCH_STONE),
        pavers=pavers, planks=planks, slabs=slabs,
        rocks=[poly_m(r['pts']) for r in rocks], plants=plants,
    )
    dst = os.path.join(os.path.dirname(__file__), '..', 'data', 'layout.json')
    json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('pavers', len(pavers), 'planks', len(planks), 'slabs', len(slabs), 'rocks', len(rocks),
          'plants', len(plants), 'stools', len(stools))


if __name__ == '__main__':
    main()
