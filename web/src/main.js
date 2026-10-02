import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import L from '../../data/layout.json';
import planUrl from '../build/plan-overlay.png';
import { buildGround } from './ground.js';
import { buildStructures } from './structures.js';
import { buildPlants } from './plants.js';
import { wind, pointInPoly, bbox } from './util.js';

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const low = params.get('q') === 'low';
const Q = {
  reflections: !low,
  shadow: low ? 1024 : coarse ? 2048 : 4096,
  pixelRatio: Math.min(devicePixelRatio, low ? 1 : coarse ? 1.5 : 2),
};

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Q.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc4d2dc, 140, 560);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000);

const CENTER = new THREE.Vector3(11.5, 0, 33);

// sky + sun
const sky = new Sky();
sky.scale.setScalar(4000);
const su = sky.material.uniforms;
su.turbidity.value = 4; su.rayleigh.value = 1.3; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
let envRT = null;

const hemi = new THREE.HemisphereLight(0xdfe9f3, 0x5d5444, 0.35);
scene.environmentIntensity = 0.3;
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
const sc = sun.shadow.camera;
sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 220;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
sun.target.position.copy(CENTER);
scene.add(sun, sun.target);

// ---------------------------------------------------------------- content
const ground = buildGround(scene, L, Q);
const S = buildStructures(scene, L);
const plants = buildPlants(scene, L, { ...ground, hedge: S.hedge, pergola: S.pergola }, Q);

const nightLights = [];
for (const [x, z] of L.lamps) {
  const pl = new THREE.PointLight(0xffc27a, 0, 9, 1.6); pl.position.set(x, 2.55, z); scene.add(pl); nightLights.push(pl);
}
{
  const [x, y, z] = S.pavilionLantern;
  const pl = new THREE.PointLight(0xffb066, 0, 10, 1.6); pl.position.set(x, y, z); scene.add(pl); nightLights.push(pl);
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 12),
    new THREE.MeshStandardMaterial({ color: 0xd23b26, emissive: 0xff5a2a, emissiveIntensity: 0.2 }));
  lan.position.set(x, y, z); scene.add(lan);
  S.lantern = lan.material;
}

// plan overlay (原平面图) for checking the model against the drawing
const PT = 0.06888, OX = 268.6, OY = 106.4;
const ov = (() => {
  const x0 = (260 - OX) * PT, x1 = (610 - OX) * PT, z0 = (100 - OY) * PT, z1 = (1070 - OY) * PT;
  const tex = new THREE.TextureLoader().load(planUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0.4, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.9, fog: false }));
  m.renderOrder = 10; m.visible = false;
  scene.add(m);
  return m;
})();

