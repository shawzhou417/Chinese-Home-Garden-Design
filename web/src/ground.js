import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water2.js';
import * as T from './textures.js';
import { flat, slab, merge, paint, noise3, bbox, pointInPoly, centroid, rectPts, shapeOf } from './util.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });

function mesh(g, m, { cast = false, receive = true } = {}) {
  const me = new THREE.Mesh(g, m);
  me.castShadow = cast; me.receiveShadow = receive;
  return me;
}

// Irregular rock from an icosahedron, flattened at the bottom.
export function rockGeometry(rx, rz, h, seed, color = 0x8a8478) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, c = new THREE.Color(color), cols = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.75 + 0.5 * noise3(x * 1.7 + seed, y * 1.7 + seed * 0.3, z * 1.7);
    x *= n * rx; z *= n * rz; y = y * n * h;
    if (y < 0) y *= 0.15;
    p.setXYZ(i, x, y, z);
    const k = 0.8 + 0.35 * noise3(x * 3 + seed, y * 3, z * 3);
    cols.push(c.r * k, c.g * k, c.b * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

export function buildGround(scene, L, Q) {
  const out = { animate: [] };
  const grassTex = T.grassTexture();

  // ---------------- surroundings
  const farTex = T.grassTexture(); farTex.repeat.set(1 / 6, 1 / 6);
  // cut the property out so the sunken pond basin is not covered
  const far = mesh(flat(rectPts(-260, -260, 290, 330), -0.03, [L.boundary]), std({ map: farTex, color: 0x8f9470 }));
  scene.add(far);
  const concrete = T.concreteTexture();
  const roadMat = std({ map: concrete, color: 0x9a9890 });
  scene.add(mesh(flat(rectPts(-80, -5.6, 110, -0.25), 0.0), roadMat));      // 北侧村道
  scene.add(mesh(flat(rectPts(-80, 66.05, 110, 71.4), 0.0), roadMat));      // 南侧村道

  // distant hills (Songyang is ringed by mountains)
  const hills = [];
  const r = T.rng(7);
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + r() * 0.2, d = 230 + r() * 140;
    const g = rockGeometry(60 + r() * 70, 50 + r() * 60, 25 + r() * 55, i * 3.1, 0x5f7a55);
    g.translate(11 + Math.cos(a) * d, -2, 33 + Math.sin(a) * d);
    hills.push(g);
  }
  const hillMesh = mesh(merge(hills), std({ vertexColors: true, flatShading: true, roughness: 1 }), { receive: false });
  scene.add(hillMesh);

  // ---------------- property surfaces
  scene.add(mesh(flat(L.boundary, 0, [L.pond]), std({ map: grassTex })));
  scene.add(mesh(flat(L.road, 0.02), roadMat));
  const gc = T.groundcoverTexture();
  scene.add(mesh(flat(L.bed, 0.012), std({ map: gc })));
  scene.add(mesh(flat(L.swCorner, 0.012), std({ map: gc })));
  scene.add(mesh(flat(L.seGrass, 0.014), std({ map: T.gravelTexture() })));

  const edge = std({ color: 0x8f8c84 });
  const patio = new THREE.Mesh(slab(L.patio, 0, 0.12), [std({ map: T.tileTexture(0.38, 4) }), edge]);
  patio.receiveShadow = true; scene.add(patio);
  const strip = new THREE.Mesh(slab(L.pavedStrip, 0, 0.08), [std({ map: T.tileTexture(0.5, 4), color: 0xd8d4cc }), edge]);
  strip.receiveShadow = true; scene.add(strip);
  const wood = T.woodTexture(0.14, 8);
  const deck = new THREE.Mesh(slab(L.boardwalk, 0, 0.18), [std({ map: wood }), std({ color: 0x5b3d26 })]);
  deck.receiveShadow = true; deck.castShadow = true; scene.add(deck);
  const peb = new THREE.Mesh(slab(L.pebble, 0, 0.05), [std({ map: T.pebbleTexture() }), edge]);
  peb.receiveShadow = true; scene.add(peb);

  // vegetable plot: soil with raised rows
  const soil = T.soilTexture();
  scene.add(mesh(flat(L.veg, 0.01), std({ map: soil })));
  const vb = bbox(L.veg), rows = [];
  for (let x = vb.x0 + 0.55; x < vb.x1 - 0.4; x += 1.15) rows.push(slab(rectPts(x - 0.4, vb.z0 + 0.6, x + 0.4, vb.z1 - 0.6), 0, 0.2));
  scene.add(mesh(merge(rows), std({ map: soil, color: 0xd0c0b0 })));
  out.vegRows = rows.map((_, i) => vb.x0 + 0.55 + i * 1.15);

  // parking planter: granite curb, soil
  const pb = bbox(L.planter);
  const inner = rectPts(pb.x0 + 0.15, pb.z0 + 0.15, pb.x1 - 0.15, pb.z1 - 0.15);
  scene.add(mesh(slab(L.planter, 0, 0.45, [inner]), std({ map: T.graniteTexture(), color: 0xc9c6bf }), { cast: true }));
  scene.add(mesh(flat(inner, 0.4), std({ map: soil })));
  out.planterInner = inner;

  // ---------------- stepping stones / planks / upright slabs (instanced)
  const granite = T.graniteTexture();
  const stoneMat = std({ map: granite, color: 0xd6d2ca, roughness: 0.85 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const inst = (items, mat, h, y0 = 0) => {
    const im = new THREE.InstancedMesh(box, mat, items.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, -it.a);
      m4.compose(new THREE.Vector3(it.x, y0 + h / 2, it.z), q, new THREE.Vector3(it.l, h, it.w));
      im.setMatrixAt(i, m4);
    });
    im.receiveShadow = true; im.castShadow = true;
    scene.add(im);
    return im;
  };
  inst(L.pavers, stoneMat, 0.07);
  inst(L.planks, std({ map: T.woodTexture(0.1, 4, true), roughness: 0.8 }), 0.06);
  // upright slate slabs: long side along z in plan, stand them up with varied heights
  {
    const im = new THREE.InstancedMesh(box, std({ color: 0x6f6d68, roughness: 0.95 }), L.slabs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    L.slabs.forEach((s, i) => {
      const h = 0.45 + ((i * 37) % 10) / 10 * 0.6;
      q.setFromEuler(new THREE.Euler(0, -s.a, ((i % 3) - 1) * 0.05));
      m4.compose(new THREE.Vector3(s.x, h / 2, s.z), q, new THREE.Vector3(s.l, h, s.w));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  }

  // ---------------- pond: basin, water, rock edging
  const basin = new THREE.Mesh(slab(L.pond, -0.7, 0.0), std({ color: 0x3b3a2c, side: THREE.BackSide }));
  scene.add(basin);
  scene.add(mesh(flat(L.pond, -0.68), std({ color: 0x55603f })));
  // Reflector/Refractor derive the mirror plane from the mesh transform, so keep the
  // geometry in local XY and rotate the mesh instead of baking the rotation in.
  const waterGeo = new THREE.ShapeGeometry(shapeOf(L.pond), 4);
  const placeWater = (m) => { m.rotation.x = -Math.PI / 2; m.position.y = -0.12; return m; };
  if (Q.reflections) {
    const water = new Water(waterGeo, {
      color: 0xd6e8de, scale: 0.6, flowDirection: new THREE.Vector2(0.6, 0.3), flowSpeed: 0.02,
      reflectivity: 0.5, textureWidth: 1024, textureHeight: 1024,
      normalMap0: T.waterNormalTexture(41), normalMap1: T.waterNormalTexture(42),
    });
    scene.add(placeWater(water));
    out.water = water;
  } else {
    const n0 = T.waterNormalTexture(41); n0.repeat.set(0.3, 0.3);
    const wm = new THREE.MeshPhysicalMaterial({ color: 0x2f5d58, roughness: 0.08, metalness: 0, normalMap: n0,
      normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.88, envMapIntensity: 1.2 });
    scene.add(placeWater(new THREE.Mesh(waterGeo, wm)));
    out.animate.push((t) => { n0.offset.set(t * 0.01, t * 0.006); });
  }

  // rocks: detected outlines from the plan + extra stones along the water edge
  const rocks = [], rr = T.rng(99);
  const pondC = centroid(L.pond);
  const placed = [];
  L.rocks.forEach((pts, i) => {
    const b = bbox(pts), c = centroid(pts);
    const nearPond = Math.hypot(c[0] - pondC[0], c[1] - pondC[1]) < 9;
    const rockery = c[0] > 4 && c[0] < 8.5 && c[1] > 28.5 && c[1] < 31.5;   // the stone cluster NW of the pond
    const h = rockery ? 0.3 + rr() * 0.45 : nearPond ? 0.2 + rr() * 0.18 : 0.28 + rr() * 0.3;
    const g = rockGeometry((b.x1 - b.x0) / 2 * 0.95, (b.z1 - b.z0) / 2 * 0.95, h, i * 1.7, rr() < 0.5 ? 0x625d55 : 0x56534c);
    g.rotateY(rr() * Math.PI);
    g.translate(c[0], 0, c[1]);
    rocks.push(g); placed.push(c);
  });
  const pts = L.pond;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s < len; s += 0.55 + rr() * 0.25) {
      const t = s / len, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      // nudge outward so stones sit on the bank and overhang the water a little
      const nx = x - pondC[0], nz = z - pondC[1], nl = Math.hypot(nx, nz);
      const px = x + nx / nl * 0.12, pz = z + nz / nl * 0.12;
      if (placed.some(c => Math.hypot(c[0] - px, c[1] - pz) < 0.45)) continue;
      const g = rockGeometry(0.28 + rr() * 0.2, 0.22 + rr() * 0.15, 0.18 + rr() * 0.16, i * 13 + s, rr() < 0.5 ? 0x67625a : 0x5b5851);
      g.rotateY(rr() * Math.PI);
      g.translate(px, -0.08, pz);
      rocks.push(g);
    }
  }
  // feature rock in the south-west corner
  const sw = rockGeometry(0.6, 0.4, 0.95, 77, 0x6f6a61); sw.translate(10.0, 0, 53.3); rocks.push(sw);
  scene.add(mesh(merge(rocks), std({ vertexColors: true, flatShading: true }), { cast: true }));

  // lily pads + a few flowers
  {
    const padTex = T.lilyPadTexture();
    const pads = [], flowers = [];
    const pb2 = bbox(L.pond);
    let n = 0;
    while (n < 38) {
      const x = pb2.x0 + rr() * (pb2.x1 - pb2.x0), z = pb2.z0 + rr() * (pb2.z1 - pb2.z0);
      if (!pointInPoly(x, z, L.pond)) continue;
      // keep pads in two loose colonies (east and west), leaving open water for reflections
      if (!(Math.hypot(x - (pondC[0] + 2.6), z - (pondC[1] + 0.8)) < 1.6 || Math.hypot(x - (pondC[0] - 3), z - (pondC[1] - 0.3)) < 1.4)) continue;
      const g = new THREE.CircleGeometry(0.16 + rr() * 0.12, 12);
      g.rotateX(-Math.PI / 2); g.rotateY(rr() * Math.PI * 2); g.translate(x, -0.105, z);
      pads.push(g);
      if (rr() < 0.25) {
        const f = new THREE.ConeGeometry(0.07, 0.07, 7, 1, true);
        f.translate(x + 0.05, -0.07, z);
        flowers.push(paint(f, rr() < 0.5 ? 0xf2a6c0 : 0xfdf6f0));
      }
      n++;
    }
    const pm = new THREE.Mesh(merge(pads), std({ map: padTex, alphaTest: 0.5, side: THREE.DoubleSide }));
    pm.receiveShadow = true; scene.add(pm);
    scene.add(new THREE.Mesh(merge(flowers), std({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x221018 })));
  }
  return out;
}
