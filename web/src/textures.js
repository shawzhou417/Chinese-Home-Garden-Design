// Procedural canvas textures, so the page needs no external image files.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Draw with wrap-around so the texture tiles seamlessly.
function wrapDraw(w, h, x, y, pad, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    if (x + dx < -pad || x + dx > w + pad || y + dy < -pad || y + dy > h + pad) continue;
    fn(x + dx, y + dy);
  }
}

function toTex(c, meters, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / meters, 1 / meters);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

function speckle(ctx, w, h, n, colors, size, r) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size * (0.5 + r());
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

export function grassTexture() {
  const W = 512, c = canvas(W), ctx = c.getContext('2d'), r = rng(11);
  ctx.fillStyle = '#5f8a3a'; ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 60; i++) {           // soft patches
    const x = r() * W, y = r() * W, rad = 30 + r() * 70;
    wrapDraw(W, W, x, y, rad, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, r() < 0.5 ? 'rgba(120,160,70,0.25)' : 'rgba(60,95,40,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14000; i++) {        // blades
    const x = r() * W, y = r() * W, len = 3 + r() * 6, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    ctx.strokeStyle = hsl(80 + r() * 30, 35 + r() * 30, 22 + r() * 28);
    wrapDraw(W, W, x, y, 10, (px, py) => {
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); ctx.stroke();
    });
  }
  return toTex(c, 3);
}

export function groundcoverTexture() {   // mondo grass / 麦冬
  const W = 512, c = canvas(W), ctx = c.getContext('2d'), r = rng(12);
  ctx.fillStyle = '#2f4a22'; ctx.fillRect(0, 0, W, W);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9000; i++) {
    const x = r() * W, y = r() * W, len = 6 + r() * 10, a = r() * Math.PI * 2;
    ctx.strokeStyle = hsl(95 + r() * 25, 30 + r() * 25, 14 + r() * 22);
    wrapDraw(W, W, x, y, 20, (px, py) => {
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + Math.cos(a) * len * 0.6, py + Math.sin(a) * len * 0.2, px + Math.cos(a) * len, py + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  return toTex(c, 2);
}

export function soilTexture() {
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(13);
  ctx.fillStyle = '#5a4330'; ctx.fillRect(0, 0, W, W);
  speckle(ctx, W, W, 6000, ['#4a3626', '#6b5139', '#3d2c1f', '#75604a'], 2, r);
  return toTex(c, 1.5);
}

export function tileTexture(tile = 0.38, n = 4) {   // patio paving grid
  const W = 512, c = canvas(W), ctx = c.getContext('2d'), r = rng(14), s = W / n;
  ctx.fillStyle = '#8d8a83'; ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = 62 + r() * 10;
    ctx.fillStyle = hsl(35, 6, l); ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  speckle(ctx, W, W, 9000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)', 'rgba(60,60,60,0.10)'], 1.6, r);
  return toTex(c, tile * n);
}

export function woodTexture(plank = 0.14, n = 8, dark = false) {
  const W = 512, c = canvas(W), ctx = c.getContext('2d'), r = rng(dark ? 16 : 15), s = W / n;
  for (let j = 0; j < n; j++) {
    const base = dark ? [26 + r() * 6, 25 + r() * 10, 17 + r() * 6] : [28 + r() * 6, 42 + r() * 12, 38 + r() * 10];
    ctx.fillStyle = hsl(...base); ctx.fillRect(0, j * s, W, s);
    for (let k = 0; k < 18; k++) {         // grain
      ctx.strokeStyle = `rgba(${dark ? '10,8,5' : '70,40,20'},${0.08 + r() * 0.12})`;
      ctx.lineWidth = 1; ctx.beginPath();
      const y = j * s + r() * s;
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + k) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, j * s, W, 2);   // gap
  }
  return toTex(c, plank * n);
}

export function concreteTexture() {
  const W = 512, c = canvas(W), ctx = c.getContext('2d'), r = rng(17);
  ctx.fillStyle = '#a7a59f'; ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = r() * W, rad = 40 + r() * 90;
    wrapDraw(W, W, x, y, rad, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, r() < 0.5 ? 'rgba(80,80,75,0.12)' : 'rgba(220,218,210,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  speckle(ctx, W, W, 14000, ['rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)'], 1.4, r);
  ctx.fillStyle = 'rgba(40,40,40,0.45)'; ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, 0, 2, W);
  return toTex(c, 4);
}

