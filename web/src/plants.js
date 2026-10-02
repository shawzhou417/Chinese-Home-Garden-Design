// Procedural plants for a Songyang (浙西南) garden. Each species is a small set of
// template geometries (vertex-coloured blobs + trunks, plus alpha-textured fronds)
// drawn with InstancedMesh, so ~400 plants cost only a few dozen draw calls.
import * as THREE from 'three';
import * as T from './textures.js';
import { merge, noise3, windify, pointInPoly, bbox } from './util.js';

const C = (h) => new THREE.Color(h);

// ---------------------------------------------------------------- geometry helpers
function blobCrown(rand, blobs, { c1, c2, flower, rate = 0, detail = 2, y0 = 0, y1 = 3, jitter = 0.35, seed = 0, dot = 0.05 }) {
  const out = [];
  const a = C(c1), b = C(c2), tmp = new THREE.Color(), spots = [];
  for (const bl of blobs) {
    const g = new THREE.IcosahedronGeometry(bl.r, detail);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3);
    for (let j = 0; j < p.count; j++) {
      let x = p.getX(j), y = p.getY(j), z = p.getZ(j);
      const n = 1 + (noise3(x * 2.3 + seed, y * 2.3 + bl.x * 3, z * 2.3 + bl.z * 3) - 0.5) * jitter * 2;
      x = x * n + bl.x; y = y * n * (bl.sy || 1) + bl.y; z = z * n + bl.z;
      p.setXYZ(j, x, y, z);
      const t = THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
      tmp.copy(a).lerp(b, t).multiplyScalar(0.78 + 0.4 * noise3(x * 3.1 + seed, y * 3.1, z * 3.1));
      cols[j * 3] = tmp.r; cols[j * 3 + 1] = tmp.g; cols[j * 3 + 2] = tmp.b;
      if (flower && t > 0.2 && rand() < rate * 0.08) {
        const dx = x - bl.x, dy = y - bl.y, dz = z - bl.z, l = Math.hypot(dx, dy, dz) || 1;
        spots.push([x + dx / l * dot * 0.5, y + dy / l * dot * 0.5, z + dz / l * dot * 0.5]);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    out.push(g);
  }
  if (spots.length) {
    const fc = C(flower);
    for (const [x, y, z] of spots) {
      const d = new THREE.IcosahedronGeometry(dot * (0.7 + rand() * 0.6), 0);
      d.translate(x, y, z);
      const k = 0.85 + rand() * 0.3, n = d.attributes.position.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cols[i * 3] = fc.r * k; cols[i * 3 + 1] = fc.g * k; cols[i * 3 + 2] = fc.b * k; }
      d.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      out.push(d);
    }
  }
  return out;
}

