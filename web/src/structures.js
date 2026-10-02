import * as THREE from 'three';
import * as T from './textures.js';
import { slab, merge, paint, wallBox, bbox, rectPts } from './util.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });

function add(scene, g, m, cast = true, receive = true) {
  const me = new THREE.Mesh(g, m);
  me.castShadow = cast; me.receiveShadow = receive;
  scene.add(me);
  return me;
}

function boxAt(x, y, z, sx, sy, sz, ry = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function offsetPoly(pts, d) {   // offset a simple orthogonal polygon outward by d (works for our L-shape)
  const n = pts.length, out = [];
  const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const s = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const n1 = norm([(p1[1] - p0[1]) * s, -(p1[0] - p0[0]) * s]), n2 = norm([(p2[1] - p1[1]) * s, -(p2[0] - p1[0]) * s]);
    const m = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const k = d / Math.max(0.2, m[0] * n1[0] + m[1] * n1[1]);
    out.push([p1[0] + m[0] * k, p1[1] + m[1] * k]);
  }
  return out;
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

// ---------------------------------------------------------------- windows
class Facade {
  constructor() { this.frames = []; this.glass = []; this.dark = []; }
  // edge a->b, outward normal n; window centred s metres from a, width w, from y0 height h
  window(a, b, n, s, w, y0, h, { mullions = 0 } = {}) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const cx = a[0] + ux * s, cz = a[1] + uz * s, ry = -Math.atan2(dz, dx);
    const f = 0.07, depth = 0.12;
    const at = (along, y, out, sx, sy, sz) => boxAt(cx + ux * along + n[0] * out, y, cz + uz * along + n[1] * out, sx, sy, sz, ry);
    this.frames.push(at(0, y0 + f / 2, 0.03, w + f, f, depth), at(0, y0 + h - f / 2, 0.03, w + f, f, depth),
      at(-w / 2, y0 + h / 2, 0.03, f, h, depth), at(w / 2, y0 + h / 2, 0.03, f, h, depth));
    for (let i = 1; i <= mullions; i++) this.frames.push(at(-w / 2 + w * i / (mullions + 1), y0 + h / 2, 0.02, 0.05, h, 0.08));
    this.glass.push(at(0, y0 + h / 2, 0.028, w, h, 0.012));
    this.dark.push(at(0, y0 + h / 2, 0.012, w, h, 0.01));
  }
  build(scene, frameMat, glassMat) {
    add(scene, merge(this.frames), frameMat);
    add(scene, merge(this.glass), glassMat, false, false);
    add(scene, merge(this.dark), std({ color: 0x1c1f22, roughness: 1 }), false, false);
  }
}

function edges(pts) {   // [a, b, outwardNormal]
  const n = pts.length, res = [];
  const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], d = norm([b[0] - a[0], b[1] - a[1]]);
    res.push([a, b, area > 0 ? [d[1], -d[0]] : [-d[1], d[0]]]);
  }
  return res;
}