export function pebbleTexture() {
  const W = 512, c = canvas(W), ctx = c.getContext('2d'), r = rng(18);
  ctx.fillStyle = '#6d6a64'; ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * W, a = 6 + r() * 10, b = a * (0.6 + r() * 0.3), rot = r() * Math.PI;
    const l = 45 + r() * 35, hue = 20 + r() * 30;
    wrapDraw(W, W, x, y, 20, (px, py) => {
      const g = ctx.createRadialGradient(px - a * 0.3, py - b * 0.3, 1, px, py, a);
      g.addColorStop(0, hsl(hue, 10, l + 12)); g.addColorStop(1, hsl(hue, 10, l - 12));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, a, b, rot, 0, Math.PI * 2); ctx.fill();
    });
  }
  return toTex(c, 1.2);
}

export function gravelTexture() {
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(19);
  ctx.fillStyle = '#9c9890'; ctx.fillRect(0, 0, W, W);
  speckle(ctx, W, W, 7000, ['#7d7972', '#b8b4ab', '#8c877d', '#c9c5bc', '#6a665f'], 2.5, r);
  return toTex(c, 1);
}

export function graniteTexture() {
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(20);
  ctx.fillStyle = '#9a978f'; ctx.fillRect(0, 0, W, W);
  speckle(ctx, W, W, 8000, ['#7e7b74', '#b5b2aa', '#5f5c57', '#c8c5bd'], 1.6, r);
  const t = toTex(c, 1); t.repeat.set(1, 1);
  return t;
}

export function plasterTexture() {
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(21);
  ctx.fillStyle = '#efede7'; ctx.fillRect(0, 0, W, W);
  speckle(ctx, W, W, 5000, ['rgba(0,0,0,0.035)', 'rgba(255,255,255,0.05)'], 2, r);
  return toTex(c, 2);
}

export function roofTileTexture() {   // 小青瓦 rows
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(22);
  ctx.fillStyle = '#3a3c3e'; ctx.fillRect(0, 0, W, W);
  const cols = 12;
  for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) * W / cols;
    const g = ctx.createLinearGradient(x - W / cols / 2, 0, x + W / cols / 2, 0);
    g.addColorStop(0, '#2a2b2d'); g.addColorStop(0.5, hsl(210, 4, 32 + r() * 8)); g.addColorStop(1, '#2a2b2d');
    ctx.fillStyle = g; ctx.fillRect(x - W / cols / 2, 0, W / cols, W);
  }
  for (let j = 0; j < 8; j++) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, j * W / 8, W, 2); }
  return toTex(c, 1.6);
}

export function hedgeTexture() {
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(23);
  ctx.fillStyle = '#2e4a21'; ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 2500; i++) {
    const x = r() * W, y = r() * W;
    ctx.fillStyle = hsl(90 + r() * 30, 35 + r() * 25, 16 + r() * 26);
    wrapDraw(W, W, x, y, 6, (px, py) => {
      ctx.beginPath(); ctx.ellipse(px, py, 3 + r() * 2, 1.5 + r(), r() * Math.PI, 0, Math.PI * 2); ctx.fill();
    });
  }
  return toTex(c, 0.8);
}