function limb(a, b, r0, r1, color, seg = 6) {   // tapered cylinder between two points
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate(...a);
  const c = C(color), n = g.attributes.position.count, cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function ellipsoidBlobs(rand, n, R, cy, vr, rmin, rmax, sy = 1) {
  const res = [{ x: 0, y: cy, z: 0, r: R * 0.62, sy }];
  for (let i = 1; i < n; i++) {
    const a = rand() * Math.PI * 2, u = rand() * 2 - 1, rr = Math.pow(rand(), 0.4);
    const s = Math.sqrt(1 - u * u);
    res.push({ x: Math.cos(a) * s * R * 0.62 * rr, y: cy + u * vr * 0.55 * rr, z: Math.sin(a) * s * R * 0.62 * rr,
      r: R * (rmin + rand() * (rmax - rmin)), sy });
  }
  return res;
}

function tree(rand, { trunkH, trunkR, bark = 0x5b4636, R, cy, vr, n, c1, c2, flower, rate, branches = 3, sy = 1, detail = 2, stems = 1 }) {
  const parts = [];
  for (let s = 0; s < stems; s++) {
    const ox = stems > 1 ? Math.cos(s * 2.4) * 0.12 : 0, oz = stems > 1 ? Math.sin(s * 2.4) * 0.12 : 0;
    const top = [ox * 3, trunkH, oz * 3];
    parts.push(limb([ox, 0, oz], top, trunkR, trunkR * 0.7, bark));
  }
  const blobs = ellipsoidBlobs(rand, n, R, cy, vr, 0.32, 0.5, sy);
  for (let i = 0; i < branches; i++) {
    const b = blobs[1 + (i % (blobs.length - 1))];
    parts.push(limb([0, trunkH * 0.92, 0], [b.x * 0.8, b.y - b.r * 0.3, b.z * 0.8], trunkR * 0.6, trunkR * 0.3, bark, 5));
  }
  parts.push(...blobCrown(rand, blobs, { c1, c2, flower, rate, detail, y0: cy - vr, y1: cy + vr, seed: rand() * 50 }));
  return parts;
}

// Fronds: alpha-textured quads/ribbons, coloured white so the texture shows.
function ribbon(L, W, rise, droop, seg = 8) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, x = L * t, y = rise * t - droop * t * t, w = W * (1 - 0.55 * t) / 2;
    pos.push(x, y, -w, x, y, w);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function fan(size, tilt, yaw, at) {
  const g = new THREE.PlaneGeometry(size, size, 2, 2);
  g.translate(0, size / 2, 0);
  const p = g.attributes.position;   // cup the fan a little
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.25 - p.getY(i) * 0.05);
  g.rotateX(-tilt); g.rotateY(yaw); g.translate(...at);
  g.computeVertexNormals();
  return g;
}

function crossPlanes(w, h, n, at = [0, 0, 0], yaw0 = 0) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0); g.rotateY(yaw0 + i * Math.PI / n); g.translate(...at);
    list.push(g);
  }
  return list;
}