// ---------------------------------------------------------------- main house
function buildHouse(scene, L, M) {
  const H = L.house, FL = 3.3, base = 0.45, top = base + FL * 3;
  const plaster = std({ map: T.plasterTexture(), color: 0xf4f2ed, roughness: 0.95 });
  const greyStone = std({ map: T.graniteTexture(), color: 0x8d8c88 });
  const bandMat = std({ color: 0xd9d6cf });
  add(scene, slab(offsetPoly(H, 0.04), 0, base), greyStone);
  add(scene, slab(H, base, top + 0.2), plaster);
  for (let k = 1; k <= 2; k++) add(scene, slab(offsetPoly(H, 0.08), base + FL * k - 0.12, base + FL * k + 0.12), bandMat);
  // roof slab + parapet + roof box
  add(scene, slab(offsetPoly(H, 0.1), top + 0.2, top + 0.35), bandMat);
  add(scene, slab(offsetPoly(H, 0.1), top + 0.35, top + 0.85, [offsetPoly(H, -0.15)]), plaster);
  add(scene, slab(rectPts(1.2, 14.8, 4.2, 17.4), top + 0.35, top + 3.0), plaster);
  add(scene, slab(rectPts(1.1, 14.7, 4.3, 17.5), top + 3.0, top + 3.15), bandMat);

  const E = edges(H);   // 0 north, 1 east, 2 south(main), 3 notch east-facing-west, 4 notch south, 5 west
  const fac = new Facade();
  const w = (e, s, wd, y0, h, o) => fac.window(E[e][0], E[e][1], E[e][2], s, wd, y0, h, o);
  for (let f = 0; f < 3; f++) {
    const y = base + FL * f;
    [2.0, 5.5, 9.0].forEach(s => w(0, s, 1.0, y + 1.1, 1.2));
    w(5, 2.65, 0.8, y + 1.0, 1.4);
    w(1, 5.6, 2.2, y + 0.9, 1.7, { mullions: 1 });
    if (f > 0) w(1, 1.3, 1.4, y + 0.9, 1.7);
    w(2, 2.5, f === 0 ? 4.2 : 3.8, y + 0.02, f === 0 ? 2.6 : 2.45, { mullions: f === 0 ? 3 : 2 });
    w(3, 1.25, f === 0 ? 1.2 : 0.9, y + (f === 0 ? 0.02 : 0.4), f === 0 ? 2.6 : 2.2);
    if (f === 0) w(4, 3.0, 4.6, y + 0.02, 2.6, { mullions: 3 });
    else { w(4, 1.6, 1.6, y + 0.8, 1.8, { mullions: 1 }); w(4, 4.4, 1.6, y + 0.8, 1.8, { mullions: 1 }); }
  }
  fac.build(scene, M.frame, M.glass);

  // front door (east facade, by the stepping stones) + canopy + steps
  const door = E[1], dz = door[0][1] + 1.3;
  add(scene, boxAt(11.03, base + 1.2, dz, 0.08, 2.4, 1.3), std({ map: T.woodTexture(0.12, 6, true), color: 0xb08a68 }));
  add(scene, boxAt(11.06, base + 1.2, dz - 0.66, 0.1, 2.5, 0.08), M.frame);
  add(scene, boxAt(11.06, base + 1.2, dz + 0.66, 0.1, 2.5, 0.08), M.frame);
  add(scene, boxAt(11.06, base + 2.45, dz, 0.1, 0.08, 1.4), M.frame);
  add(scene, boxAt(11.75, base + 2.75, dz + 0.2, 1.5, 0.16, 2.6), bandMat);
  add(scene, boxAt(11.3, 0.3, dz, 0.6, 0.3, 1.8), greyStone);
  add(scene, boxAt(11.45, 0.15, dz, 0.9, 0.3, 2.0), greyStone);

  // vertical timber slats on the east facade (2F-3F)
  const slats = [];
  for (let i = 0; i < 9; i++) slats.push(boxAt(11.09, base + FL + FL, door[0][1] + 2.65 + i * 0.12, 0.08, FL * 2 - 0.3, 0.05));
  add(scene, merge(slats), std({ map: T.woodTexture(0.1, 4), color: 0xc49a6c }));

  // 2F balcony on the south front, glass balustrade; Juliet rail on 3F
  const balc = (y, depth, x0, x1, zf) => {
    add(scene, boxAt((x0 + x1) / 2, y - 0.1, zf + depth / 2, x1 - x0, 0.2, depth), bandMat);
    add(scene, boxAt((x0 + x1) / 2, y + 0.55, zf + depth - 0.03, x1 - x0, 1.0, 0.03), M.railGlass, false, false);
    add(scene, boxAt((x0 + x1) / 2, y + 1.07, zf + depth - 0.03, x1 - x0, 0.05, 0.06), M.frame);
    add(scene, boxAt(x0 + 0.015, y + 0.55, zf + depth / 2, 0.03, 1.0, depth), M.railGlass, false, false);
    add(scene, boxAt(x1 - 0.015, y + 0.55, zf + depth / 2, 0.03, 1.0, depth), M.railGlass, false, false);
  };
  balc(base + FL, 1.3, 6.15, 10.85, 21.8);
  balc(base + FL * 2, 0.35, 6.4, 10.6, 21.8);
  balc(base + FL, 1.0, 0.3, 5.7, 19.3);
}

