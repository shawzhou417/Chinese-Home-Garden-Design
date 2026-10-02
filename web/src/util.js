import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { mergeGeometries };

// Layout points are [x (east), z (south)] in metres. Shapes are built in (x, -z)
// and rotated -90deg about X so they lie on the ground with +Y up.
export function shapeOf(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
}

export function flat(pts, y = 0, holes = []) {
  const g = new THREE.ShapeGeometry(shapeOf(pts, holes), 4);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

export function slab(pts, y0, y1, holes = [], bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts, holes), {
    depth: y1 - y0, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

export function rectPts(x0, z0, x1, z1) {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

export function bbox(pts) {
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs),
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

export function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

// Box from a to b (centre line on ground), thickness t, from y0 to y1.
export function wallBox(a, b, t, y0, y1) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(len, y1 - y0, t);
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2);
  return g;
}

// Cheap hashed value noise (3D) for displacing blobs.
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
    w);
}

// Add a solid vertex colour attribute to a geometry.
export function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Normalise attribute sets so geometries can be merged.
export function prep(g) {
  let out = g.index ? g.toNonIndexed() : g;
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  if (!out.attributes.normal) out.computeVertexNormals();
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) out.deleteAttribute(k);
  return out;
}

export function merge(list) {
  return mergeGeometries(list.map(prep), false);
}

// ---------------------------------------------------------------- wind
export const wind = { uniforms: { uTime: { value: 0 }, uWind: { value: 1 } } };

// Sway vertices above `base` metres; works for plain and instanced meshes.
export function windify(mat, amp = 0.02, base = 0.5) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uniforms.uTime;
    sh.uniforms.uWind = wind.uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float hh = max(position.y - ${base.toFixed(2)}, 0.0);
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          #endif
          float ph = ip.x * 0.37 + ip.z * 0.23 + position.x * 0.8;
          float s = sin(uTime * 1.4 + ph) * 0.7 + sin(uTime * 2.9 + ph * 1.7) * 0.3;
          transformed.x += s * hh * hh * ${amp.toFixed(4)} * uWind;
          transformed.z += cos(uTime * 1.1 + ph) * hh * hh * ${(amp * 0.6).toFixed(4)} * uWind;
        }`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + base;
  return mat;
}