// ---------------------------------------------------------------- species templates
// Each returns { solid: [geoms], leaf: [geoms] (optional), leafTex, H }
const SPECIES = {
  osmanthus: (r, v) => ({ H: 3.4, solid: tree(r, { trunkH: 1.0, trunkR: 0.09, R: 1.25, cy: 2.15, vr: 1.15, n: 8, c1: 0x203d18, c2: 0x4d7a32, flower: v === 1 ? 0xe8c25a : null, rate: 0.05, dot: 0.035 }) }),
  camphor: (r, v) => ({ H: 7, solid: tree(r, { trunkH: 2.8, trunkR: 0.2, bark: 0x4f3e30, R: 2.8, cy: 4.9, vr: 1.7, n: 13, c1: 0x335a24, c2: v ? 0x7fa544 : 0x6e9a3c, branches: 5 }) }),
  smalltree: (r, v) => {
    const sp = [
      { c1: 0x1d3818, c2: 0x3d6a2b, flower: 0xd8325a, rate: 0.2, dot: 0.045 },   // 山茶
      { c1: 0x24421d, c2: 0x4b7833, flower: 0x7a1830, rate: 0.05, dot: 0.035 },   // 杨梅
      { c1: 0x2f5626, c2: 0x5f8f3a, flower: 0xe7c43c, rate: 0.035, dot: 0.08 },   // 柚子
    ][v];
    return { H: 2.6, solid: tree(r, { trunkH: 0.8, trunkR: 0.07, R: 0.95, cy: 1.65, vr: 0.85, n: 7, ...sp }) };
  },
  maple: (r, v) => ({ H: 3.2, solid: tree(r, { trunkH: 1.3, trunkR: 0.07, bark: 0x4a3a33, R: 1.35, cy: 2.35, vr: 0.7, n: 9, sy: 0.6,
    c1: [0x7a1714, 0x9c3d17, 0x3f6424][v], c2: [0xd23a26, 0xe58a35, 0x9cc04a][v], branches: 5 }) }),
  crapemyrtle: (r) => ({ H: 3.2, solid: tree(r, { trunkH: 1.5, trunkR: 0.05, bark: 0xb19a84, R: 1.05, cy: 2.35, vr: 0.75, n: 8, stems: 3,
    c1: 0x3b6629, c2: 0x5c8c3a, flower: 0xc757a9, rate: 0.35, dot: 0.07 }) }),
  ballshrub: (r, v) => ({ H: 0.9, solid: blobCrown(r, [{ x: 0, y: 0.42, z: 0, r: 0.46, sy: 0.92 }], v === 0
    ? { c1: 0x3a5c28, c2: 0xb6412c, detail: 2, y0: 0.1, y1: 0.85, jitter: 0.12 }
    : { c1: 0x335a26, c2: 0x6b9b45, detail: 2, y0: 0.1, y1: 0.85, jitter: 0.12 }) }),
  shrub: (r, v) => ({ H: 0.6, solid: blobCrown(r, [{ x: 0, y: 0.26, z: 0, r: 0.3, sy: 0.85 }, { x: 0.15, y: 0.22, z: 0.08, r: 0.22, sy: 0.85 }], [
    { c1: 0x2c4e22, c2: 0x55843a, flower: 0xe8609b, rate: 0.5, detail: 1, y0: 0, y1: 0.55, dot: 0.05 },
    { c1: 0x203d1a, c2: 0x3f6a2d, flower: 0xf6f3e8, rate: 0.3, detail: 1, y0: 0, y1: 0.55, dot: 0.045 },
    { c1: 0x2a4a20, c2: 0x527d36, detail: 1, y0: 0, y1: 0.55, jitter: 0.15 },
  ][v]) }),
  hydrangea: (r, v) => ({ H: 0.9, solid: blobCrown(r, [{ x: 0, y: 0.4, z: 0, r: 0.38 }, { x: 0.25, y: 0.33, z: 0.1, r: 0.3 }, { x: -0.18, y: 0.32, z: 0.2, r: 0.3 }],
    { c1: 0x2c5222, c2: 0x5a8a3c, flower: v ? 0xa77ad6 : 0x7c95dc, rate: 0.9, detail: 1, y0: 0, y1: 0.8, dot: 0.06 }) }),
  flowers: (r, v) => ({ H: 0.5, solid: blobCrown(r, [{ x: 0, y: 0.22, z: 0, r: 0.22 }, { x: 0.12, y: 0.2, z: -0.08, r: 0.17 }],
    { c1: 0x2e5224, c2: 0x4f7e35, flower: [0xc9283b, 0xf08aa8, 0xf4d24a][v], rate: 0.6, detail: 1, y0: 0, y1: 0.4, dot: 0.045 }) }),
  palm: (r) => {   // 棕榈 Trachycarpus fortunei
    const solid = [limb([0, 0, 0], [0.08, 3.6, 0.04], 0.14, 0.12, 0x4d3b2c, 8)];
    const leaf = [];
    for (let i = 0; i < 18; i++) {
      const yaw = i * 2.39996, tilt = 0.5 + (i % 3) * 0.35 + r() * 0.2, len = 0.55;
      const dir = [Math.sin(yaw), Math.cos(yaw)];
      const tip = [0.08 + dir[0] * len * Math.sin(tilt), 3.6 + len * Math.cos(tilt) * 0.6, 0.04 + dir[1] * len * Math.sin(tilt)];
      solid.push(limb([0.08, 3.55, 0.04], tip, 0.02, 0.015, 0x6b6a3a, 4));
      leaf.push(fan(1.25, tilt + 0.3, yaw, tip));
    }
    return { H: 4.6, solid, leaf, leafTex: 'palm' };
  },
  cycad: (r) => {   // 苏铁
    const solid = [limb([0, 0, 0], [0, 0.55, 0], 0.17, 0.15, 0x4e4232, 8)];
    const leaf = [];
    for (let i = 0; i < 16; i++) {
      const g = ribbon(1.0 + r() * 0.2, 0.34, 0.75 + r() * 0.3, 0.9 + r() * 0.3);
      g.rotateY(i * 2.39996); g.translate(0, 0.52, 0);
      leaf.push(g);
    }
    return { H: 1.4, solid, leaf, leafTex: 'cycad' };
  },
  rhapis: (r) => {   // 棕竹 clump
    const solid = [], leaf = [];
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.3, h = 1.2 + r() * 0.8;
      const base = [Math.cos(a) * d, 0, Math.sin(a) * d], top = [base[0] * 1.6, h, base[2] * 1.6];
      solid.push(limb(base, top, 0.018, 0.014, 0x5c5a32, 4));
      for (let k = 0; k < 3; k++) leaf.push(fan(0.5, 0.6 + r() * 0.6, r() * Math.PI * 2, [top[0], top[1] - k * 0.25, top[2]]));
    }
    return { H: 2.0, solid, leaf, leafTex: 'palm' };
  },
};
const VARIANTS = { osmanthus: 2, camphor: 2, smalltree: 3, maple: 3, crapemyrtle: 1, ballshrub: 2, shrub: 3, hydrangea: 2, flowers: 3, palm: 1, cycad: 1, rhapis: 1 };
const REF = {   // plan radius (m) that maps to scale 1, and clamp range
  osmanthus: [0.65, 0.85, 1.2], camphor: [1.0, 0.9, 1.3], smalltree: [0.52, 0.8, 1.25], maple: [0.62, 0.8, 1.3],
  crapemyrtle: [0.45, 0.9, 1.1], ballshrub: [0.4, 0.9, 1.2], shrub: [0.2, 0.75, 1.4], hydrangea: [0.35, 0.8, 1.4],
  flowers: [0.2, 1, 1], palm: [1.35, 0.9, 1.1], cycad: [0.62, 0.85, 1.2], rhapis: [0.5, 0.85, 1.5],
};