// ---------------------------------------------------------------- time of day
const ui = (id) => document.getElementById(id);
const sunDir = new THREE.Vector3();
let envTimer = 0;
function setTime(h) {
  // Songyang ~28.4°N; equinox-ish arc: sunrise east 6:00, noon south ~61°, sunset west 18:30
  const t = (h - 6) / 12.5;
  const el = Math.sin(Math.PI * t) * 61 * Math.PI / 180;
  const az = (90 + 180 * t) * Math.PI / 180;
  const elc = Math.max(el, -0.2);
  sunDir.set(Math.cos(elc) * Math.sin(az), Math.sin(elc), -Math.cos(elc) * Math.cos(az));
  su.sunPosition.value.copy(sunDir);
  const day = THREE.MathUtils.smoothstep(el, -0.05, 0.25);
  const golden = 1 - THREE.MathUtils.smoothstep(el, 0.05, 0.6);
  if (el > 0) {
    sun.position.copy(CENTER).addScaledVector(sunDir, 100);
    sun.intensity = 2.3 * THREE.MathUtils.smoothstep(el, 0.0, 0.18);
    sun.color.setRGB(1, 1 - golden * 0.28, 1 - golden * 0.5);
  } else {   // moonlight
    sun.position.copy(CENTER).add(new THREE.Vector3(-30, 60, 40));
    sun.intensity = 0.45;
    sun.color.set(0x8fa6d8);
  }
  hemi.intensity = 0.14 + 0.24 * day;
  hemi.color.setRGB(0.55 + 0.33 * day, 0.62 + 0.29 * day, 0.85 + 0.1 * day);
  renderer.toneMappingExposure = 0.72 + 0.08 * day + (1 - day) * 0.3;
  scene.fog.color.setRGB(0.12 + 0.65 * day, 0.15 + 0.67 * day, 0.22 + 0.65 * day);
  const night = 1 - THREE.MathUtils.smoothstep(el, -0.04, 0.12);
  nightLights.forEach(l => { l.intensity = night * 6; });
  S.lampMat.emissiveIntensity = 0.15 + night * 2.5;
  S.lantern.emissiveIntensity = 0.2 + night * 2.2;
  renderer.shadowMap.needsUpdate = true;
  clearTimeout(envTimer);
  envTimer = setTimeout(() => {
    envScene.add(sky);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene);
    scene.add(sky);
    scene.environment = envRT.texture;
  }, 60);
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  ui('timeLabel').textContent = `${hh}:${String(mm).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- controls
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 1.5; orbit.maxDistance = 260;
orbit.screenSpacePanning = false;

const walk = { on: false, yaw: 0, pitch: 0, keys: new Set(), joy: { x: 0, y: 0 }, eye: 1.6 };
const blockers = [L.house, L.neighbor, L.oldHouse, L.pond];
function floorAt(x, z) {
  if (pointInPoly(x, z, L.pavilion.platform)) return 0.45;
  if (pointInPoly(x, z, L.boardwalk)) return 0.18;
  if (pointInPoly(x, z, L.patio)) return 0.12;
  return 0;
}
function setMode(isWalk, user = true) {
  const was = walk.on;
  walk.on = isWalk;
  orbit.enabled = !isWalk;
  document.body.classList.toggle('walking', isWalk);
  ui('modeBtn').textContent = isWalk ? '切换到鸟瞰' : '切换到漫步';
  if (isWalk) {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    walk.yaw = Math.atan2(-dir.x, -dir.z); walk.pitch = 0;
    const t = orbit.target;
    if (user && camera.position.y > 3) camera.position.set(t.x, floorAt(t.x, t.z) + walk.eye, t.z);
  } else if (was) {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    orbit.target.copy(camera.position).addScaledVector(dir, 8); orbit.target.y = Math.max(0, orbit.target.y);
  }
  updateHint();
}
function applyLook() {
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
}

// pointer-drag look (walk) — no pointer lock, so it works the same on touch
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!walk.on) return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!walk.on || !drag || drag.id !== e.pointerId) return;
  walk.yaw += (e.clientX - drag.x) * 0.004;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch + (e.clientY - drag.y) * 0.004, -1.2, 1.2);
  drag.x = e.clientX; drag.y = e.clientY;
});
addEventListener('pointerup', () => { drag = null; });
addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT') walk.keys.add(e.code); });
addEventListener('keyup', (e) => walk.keys.delete(e.code));

// virtual joystick for touch
{
  const pad = ui('joy'), knob = ui('knob');
  let id = null, cx = 0, cy = 0;
  pad.addEventListener('pointerdown', (e) => {
    id = e.pointerId; pad.setPointerCapture(id);
    const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    e.stopPropagation();
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), m = 45;
    if (d > m) { dx *= m / d; dy *= m / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    walk.joy.x = dx / m; walk.joy.y = dy / m;
  });
  const end = () => { id = null; knob.style.transform = ''; walk.joy.x = walk.joy.y = 0; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}

function stepWalk(dt) {
  const k = walk.keys;
  let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - walk.joy.y;
  let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + walk.joy.x;
  if (k.has('KeyQ')) walk.yaw += dt * 1.6;
  if (k.has('KeyE')) walk.yaw -= dt * 1.6;
  const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 5 : 2.2) * dt;
  const len = Math.hypot(f, s);
  if (len > 0.01) {
    if (len > 1) { f /= len; s /= len; }
    const sinY = Math.sin(walk.yaw), cosY = Math.cos(walk.yaw);
    const nx = camera.position.x + (-sinY * f + cosY * s) * speed;
    const nz = camera.position.z + (-cosY * f - sinY * s) * speed;
    const tryMove = (x, z) => !blockers.some(p => pointInPoly(x, z, p)) && x > -8 && x < 31 && z > -12 && z < 78;
    if (tryMove(nx, nz)) { camera.position.x = nx; camera.position.z = nz; }
    else if (tryMove(nx, camera.position.z)) camera.position.x = nx;
    else if (tryMove(camera.position.x, nz)) camera.position.z = nz;
  }
  const targetY = floorAt(camera.position.x, camera.position.z) + walk.eye;
  camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 8);
  applyLook();
}

// ---------------------------------------------------------------- viewpoints
const VIEWS = [
  { name: '全景鸟瞰', pos: [44, 40, 68], look: [11.5, 0, 31] },
  { name: '俯视对照', pos: [11.5, 88, 33.05], look: [11.5, 0, 33], plan: true },
  { name: '主屋与花园', pos: [25, 15, 36], look: [7, 3, 22] },
  { name: '北门进入', pos: [20.8, 1.6, -3.5], look: [16, 1.3, 10], walk: true },
  { name: '茶座', pos: [15.2, 1.75, 9.4], look: [14.2, 1.0, 26], walk: true },
  { name: '主屋正面', pos: [10.5, 6.5, 32.5], look: [5.5, 4.0, 18] },
  { name: '亭中望水', pos: [5.4, 2.05, 38.4], look: [8.6, 0.2, 32.4], walk: true },
  { name: '花架下', pos: [15.2, 1.6, 37.8], look: [15.2, 1.9, 27], walk: true },
  { name: '南花园小径', pos: [13.6, 1.6, 55.6], look: [14.6, 1.2, 44], walk: true },
  { name: '南门', pos: [20.8, 1.6, 69.5], look: [15, 2, 50], walk: true },
];
let fly = null;
function goto(v) {
  if (v.plan !== undefined) setOverlay(!!v.plan);
  const wantWalk = !!v.walk;
  if (wantWalk !== walk.on) setMode(wantWalk, false);
  const to = new THREE.Vector3(...v.pos), look = new THREE.Vector3(...v.look);
  const d = look.clone().sub(to);
  fly = {
    t: 0, from: camera.position.clone(), to,
    fromTarget: orbit.target.clone(), toTarget: look,
    fromYaw: walk.yaw, toYaw: Math.atan2(-d.x, -d.z),
    fromPitch: walk.pitch, toPitch: Math.atan2(d.y, Math.hypot(d.x, d.z)),
  };
  // shortest yaw path
  while (fly.toYaw - fly.fromYaw > Math.PI) fly.toYaw -= Math.PI * 2;
  while (fly.toYaw - fly.fromYaw < -Math.PI) fly.toYaw += Math.PI * 2;
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.name === v.name));
}
function stepFly(dt) {
  if (!fly) return false;
  fly.t = Math.min(1, fly.t + dt / 1.4);
  const e = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
  camera.position.lerpVectors(fly.from, fly.to, e);
  if (walk.on) {
    walk.yaw = fly.fromYaw + (fly.toYaw - fly.fromYaw) * e;
    walk.pitch = fly.fromPitch + (fly.toPitch - fly.fromPitch) * e;
    applyLook();
  } else {
    orbit.target.lerpVectors(fly.fromTarget, fly.toTarget, e);
    camera.lookAt(orbit.target);
  }
  if (fly.t >= 1) fly = null;
  return true;
}

// ---------------------------------------------------------------- labels
const LABELS = [
  ['主屋（三层）', 5.5, 12.2, 17.9], ['隔壁房子', 4.5, 10.6, 6], ['房子', 10.6, 8.2, 3.5], ['菜地', 14.2, 1.2, 3.5],
  ['茶座', 15.6, 1.8, 10.6], ['汀步', 11.9, 0.9, 19], ['木栈道', 15.7, 1.0, 22.8], ['景观灯柱', 17.5, 3.4, 22.5],
  ['水池', 8.3, 1.2, 33.2], ['花架（紫藤）', 15.2, 3.9, 32.9], ['四方亭', 5.5, 5.9, 38.95], ['卵石铺地', 17.65, 0.9, 44.4],
  ['桂花', 17.8, 4.0, 5.5], ['棕榈', 11.3, 5.3, 48.7], ['竹林 · 茶园', 9.0, 4.6, 54.6], ['停车位', 14.2, 2.3, 61],
  ['水泥路（院内）', 21, 0.8, 35], ['北门', 20.8, 2.9, 0], ['南门', 20.8, 2.9, 65.8],
];
const labelEls = LABELS.map(([t]) => {
  const d = document.createElement('div'); d.className = 'label'; d.textContent = t; ui('labels').appendChild(d); return d;
});
const v3 = new THREE.Vector3();
function updateLabels() {
  if (!ui('optLabels').checked) return;
  const w = innerWidth, h = innerHeight;
  LABELS.forEach(([, x, y, z], i) => {
    v3.set(x, y, z);
    const dist = camera.position.distanceTo(v3);
    v3.project(camera);
    const el = labelEls[i];
    if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1 || dist > (walk.on ? 24 : 140)) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(-50%,-100%) translate(${(v3.x * 0.5 + 0.5) * w}px,${(-v3.y * 0.5 + 0.5) * h}px)`;
    el.style.opacity = dist < 3 ? 0 : 1;
  });
}