export function waterNormalTexture(seed) {   // tileable sum of sines -> normal map
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(seed);
  const waves = [];
  for (let i = 0; i < 9; i++) {
    const kx = Math.round((r() - 0.5) * 12), ky = Math.round((r() - 0.5) * 12);
    if (!kx && !ky) continue;
    waves.push([kx, ky, r() * Math.PI * 2, 1 / Math.hypot(kx, ky)]);
  }
  const h = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const [kx, ky, p, a] of waves) v += a * Math.sin(2 * Math.PI * (kx * x + ky * y) / W + p);
    h[y * W + x] = v;
  }
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W];
    const dy = h[((y + 1) % W) * W + x] - h[((y - 1 + W) % W) * W + x];
    const n = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize();
    const i = (y * W + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- alpha leaf textures
function alphaTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function palmFanTexture() {   // fan leaf, centre of fan at bottom-middle
  const W = 256, c = canvas(W), ctx = c.getContext('2d'), r = rng(31);
  const cx = W / 2, cy = W - 4, n = 26;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i + 0.5) / n * Math.PI, len = W * (0.78 + r() * 0.18);
    const droop = (r() - 0.5) * 0.06;
    ctx.strokeStyle = hsl(95 + r() * 15, 40 + r() * 15, 24 + r() * 12);
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
    ctx.lineTo(cx + Math.cos(a + droop) * len * 0.62, cy + Math.sin(a + droop) * len * 0.62); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a + droop) * len * 0.6, cy + Math.sin(a + droop) * len * 0.6);
    ctx.lineTo(cx + Math.cos(a + droop * 3) * len * 0.98, cy + Math.sin(a + droop * 3) * len * 0.98); ctx.stroke();
  }
  return alphaTex(c);
}

export function featherTexture(hue = 100, light = 24) {   // pinnate frond (cycad / bamboo leaves)
  const W = 64, H = 256, c = canvas(W, H), ctx = c.getContext('2d'), r = rng(32 + hue);
  ctx.strokeStyle = hsl(hue - 30, 30, 22); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.lineTo(W / 2, 4); ctx.stroke();
  for (let y = H - 10; y > 6; y -= 5) {
    const t = 1 - y / H, len = (W / 2 - 2) * Math.sin(Math.min(1, (1 - t) * 1.2) * Math.PI * 0.5 + 0.2) * (0.6 + 0.4 * (1 - t));
    ctx.strokeStyle = hsl(hue + r() * 15, 40 + r() * 15, light + r() * 10); ctx.lineWidth = 2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(W / 2, y); ctx.lineTo(W / 2 + s * len, y - len * 0.7); ctx.stroke(); }
  }
  return alphaTex(c);
}

export function bambooLeafTexture() {
  const W = 128, c = canvas(W), ctx = c.getContext('2d'), r = rng(33);
  for (let i = 0; i < 22; i++) {
    const x = r() * W, y = r() * W, a = r() * Math.PI * 2, len = 22 + r() * 18;
    ctx.fillStyle = hsl(85 + r() * 25, 40 + r() * 20, 26 + r() * 16);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, 3.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  return alphaTex(c);
}

export function grassBladeTexture(hue = 70) {
  const W = 128, H = 128, c = canvas(W, H), ctx = c.getContext('2d'), r = rng(34 + hue);
  for (let i = 0; i < 40; i++) {
    const x0 = W / 2 + (r() - 0.5) * 30, lean = (r() - 0.5) * 90, top = 10 + r() * 40;
    ctx.strokeStyle = hsl(hue + r() * 25, 30 + r() * 20, 30 + r() * 25); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x0, H); ctx.quadraticCurveTo(x0 + lean * 0.3, H * 0.5, x0 + lean, top); ctx.stroke();
  }
  return alphaTex(c);
}

export function lilyPadTexture() {
  const W = 128, c = canvas(W), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, '#4f7a2e'); g.addColorStop(1, '#2f5a22');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(64, 64); ctx.arc(64, 64, 60, 0.18, Math.PI * 2 - 0.18); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(160,200,110,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const a = 0.3 + i / 14 * (Math.PI * 2 - 0.6); ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); ctx.stroke(); }
  return alphaTex(c);
}