// ---------------------------------------------------------------- context buildings
function buildContext(scene, L, M) {
  const wallMat = std({ map: T.plasterTexture(), color: 0xe1ddd3 });
  add(scene, slab(L.neighbor, 0, 9.6), wallMat);
  add(scene, slab(L.neighbor, 9.6, 9.9), std({ color: 0xbfbab0 }));
  const fac = new Facade();
  const E = edges(L.neighbor);
  for (const [a, b, n] of E) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 3 || n[1] < 0.5 && n[0] < 0.5) continue;   // windows on south/east faces only
    for (let f = 0; f < 3; f++) for (let s = 1.6; s < len - 1; s += 3.2) fac.window(a, b, n, s, 1.3, 1.0 + f * 3.2, 1.4);
  }
  fac.build(scene, M.frame, M.glassDim);

  // 房子 (dashed on the plan): Songyang-style white wall, black tile gable roof
  const b = bbox(L.oldHouse);
  add(scene, slab(L.oldHouse, 0, 5.8), std({ map: T.plasterTexture(), color: 0xf0ede4 }));
  const w = b.x1 - b.x0, d = b.z1 - b.z0, ridge = 1.8;
  const roof = new THREE.BufferGeometry();
  const ov = 0.5, x0 = b.x0 - ov, x1 = b.x1 + ov, z0 = b.z0 - ov, z1 = b.z1 + ov, zc = (b.z0 + b.z1) / 2, y0 = 5.75, y1 = 5.75 + ridge;
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, zc, x0, y0, z0, x1, y1, zc, x0, y1, zc,
    x0, y1, zc, x1, y1, zc, x1, y0, z1, x0, y1, zc, x1, y0, z1, x0, y0, z1];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w, 0, w, 3, 0, 0, w, 3, 0, 3, 0, 3, w, 3, w, 0, 0, 3, w, 0, 0, 0], 2));
  roof.computeVertexNormals();
  const tile = T.roofTileTexture(); tile.repeat.set(0.8, 1.2);
  add(scene, roof, std({ map: tile, side: THREE.DoubleSide }));
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([b.x0, 5.8, b.z0, b.x0, 5.8, b.z1, b.x0, y1 - 0.05, zc, b.x1, 5.8, b.z1, b.x1, 5.8, b.z0, b.x1, y1 - 0.05, zc], 3));
  gable.computeVertexNormals();
  add(scene, gable, std({ color: 0xf0ede4, side: THREE.DoubleSide }));
  add(scene, boxAt((x0 + x1) / 2, y1 + 0.05, zc, x1 - x0, 0.14, 0.22), std({ color: 0x2d2f31 }));
  const f2 = new Facade();
  const e = edges(L.oldHouse);
  for (const [a, bb, n] of e) if (n[1] > 0.5 || n[0] > 0.5) {
    const len = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    for (let s = 1.2; s < len - 0.8; s += 2.2) { f2.window(a, bb, n, s, 0.8, 1.1, 1.0); f2.window(a, bb, n, s, 0.8, 3.9, 1.0); }
  }
  f2.build(scene, std({ color: 0x4a3426 }), M.glassDim);
}