// ---------------------------------------------------------------- UI wiring
function setOverlay(on) { ov.visible = on; ui('optPlan').checked = on; }
function updateHint() {
  ui('hint').innerHTML = walk.on
    ? (coarse ? '左下摇杆走动 · 拖动屏幕转头' : 'W/A/S/D 或方向键走动 · 按住鼠标拖动转头 · Shift 加速')
    : (coarse ? '单指旋转 · 双指缩放/平移' : '左键旋转 · 滚轮缩放 · 右键平移');
}
VIEWS.forEach(v => {
  const b = document.createElement('button'); b.textContent = v.name; b.dataset.name = v.name;
  b.onclick = () => goto(v); ui('views').appendChild(b);
});
ui('modeBtn').onclick = () => setMode(!walk.on);
ui('time').oninput = (e) => setTime(+e.target.value);
ui('optLabels').onchange = (e) => { ui('labels').style.display = e.target.checked ? '' : 'none'; };
ui('optPlan').onchange = (e) => setOverlay(e.target.checked);
ui('optPlants').onchange = (e) => { plants.visible = e.target.checked; renderer.shadowMap.needsUpdate = true; };
ui('optWind').onchange = (e) => { wind.uniforms.uWind.value = e.target.checked ? 1 : 0; };
ui('panelToggle').onclick = () => document.body.classList.toggle('panel-open');
ui('quality').value = low ? 'low' : 'high';
ui('quality').onchange = (e) => { const p = new URLSearchParams(location.search); p.set('q', e.target.value); location.search = p.toString(); };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- start
const startTime = params.has('t') ? +params.get('t') : 15.5;
ui('time').value = startTime;
setTime(startTime);
const startView = VIEWS[params.has('v') ? +params.get('v') : 0];
camera.position.set(...startView.pos);
orbit.target.set(...startView.look);
if (startView.walk) { setMode(true, false); const d = new THREE.Vector3(...startView.look).sub(camera.position); walk.yaw = Math.atan2(-d.x, -d.z); walk.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); applyLook(); }
else { camera.lookAt(orbit.target); setMode(false, false); }
if (startView.plan) setOverlay(true);
if (params.has('cam')) {   // debug: ?cam=x,y,z,lookX,lookY,lookZ
  const c = params.get('cam').split(',').map(Number);
  setMode(false, false); camera.position.set(c[0], c[1], c[2]); orbit.target.set(c[3], c[4], c[5]); camera.lookAt(orbit.target);
}
document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.name === startView.name));

const clock = new THREE.Timer();
let first = true;
renderer.setAnimationLoop(() => {
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.getElapsed();
  wind.uniforms.uTime.value = t;
  ground.animate.forEach(f => f(t));
  if (!stepFly(dt)) {
    if (walk.on) stepWalk(dt); else orbit.update();
  }
  ui('compass').style.transform = `rotate(${(() => { const d = new THREE.Vector3(); camera.getWorldDirection(d); return -Math.atan2(d.x, -d.z); })()}rad)`;
  updateLabels();
  renderer.render(scene, camera);
  if (first) { first = false; document.body.classList.add('ready'); window.__ready = true; }
});