// ---------------------------------------------------------------- build everything
export function buildPlants(scene, L, extra, Q) {
  const rand = T.rng(5);
  const solidMat = (amp) => windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), amp, 0.6);
  const leafTex = { palm: T.palmFanTexture(), cycad: T.featherTexture(100, 24), bamboo: T.bambooLeafTexture(),
    grass: T.grassBladeTexture(55), iris: T.grassBladeTexture(95) };
  const leafMat = (tex, amp) => windify(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), amp, 0.3);
  const group = new THREE.Group();
  scene.add(group);

  const buckets = new Map();
  const addInst = (key, x, y, z, s, rot) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push([x, y, z, s, rot]);
  };
  const raised = (x, z) => (pointInPoly(x, z, extra.planterInner) ? 0.4 : 0);

  L.plants.forEach((p, i) => {
    const nv = VARIANTS[p.kind];
    const v = Math.floor(rand() * nv);
    const [ref, lo, hi] = REF[p.kind];
    const s = THREE.MathUtils.clamp(p.r / ref, lo, hi) * (0.93 + rand() * 0.14);
    addInst(`${p.kind}:${v}`, p.x, raised(p.x, p.z), p.z, s, rand() * Math.PI * 2);
  });
  // planter: low flowering bedding between the crape myrtles
  {
    const b = bbox(extra.planterInner);
    for (let z = b.z0 + 0.3; z < b.z1 - 0.2; z += 0.42) for (let x = b.x0 + 0.25; x < b.x1 - 0.15; x += 0.45) {
      if (L.plants.some(p => p.kind === 'crapemyrtle' && Math.hypot(p.x - x, p.z - z) < 0.7)) continue;
      addInst(`flowers:${Math.floor(rand() * 3)}`, x + (rand() - 0.5) * 0.15, 0.4, z + (rand() - 0.5) * 0.15, 0.8 + rand() * 0.3, rand() * 6.28);
    }
  }
  // vegetable rows
  {
    const vb = bbox(L.veg);
    for (const x of extra.vegRows) for (let z = vb.z0 + 0.8; z < vb.z1 - 0.7; z += 0.38) {
      addInst('veg:0', x + (rand() - 0.5) * 0.1, 0.18, z, 0.8 + rand() * 0.4, rand() * 6.28);
    }
  }
  SPECIES.veg = (r) => ({ H: 0.4, solid: blobCrown(r, [{ x: 0, y: 0.08, z: 0, r: 0.17, sy: 0.7 }], { c1: 0x3f7a2a, c2: 0x9ccc5c, detail: 1, y0: 0, y1: 0.2 }) });

  // templates -> instanced meshes
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const meshes = [];
  for (const [key, list] of buckets) {
    const [kind, v] = key.split(':');
    const tpl = SPECIES[kind](T.rng(kind.length * 31 + +v * 7 + 3), +v);
    const amp = 0.1 / Math.pow(Math.max(1, tpl.H - 0.6), 2);
    const parts = [[merge(tpl.solid), solidMat(amp)]];
    if (tpl.leaf) parts.push([merge(tpl.leaf), leafMat(leafTex[tpl.leafTex], amp * 1.5)]);
    for (const [geo, mat] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, z, s, rot], i) => {
        q.setFromAxisAngle(up, rot);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.95 + ((i * 17) % 10) / 100), s));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.receiveShadow = true;
      group.add(im); meshes.push(im);
    }
  }

  // ---------------- hedge along the low wall
  {
    const g = blobCrown(T.rng(3), [{ x: 0, y: 0.6, z: 0, r: 0.5, sy: 1.25 }], { c1: 0x24421b, c2: 0x4c7a33, detail: 1, y0: 0, y1: 1.2, jitter: 0.18 })[0];
    g.scale(0.5, 1, 0.62);
    const im = new THREE.InstancedMesh(g, solidMat(0.01), extra.hedge.length);
    extra.hedge.forEach(([x, z, a], i) => {
      q.setFromAxisAngle(up, -a);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1 + rand() * 0.15, 0.95 + rand() * 0.1, 1));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true; group.add(im);
  }

  // ---------------- SW corner (free design): 早园竹 grove + 茶 rows
  {
    const culms = [], leaves = [];
    const cr = T.rng(77);
    const spots = [];
    for (let z = 52.9; z < 56.5; z += 0.32) spots.push([7.95 + cr() * 0.55, z]);
    for (let x = 8.3; x < 10.6; x += 0.34) spots.push([x, 56.25 + cr() * 0.3]);
    for (const [x, z] of spots) {
      const h = 4.2 + cr() * 2.2, lean = [(cr() - 0.3) * 0.5, (cr() - 0.6) * 0.4];
      const top = [x + lean[0], h, z + lean[1]];
      culms.push(limb([x, 0, z], top, 0.028, 0.018, cr() < 0.3 ? 0x8a9a4a : 0x5f8236, 5));
      for (let k = 0; k < 5; k++) {
        const t = 0.45 + k * 0.12, at = [x + lean[0] * t, h * t, z + lean[1] * t];
        leaves.push(...crossPlanes(0.9, 0.8, 2, [at[0], at[1] - 0.2, at[2]], cr() * 3));
      }
    }
    const cm = new THREE.Mesh(merge(culms), solidMat(0.004)); cm.castShadow = true; group.add(cm);
    const lm = new THREE.Mesh(merge(leaves), leafMat(leafTex.bamboo, 0.006)); lm.castShadow = true; group.add(lm);
    // tea rows (松阳是茶乡)
    const tea = [];
    for (const x of [9.0, 9.65, 10.25]) for (let z = 54.1; z < 56.0; z += 0.3) {
      if (!pointInPoly(x, z, L.swCorner)) continue;
      tea.push(...blobCrown(cr, [{ x, y: 0.42, z, r: 0.36, sy: 1.1 }], { c1: 0x24461c, c2: 0x7fae46, detail: 1, y0: 0.1, y1: 0.85, jitter: 0.12 }));
    }
    const tm = new THREE.Mesh(merge(tea), solidMat(0.01)); tm.castShadow = tm.receiveShadow = true; group.add(tm);
  }

  // ---------------- SE corner ornamental grasses, pond-edge irises
  {
    const gr = [], ir = [], r2 = T.rng(55);
    const b = bbox(L.seGrass);
    let n = 0;
    while (n < 26) {
      const x = b.x0 + r2() * (b.x1 - b.x0), z = b.z0 + r2() * (b.z1 - b.z0);
      if (!pointInPoly(x, z, L.seGrass)) continue;
      gr.push(...crossPlanes(0.9, 0.95 + r2() * 0.3, 3, [x, 0, z], r2() * 3)); n++;
    }
    const P = L.pond;
    for (let i = 0; i < P.length; i += 2) {
      const [x, z] = P[i];
      ir.push(...crossPlanes(0.6, 0.85 + r2() * 0.3, 3, [x + (r2() - 0.5) * 0.3, -0.12, z + (r2() - 0.5) * 0.3], r2() * 3));
    }
    const gm = new THREE.Mesh(merge(gr), leafMat(leafTex.grass, 0.08)); gm.castShadow = true; group.add(gm);
    const im = new THREE.Mesh(merge(ir), leafMat(leafTex.iris, 0.06)); group.add(im);
  }

  // ---------------- wisteria on the pergola
  {
    const P = extra.pergola, wr = T.rng(66);
    const canopy = [], racemes = [], vines = [];
    for (let z = P.z0 + 0.2; z < P.z1; z += 0.55) for (let x = P.beamX[0] + 0.2; x < P.beamX[1]; x += 0.6) {
      if (wr() < 0.25) continue;
      canopy.push(...blobCrown(wr, [{ x, y: 3.2, z, r: 0.34 + wr() * 0.16, sy: 0.45 }], { c1: 0x2a5022, c2: 0x55843a, detail: 1, y0: 3.0, y1: 3.4 }));
    }
    const top = C(0xa58ddd), bot = C(0x5a3a9c), t = new THREE.Color();
    for (let z = P.z0 + 0.1; z < P.z1; z += 0.2) for (let x = P.beamX[0] + 0.3; x < P.beamX[1] - 0.2; x += 0.17) {
      if (wr() < 0.4) continue;
      const len = 0.14 + wr() * 0.2, y = 2.86 + wr() * 0.08;
      const c = new THREE.ConeGeometry(0.035 + wr() * 0.015, len, 6); c.rotateX(Math.PI);
      c.translate(x + (wr() - 0.5) * 0.12, y - len / 2, z + (wr() - 0.5) * 0.12);
      const p = c.attributes.position, cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { t.copy(top).lerp(bot, THREE.MathUtils.clamp((y - p.getY(i)) / len, 0, 1)); cols[i * 3] = t.r; cols[i * 3 + 1] = t.g; cols[i * 3 + 2] = t.b; }
      c.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      racemes.push(c);
    }
    for (const [x, z] of [[P.x0, P.beams[0]], [P.x1, P.beams[4]], [P.x0, P.beams[8]], [P.x1, P.beams[10]]]) {
      const pts = [];
      for (let k = 0; k <= 20; k++) { const t = k / 20; pts.push(new THREE.Vector3(x + Math.cos(t * 14) * 0.12, t * 3.0, z + Math.sin(t * 14) * 0.12)); }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.04, 5);
      const vc = C(0x4b3a2c), n = tg.attributes.position.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cols[i * 3] = vc.r; cols[i * 3 + 1] = vc.g; cols[i * 3 + 2] = vc.b; }
      tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      vines.push(tg);
    }
    const cm = new THREE.Mesh(merge(canopy), solidMat(0.004)); cm.castShadow = true; group.add(cm);
    const rm = new THREE.Mesh(merge(racemes), solidMat(0.01)); group.add(rm);
    const vm = new THREE.Mesh(merge(vines), solidMat(0)); vm.castShadow = true; group.add(vm);
  }
  return group;
}