// ---------------------------------------------------------------- 四方亭
function buildPavilion(scene, L, M) {
  const P = L.pavilion, pb = bbox(P.platform), bb = bbox(P.body);
  const floor = 0.45;
  const granite = std({ map: T.graniteTexture(), color: 0xcfcbc2 });
  add(scene, slab(P.platform, 0, floor), granite);
  // steps on the east side where the timber path arrives, and on the north
  add(scene, boxAt(pb.x1 + 0.2, 0.15, 39.2, 0.4, 0.3, 1.6), granite);
  add(scene, boxAt(pb.x1 + 0.4, 0.075, 39.2, 0.4, 0.15, 1.6), granite);
  const cx = bb.cx, cz = bb.cz, half = 1.25;
  const cols = [[cx - half, cz - half], [cx + half, cz - half], [cx + half, cz + half], [cx - half, cz + half]];
  const lacquer = std({ color: 0x6e2a1e, roughness: 0.55 });
  const colH = 2.75, topY = floor + colH;
  const cg = [], drum = [];
  for (const [x, z] of cols) {
    const c = new THREE.CylinderGeometry(0.11, 0.12, colH, 14); c.translate(x, floor + colH / 2, z); cg.push(c);
    const d = new THREE.CylinderGeometry(0.17, 0.19, 0.18, 14); d.translate(x, floor + 0.09, z); drum.push(d);
  }
  add(scene, merge(cg), lacquer);
  add(scene, merge(drum), granite);
  // beams (额枋) and hanging lattice (挂落)
  const beams = [], lattice = [];
  for (let i = 0; i < 4; i++) {
    const a = cols[i], b = cols[(i + 1) % 4];
    beams.push(wallBox(a, b, 0.16, topY - 0.3, topY));
    beams.push(wallBox(a, b, 0.12, topY - 0.62, topY - 0.52));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0.15; s < len - 0.1; s += 0.16) {
      const t = s / len, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      lattice.push(boxAt(x, topY - 0.41, z, 0.03, 0.2, 0.03));
    }
  }
  add(scene, merge(beams), lacquer);
  add(scene, merge(lattice), std({ color: 0x4e1f17 }));

  // 美人靠 along the north side
  const z0 = cz - half, seatY = floor + 0.45, seat = [], backs = [];
  seat.push(boxAt(cx, seatY, z0 + 0.1, half * 2 - 0.2, 0.06, 0.38));
  seat.push(boxAt(cx, floor + 0.22, z0 + 0.1, half * 2 - 0.2, 0.44, 0.06));
  for (let x = cx - half + 0.2; x <= cx + half - 0.2; x += 0.11) {
    const g = new THREE.BoxGeometry(0.035, 0.5, 0.035);
    g.translate(0, 0.25, 0); g.rotateX(-0.45); g.translate(x, seatY + 0.03, z0 - 0.06);
    backs.push(g);
  }
  const rail = new THREE.BoxGeometry(half * 2 - 0.3, 0.05, 0.08); rail.translate(0, 0.5, 0); rail.rotateX(-0.45); rail.translate(cx, seatY + 0.03, z0 - 0.06);
  backs.push(rail);
  add(scene, merge(seat), lacquer);
  add(scene, merge(backs), lacquer);

  // roof: concave pyramid (攒尖) with upturned corners
  const eave = 2.15, yE = topY + 0.05, rise = 1.75, lift = 0.42, NU = 24, NV = 14;
  const top = [], under = [];
  const pos = (u, v, k) => {
    const ang = k * Math.PI / 2, nx = Math.sin(ang), nz = -Math.cos(ang), tx = Math.cos(ang), tz = Math.sin(ang);
    const au = Math.abs(u), flare = 0.32 * au ** 4;
    const ex = cx + nx * (eave + flare) + tx * u * (eave + flare), ez = cz + nz * (eave + flare) + tz * u * (eave + flare);
    const x = ex + (cx - ex) * v, z = ez + (cz - ez) * v;
    const y = yE + rise * Math.pow(v, 1.7) + lift * au ** 4 * (1 - v) ** 2;
    return [x, y, z];
  };
  for (let k = 0; k < 4; k++) {
    const pt = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = -1 + 2 * i / NU, v = j / NV * 0.985;
      pt.push(...pos(u, v, k)); uv.push(u * 2.2, v * 3);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pt, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    top.push(g);
    const u2 = g.clone(); u2.translate(0, -0.1, 0);
    under.push(u2);
  }
  const tile = T.roofTileTexture(); tile.repeat.set(1.6, 1.2);
  add(scene, merge(top), std({ map: tile, side: THREE.DoubleSide, roughness: 0.7 }));
  add(scene, merge(under), std({ color: 0x5a2a1d, side: THREE.BackSide }), false);
  // hip ridges + finial
  const ridges = [];
  for (let k = 0; k < 4; k++) {
    const pts = [];
    for (let j = 0; j <= 16; j++) { const p = pos(1, j / 16 * 0.985, k); pts.push(new THREE.Vector3(p[0], p[1] + 0.05, p[2])); }
    ridges.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 6));
    const tipP = pos(1.04, 0, k);
    const tip = new THREE.ConeGeometry(0.07, 0.35, 6); tip.rotateZ(0.5); tip.rotateY(-k * Math.PI / 2 - Math.PI / 4); tip.translate(tipP[0], tipP[1] + 0.12, tipP[2]);
    ridges.push(tip);
  }
  const fin = new THREE.SphereGeometry(0.16, 12, 8); fin.translate(cx, yE + rise + 0.18, cz); ridges.push(fin);
  const fin2 = new THREE.CylinderGeometry(0.05, 0.12, 0.35, 10); fin2.translate(cx, yE + rise + 0.42, cz); ridges.push(fin2);
  add(scene, merge(ridges), std({ color: 0x2f3133, roughness: 0.6 }));
  // ceiling inside
  add(scene, boxAt(cx, topY + 0.02, cz, half * 2 + 0.2, 0.04, half * 2 + 0.2), std({ color: 0x5a2a1d }), false);
  return { lantern: [cx, topY - 0.5, cz] };
}

// ---------------------------------------------------------------- 花架
function buildPergola(scene, L) {
  const P = L.pergola, wood = std({ color: 0x4a3426, roughness: 0.75 });
  const g = [];
  P.beams.forEach((z, i) => {
    if (i % 2 === 0) for (const x of [P.x0, P.x1]) g.push(boxAt(x, 1.3, z, 0.16, 2.6, 0.16));
    g.push(boxAt((P.beamX[0] + P.beamX[1]) / 2, 2.98, z, P.beamX[1] - P.beamX[0] + 0.3, 0.2, 0.08));
  });
  for (const x of [P.x0, P.x1]) g.push(boxAt(x, 2.72, (P.z0 + P.z1) / 2, 0.14, 0.24, P.z1 - P.z0));
  for (let x = P.beamX[0] + 0.25; x < P.beamX[1]; x += 0.42) g.push(boxAt(x, 3.11, (P.z0 + P.z1) / 2, 0.05, 0.06, P.z1 - P.z0 + 0.2));
  add(scene, merge(g), wood);
  return P;
}

// ---------------------------------------------------------------- perimeter: low wall + hedge, gates
function buildPerimeter(scene, L, M, hedgeOut) {
  const B = L.boundary;
  const gateX = [L.gates[0].x0, L.gates[0].x1];
  const segs = [];   // [a, b, withHedge, hedgeRange(along t0..t1)]
  const push = (a, b, hedge = true, t0 = 0, t1 = 1) => segs.push({ a, b, hedge, t0, t1 });
  // north (east part only; west part is buildings)
  push([B[0][0], 0], [gateX[0] - 0.3, 0]);
  push([gateX[1] + 0.3, 0], [B[1][0], 0], false);
  push(B[1], B[2]);                                         // east
  push([B[2][0], B[2][1]], [gateX[1] + 0.3, B[2][1]], false);
  push([gateX[0] - 0.3, B[2][1]], B[3]);                    // south
  push(B[3], B[4], true, (B[3][1] - 52.7) / (B[3][1] - B[4][1]), 1);   // no hedge beside the planter / SW corner
  push(B[4], B[5]); push(B[5], B[6]); push(B[6], B[7]);
  push(B[7], [0, 19.3]);
  push([0, 14.0], B[8], false);
  push(B[9], B[0], false);

  const wall = [], cap = [], hedge = [];
  const interior = (x, z) => {
    let inside = false;
    for (let i = 0, j = B.length - 1; i < B.length; j = i++) {
      const [xi, zi] = B[i], [xj, zj] = B[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const s of segs) {
    const { a, b } = s, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    wall.push(wallBox(a, b, 0.24, 0, 0.62));
    cap.push(wallBox(a, b, 0.34, 0.62, 0.7));
    if (!s.hedge) continue;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    let nx = -uz, nz = ux;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (!interior(mx + nx * 0.5, mz + nz * 0.5)) { nx = -nx; nz = -nz; }
    for (let t = s.t0 * len + 0.2; t < s.t1 * len - 0.2; t += 0.32) {
      hedgeOut.push([a[0] + ux * t + nx * 0.42, a[1] + uz * t + nz * 0.42, Math.atan2(uz, ux)]);
    }
  }
  add(scene, merge(wall), std({ map: T.plasterTexture(), color: 0xf2f0ea }));
  add(scene, merge(cap), std({ color: 0x45484b, roughness: 0.7 }));

  // gates: stone piers + double timber leaves, opened inward
  const piers = [], leaves = [];
  for (const g of L.gates) {
    const inward = g.z < 1 ? 1 : -1;
    for (const x of [g.x0 - 0.15, g.x1 + 0.15]) {
      piers.push(boxAt(x, 1.1, g.z, 0.45, 2.2, 0.45));
      piers.push(boxAt(x, 2.27, g.z, 0.6, 0.14, 0.6));
    }
    const lw = (g.x1 - g.x0) / 2 - 0.05;
    [[g.x0 + 0.05, 1], [g.x1 - 0.05, -1]].forEach(([hx, dir]) => {
      const ang = -1.2 * dir * inward;
      const frame = [];
      frame.push(boxAt(lw / 2, 1.55, 0, lw, 0.08, 0.06), boxAt(lw / 2, 0.15, 0, lw, 0.08, 0.06), boxAt(lw / 2, 0.85, 0, lw, 0.06, 0.05));
      for (let x = 0.05; x < lw; x += 0.14) frame.push(boxAt(x, 0.85, 0, 0.05, 1.4, 0.04));
      const leaf = merge(frame);
      if (dir < 0) leaf.rotateY(Math.PI);
      leaf.rotateY(ang);
      leaf.translate(hx, 0, g.z);
      leaves.push(leaf);
    });
  }
  add(scene, merge(piers), std({ map: T.graniteTexture(), color: 0xbdb9b0 }));
  add(scene, merge(leaves), std({ map: T.woodTexture(0.1, 4, true), color: 0xa08068 }));
}

// ---------------------------------------------------------------- small furniture
function buildFurniture(scene, L, M) {
  const granite = std({ map: T.graniteTexture(), color: 0xd2cec6 });
  const g = [];
  const [tx, tz] = L.patioTable;
  const top = new THREE.CylinderGeometry(0.6, 0.6, 0.1, 28); top.translate(tx, 0.12 + 0.68, tz); g.push(top);
  const ped = new THREE.CylinderGeometry(0.22, 0.3, 0.62, 18); ped.translate(tx, 0.12 + 0.31, tz); g.push(ped);
  for (const [x, z] of L.stools) {
    const s = new THREE.CylinderGeometry(0.17, 0.2, 0.42, 16); s.translate(x, 0.12 + 0.21, z); g.push(s);
  }
  const sb = bbox(L.stoneBench);
  g.push(boxAt(sb.cx, 0.42, sb.cz, sb.x1 - sb.x0, 0.1, sb.z1 - sb.z0));
  g.push(boxAt(sb.cx, 0.19, sb.z0 + 0.25, sb.x1 - sb.x0 - 0.2, 0.38, 0.18));
  g.push(boxAt(sb.cx, 0.19, sb.z1 - 0.25, sb.x1 - sb.x0 - 0.2, 0.38, 0.18));
  add(scene, merge(g), granite);
}

// ---------------------------------------------------------------- lamp posts
function buildLamps(scene, L, M) {
  const metal = std({ color: 0x2c2e30, roughness: 0.5, metalness: 0.4 });
  const stone = std({ map: T.graniteTexture(), color: 0xc8c4bb });
  const m = [], s = [], glass = [];
  for (const [x, z] of L.lamps) {
    s.push(boxAt(x, 0.15, z, 0.36, 0.3, 0.36));
    m.push(boxAt(x, 1.3, z, 0.09, 2.0, 0.09));
    m.push(boxAt(x, 2.32, z, 0.34, 0.04, 0.34), boxAt(x, 2.82, z, 0.46, 0.05, 0.46), boxAt(x, 2.88, z, 0.3, 0.06, 0.3));
    for (const dx of [-0.15, 0.15]) for (const dz of [-0.15, 0.15]) m.push(boxAt(x + dx, 2.57, z + dz, 0.035, 0.5, 0.035));
    glass.push(boxAt(x, 2.57, z, 0.27, 0.46, 0.27));
  }
  add(scene, merge(m), metal);
  add(scene, merge(s), stone);
  const gm = std({ color: 0xfff2d6, emissive: 0xffc98a, emissiveIntensity: 0.15, roughness: 0.3 });
  add(scene, merge(glass), gm, false);
  return gm;
}

// ---------------------------------------------------------------- cars (scale reference)
function buildCars(scene, L) {
  const colors = [0xe9e9e6, 0x7d8288, 0x2d3d55, 0xb9bcbf];
  const glass = std({ color: 0x1d2730, roughness: 0.15, metalness: 0.3 });
  const tyre = std({ color: 0x1b1b1b });
  L.cars.forEach((c, i) => {
    const grp = new THREE.Group();
    const body = std({ color: colors[i % 4], roughness: 0.35, metalness: 0.5 });
    const parts = [boxAt(0, 0.62, 0, 4.6, 0.6, 1.82), boxAt(0, 0.4, 0, 4.7, 0.25, 1.78)];
    const cab = boxAt(-0.25, 1.15, 0, 2.5, 0.5, 1.6);
    const mb = new THREE.Mesh(merge(parts), body); mb.castShadow = true;
    const mc = new THREE.Mesh(cab, glass); mc.castShadow = true;
    const roofG = boxAt(-0.3, 1.42, 0, 2.2, 0.06, 1.55);
    const mr = new THREE.Mesh(roofG, body);
    const wh = [];
    for (const x of [-1.45, 1.45]) for (const z of [-0.85, 0.85]) {
      const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16); w.rotateX(Math.PI / 2); w.translate(x, 0.34, z); wh.push(w);
    }
    const mw = new THREE.Mesh(merge(wh), tyre);
    grp.add(mb, mc, mr, mw);
    grp.position.set(c.x, 0.02, c.z);
    grp.rotation.y = c.rot === 90 ? 0 : Math.PI / 2;
    scene.add(grp);
  });
}

export function buildStructures(scene, L) {
  const M = {
    frame: std({ color: 0x33363a, roughness: 0.5, metalness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x8fa6b2, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.6, transparent: true, opacity: 0.88 }),
    glassDim: std({ color: 0x5a6a74, roughness: 0.2, metalness: 0.2 }),
    railGlass: new THREE.MeshPhysicalMaterial({ color: 0xcfe3ea, roughness: 0.05, transparent: true, opacity: 0.25 }),
  };
  const hedge = [];
  buildHouse(scene, L, M);
  buildContext(scene, L, M);
  const pav = buildPavilion(scene, L, M);
  const pergola = buildPergola(scene, L);
  buildPerimeter(scene, L, M, hedge);
  buildFurniture(scene, L, M);
  const lampMat = buildLamps(scene, L, M);
  buildCars(scene, L);
  return { hedge, lampMat, pavilionLantern: pav.lantern, pergola };
}
