// Super Duper Intelligence: the flag, the brain, and the hidden bands.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const RELAY = 'https://sdi-relay.anticontainment-system.workers.dev';
const RED = '#D52B1E';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileQuery = matchMedia('(max-width: 760px), (pointer: coarse) and (orientation: portrait)');
const isMobile = () => mobileQuery.matches;

// Version settings. Each version sets its own sizes.
const VERSION = {
  desktop: { restFill: 0.74, restHeight: 0.62 },
  mobile: { restFill: 1.08, restHeight: 0.6 },
};

// Modes. A fourth mode is one more entry here, one more region, and one more card.
// Regions: 1 frontal (front), 2 parietal (top), 3 temporal (lower side), 4 occipital (back).
const MODES = {
  guide: { name: 'Guide', region: 1, hint: 'Describe your situation, then list the options or let the brain suggest some.', placeholder: 'Your situation' },
  judge: { name: 'Judge', region: 2, hint: 'Submit an idea, a line, or a plan. The brain scores it.', placeholder: 'Your idea' },
  mentor: { name: 'Mentor', region: 3, local: true },
  oracle: { name: 'Oracle', region: 4, hint: 'Ask a yes or no question.', placeholder: 'Will it work?' },
};
const REGION_MODE = { 1: 'guide', 2: 'judge', 3: 'mentor', 4: 'oracle' };
let mode = 'oracle';

const $ = (id) => document.getElementById(id);
const canvas = $('brain');

/* ---------- Flag layout ---------- */
let W = innerWidth, H = innerHeight, band = W * 0.25;
function layoutFlag() {
  W = innerWidth; H = innerHeight;
  band = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--band')) / 100 * W || W * 0.25;
  const l = document.querySelector('.flag-band-left'), r = document.querySelector('.flag-band-right');
  l.setAttribute('width', band); r.setAttribute('width', band); r.setAttribute('x', W - band);
  document.querySelector('.flag').setAttribute('viewBox', `0 0 ${W} ${H}`);
}

/* ---------- Renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0xffffff, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
camera.position.set(0, 0, 1000);

// Statue lighting: a strong key from upper left, soft fill, a cool back light to carve the silhouette.
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a0f0a, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-0.7, 1.0, 0.9); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.55); fill.position.set(1, -0.1, 0.6); scene.add(fill);
const back = new THREE.DirectionalLight(0xffffff, 0.9); back.position.set(0.2, 0.6, -1); scene.add(back);

const tilt = new THREE.Group(); // pitch and lean
const spin = new THREE.Group(); // yaw around the vertical axis
tilt.add(spin); scene.add(tilt);
const lift = 0.06; // fraction of brain length to raise the whole brain

const uniforms = {
  uAmt: { value: new THREE.Vector4() },   // highlight per lobe: frontal, parietal, temporal, occipital
  uHover: { value: new THREE.Vector4() }, // light hover tint per lobe (desktop)
  uActiveV: { value: new THREE.Vector4(0, 0, 0, 1) }, // which lobe is the active mode
  uPx: { value: 1 },
  uThink: { value: 0 }, uTime: { value: 0 },
  uLight: { value: new THREE.Color('#FF6A55') }, uDeep: { value: new THREE.Color('#8E160F') },
  uLine: { value: new THREE.Color('#FFE3DE') },
  uBox: { value: new THREE.Vector4(1, 0, 1, 1) },
  uDebug: { value: new URLSearchParams(location.search).has('regions') ? 1 : 0 },
};
// Lobes follow the brain's real grooves: the central sulcus (frontal and parietal),
// the parieto-occipital line (occipital), and the Sylvian fissure (temporal).
// Every boundary is a smooth curve in model space. The JS twin below is the same math.
const LOBE_GLSL = `
      float sst(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
      vec3 lobeN(vec3 p) { return vec3(abs(p.x) / uBox.x, (p.y - uBox.y) / uBox.z, p.z / uBox.w); }
      // x: cerebrum floor, y: central sulcus, z: parieto-occipital, w: Sylvian. Each is a signed field.
      vec4 lobeFields(vec3 n) {
        float ax = n.x, yn = n.y, zn = n.z;
        float fl = 0.26 + 0.17 * sst(-0.15, -0.55, zn) - 0.10 * sst(0.35, 0.7, ax) * sst(-0.3, 0.0, zn);
        float zc = 0.02 + 0.42 * (0.95 - yn) + 0.03 * sin(yn * 15.0 + ax * 5.0) + 0.018 * sin(yn * 31.0 - ax * 7.0);
        float zo = -0.44 - 0.2 * (yn - 0.4) + 0.04 * sin(yn * 3.1) + 0.025 * sin(yn * 13.0 + ax * 6.0) + 0.012 * sin(yn * 29.0 - ax * 4.0);
        float ys = 0.54 - 0.16 * zn + 0.09 * sst(-0.1, -0.45, zn) + 0.018 * sin(zn * 14.0 + ax * 3.0) + 0.01 * sin(zn * 33.0);
        float td = yn - (ys - 0.13);
        float tf = 0.42 - 3.2 * td * td;
        return vec4(yn - fl, zn - zc, zn - zo, max(yn - ys, zn - tf));
      }
      float lobeId(vec3 n, vec4 f) {
        if (f.x < 0.0) return 0.0;
        if (f.z < 0.0) return 4.0;
        if (f.w < 0.0 && n.x > 0.32) return 3.0;
        return f.y > 0.0 ? 1.0 : 2.0;
      }
`;
const material = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.62, metalness: 0.0 });
material.onBeforeCompile = (s) => {
  Object.assign(s.uniforms, uniforms);
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float region;\nvarying float vRegion;\nvarying vec3 vPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = region;\nvPos = position;');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vRegion;\nvarying vec3 vPos;\nuniform float uThink, uTime, uDebug;\nuniform vec4 uAmt, uHover, uActiveV;\nuniform vec3 uLight, uDeep, uLine;\nuniform vec4 uBox;\nuniform float uPx;' + LOBE_GLSL)
    .replace('#include <color_fragment>', `#include <color_fragment>
      // Lobes are smooth curved fields of model position, negative inside.
      vec3 ln0 = lobeN(vPos);
      vec4 lf = lobeFields(ln0);
      float rid = lobeId(ln0, lf);
      vec4 own = vec4(float(rid == 1.0), float(rid == 2.0), float(rid == 3.0), float(rid == 4.0));
      float act = dot(own, uAmt);
      float hov = dot(own, uHover);
      diffuseColor.rgb = mix(diffuseColor.rgb, uLight, clamp(act * 0.6 + hov * 0.22 * (1.0 - act), 0.0, 1.0));
      float inLobe = dot(own, uActiveV);
      float w = sin(vPos.z * 0.06 + vPos.y * 0.03 - uTime * 2.2);
      w = smoothstep(0.35, 1.0, w);
      diffuseColor.rgb = mix(diffuseColor.rgb, uDeep, w * inLobe * uThink * 0.75);
      if (uDebug > 0.5) { diffuseColor.rgb = vRegion < 0.5 ? vec3(0.3) : vRegion < 1.5 ? vec3(0.9,0.2,0.1) : vRegion < 2.5 ? vec3(0.1,0.5,0.9) : vRegion < 3.5 ? vec3(0.1,0.8,0.3) : vec3(0.9,0.8,0.1); }
    `)
    .replace('#include <tonemapping_fragment>', `
      // Thin organic groove lines on each boundary, about 1.5 px, light pink at 0.6, stronger beside the active lobe.
      vec3 n2 = lobeN(vPos);
      vec4 f2 = lobeFields(n2);
      vec4 fw = max(fwidth(f2), vec4(1e-6));
      vec4 dl = abs(f2) / (fw * uPx);
      float cer = sst(0.0, 0.02, f2.x);
      float lat = sst(0.28, 0.36, n2.x);
      float notO = step(0.0, f2.z), notT = 1.0 - (1.0 - step(0.0, f2.w)) * step(0.32, n2.x);
      vec4 ae = uActiveV * uAmt;
      // Which lines touch the active lobe.
      float aC = max(ae.x, ae.y), aO = max(ae.w, max(ae.y, ae.z)), aT = max(ae.z, max(ae.x, ae.y));
      float wC = mix(0.75, 1.15, aC), wO = mix(0.75, 1.15, aO), wT = mix(0.75, 1.15, aT);
      float lC = (1.0 - smoothstep(wC * 0.6, wC * 1.4, dl.y)) * cer * notO * notT * mix(0.6, 0.95, aC);
      float lO = (1.0 - smoothstep(wO * 0.6, wO * 1.4, dl.z)) * cer * mix(0.6, 0.95, aO);
      float lT = (1.0 - smoothstep(wT * 0.6, wT * 1.4, dl.w)) * cer * notO * lat * mix(0.6, 0.95, aT);
      float lineA = max(lC, max(lO, lT));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uLine, lineA);
      #include <tonemapping_fragment>`);
};

// Same lobe math as the shader, so a tap picks exactly the lobe that is drawn.
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function lobeOf(ax, yn, zn) {
  const fl = 0.26 + 0.17 * sst(-0.15, -0.55, zn) - 0.10 * sst(0.35, 0.7, ax) * sst(-0.3, 0.0, zn);
  if (yn - fl < 0) return 0; // brainstem and cerebellum: unassigned
  const zo = -0.44 - 0.2 * (yn - 0.4) + 0.04 * Math.sin(yn * 3.1) + 0.025 * Math.sin(yn * 13 + ax * 6) + 0.012 * Math.sin(yn * 29 - ax * 4);
  if (zn - zo < 0) return 4; // occipital
  const ys = 0.54 - 0.16 * zn + 0.09 * sst(-0.1, -0.45, zn) + 0.018 * Math.sin(zn * 14 + ax * 3) + 0.01 * Math.sin(zn * 33);
  const td = yn - (ys - 0.13);
  const tf = 0.42 - 3.2 * td * td;
  if (Math.max(yn - ys, zn - tf) < 0 && ax > 0.32) return 3; // temporal
  const zc = 0.02 + 0.42 * (0.95 - yn) + 0.03 * Math.sin(yn * 15 + ax * 5) + 0.018 * Math.sin(yn * 31 - ax * 7);
  return zn - zc > 0 ? 1 : 2; // frontal or parietal
}
let brain = null, brainLen = 1, lobeFace = {};
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('assets/brain.glb', (gltf) => {
  let src = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  // Bake to plain floats, center it, and tag lobes by model-space position.
  const g0 = src.geometry, pa = g0.attributes.position, n = pa.count;
  const pos = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(src.matrixWorld); pos.set([v.x, v.y, v.z], i * 3); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(g0.index);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, c = new THREE.Vector3(); bb.getCenter(c);
  const S = 1000 / (bb.max.z - bb.min.z); // model units: brain length = 1000
  const region = new Float32Array(n), sums = { 1: [0, 0, 0, 0], 2: [0, 0, 0, 0], 3: [0, 0, 0, 0], 4: [0, 0, 0, 0] };
  const xMax = (bb.max.x - bb.min.x) / 2, yR = bb.max.y - bb.min.y, zH = (bb.max.z - bb.min.z) / 2;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const ax = Math.abs(x - c.x) / xMax, yn = (y - bb.min.y) / yR, zn = (z - c.z) / zH;
    const r = lobeOf(ax, yn, zn);
    region[i] = r;
    pos[i * 3] = (x - c.x) * S; pos[i * 3 + 1] = (y - c.y) * S; pos[i * 3 + 2] = (z - c.z) * S;
    if (r && (r !== 3 || x < c.x)) { const s = sums[r]; s[0] += pos[i * 3]; s[1] += pos[i * 3 + 1]; s[2] += pos[i * 3 + 2]; s[3]++; }
  }
  geo.setAttribute('region', new THREE.BufferAttribute(region, 1));
  uniforms.uBox.value.set(xMax * S, (bb.min.y - c.y) * S, yR * S, zH * S);
  geo.computeVertexNormals();
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  brainLen = 1000;
  // Where to turn so each lobe faces the viewer.
  for (const r of [1, 2, 3, 4]) {
    const s = sums[r], x = s[0] / s[3], y = s[1] / s[3], z = s[2] / s[3];
    lobeFace[r] = { yaw: -Math.atan2(x, z), pitch: Math.max(-0.2, Math.min(0.75, Math.atan2(y, Math.hypot(x, z)))) };
  }
  brain = new THREE.Mesh(geo, material);
  spin.add(brain);
  fitBrain(true);
}, undefined, () => { /* model failed: the flag still stands */ });

/* ---------- Size and zoom ---------- */
let zoom = 1, zoomTarget = 1, restScale = 1, maxScale = 1;
function fitBrain(reset) {
  const cfg = isMobile() ? VERSION.mobile : VERSION.desktop;
  const white = W - band * 2;
  restScale = Math.min(white * cfg.restFill, H * cfg.restHeight / 0.92) / brainLen;
  maxScale = W / brainLen;
  if (maxScale < restScale) maxScale = restScale;
  if (reset) zoom = zoomTarget = 1;
  zoomTarget = clampZoom(zoomTarget); zoom = clampZoom(zoom);
}
const clampZoom = (z) => Math.min(maxScale / restScale, Math.max(1, z));

function resize() {
  layoutFlag();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  uniforms.uPx.value = renderer.getPixelRatio();
  renderer.setSize(W, H, false);
  camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
  fitBrain(false);
}
addEventListener('resize', resize);
resize();

/* ---------- Motion state ---------- */
const BASE_SPEED = reduceMotion ? 0 : (Math.PI * 2) / 12; // one turn every 12 s
const BASE_PITCH = 0.18;
let yaw = 0.6, yawVel = BASE_SPEED, pitchDrag = 0;
let lean = { x: 0, y: 0 }, leanTarget = { x: 0, y: 0 };
let facing = null, faceUntil = 0, thinking = false;

/* ---------- Pointer: drag, click, pinch, wheel ---------- */
const pointers = new Map();
let down = null, pinch = null, lastMove = { t: 0, x: 0 };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

function hitBrain(x, y) {
  if (!brain) return null;
  ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(brain, false)[0];
  if (!hit) return null;
  const p = brain.worldToLocal(hit.point.clone()), B = uniforms.uBox.value;
  return lobeOf(Math.abs(p.x) / B.x, (p.y - B.y) / B.z, p.z / B.w);
}
const inBand = (x) => (x < band ? 'left' : x > W - band ? 'right' : null);

let lastHover = 0;
let motionAsked = false;
function askMotion() {
  if (motionAsked) return; motionAsked = true;
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') D.requestPermission().then((s) => s === 'granted' && listenTilt()).catch(() => {});
  else listenTilt();
}
function listenTilt() {
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    leanTarget.y = Math.max(-1, Math.min(1, e.gamma / 35)) * 0.45;
    leanTarget.x = Math.max(-1, Math.min(1, (e.beta - 45) / 35)) * 0.25;
  });
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.pointerType !== 'mouse') askMotion();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomTarget }; down = null; return;
  }
  down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, yaw, pitch: pitchDrag };
  lastMove = { t: performance.now(), x: e.clientX };
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !isMobile()) {
    leanTarget.y = ((e.clientX / W) * 2 - 1) * 0.35;
    leanTarget.x = ((e.clientY / H) * 2 - 1) * 0.2;
    canvas.classList.toggle('over-band', !!inBand(e.clientX) && pointers.size === 0);
    const t = performance.now();
    if (pointers.size === 0 && t - lastHover > 60) {
      lastHover = t;
      const r = inBand(e.clientX) ? null : hitBrain(e.clientX, e.clientY);
      hoverRegion = REGION_MODE[r] ? r : 0;
      canvas.classList.toggle('over-lobe', !!hoverRegion);
    }
  }
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    zoomTarget = clampZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return;
  }
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (!down.moved && Math.hypot(dx, dy) > 6) { down.moved = true; canvas.classList.add('dragging'); facing = null; }
  if (down.moved) {
    const now = performance.now(), k = 0.0085;
    const newYaw = down.yaw + dx * k;
    const dt = Math.max(1, now - lastMove.t) / 1000;
    yawVel = (newYaw - yaw) / dt * 0.5 + yawVel * 0.5;
    yaw = newYaw; lastMove = { t: now, x: e.clientX };
    pitchDrag = Math.max(-0.9, Math.min(0.9, down.pitch + dy * k));
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  canvas.classList.remove('dragging');
  if (!down) return;
  const d = down; down = null;
  if (performance.now() - lastMove.t > 80) yawVel = 0;
  if (d.moved || e.type === 'pointercancel') return;
  if (isMobile()) { const open = ['left', 'right'].find((s) => panels[s].classList.contains('open')); if (open) { closePanel(open); return; } }
  const r = hitBrain(e.clientX, e.clientY);
  if (r) { if (REGION_MODE[r]) selectMode(REGION_MODE[r], true); return; }
  const side = inBand(e.clientX);
  if (side) openPanel(side);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { hoverRegion = 0; if (!isMobile()) leanTarget = { x: 0, y: 0 }; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomTarget = clampZoom(zoomTarget * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* ---------- Modes ---------- */
// On a lobe click, a soft sheen sweeps down both closed bands to hint they open.
const sheens = [...document.querySelectorAll('.sheen')];
sheens.forEach((el) => el.addEventListener('animationend', () => el.classList.remove('sweep')));
function sweepBands() {
  if (reduceMotion || document.querySelector('.panel.open')) return;
  sheens.forEach((el) => { el.classList.remove('sweep'); void el.offsetWidth; el.classList.add('sweep'); });
}
let nameTimer = 0;
function selectMode(m, fromBrain) {
  mode = m;
  const M = MODES[m];
  uniforms.uActiveV.value.set(M.region === 1 ? 1 : 0, M.region === 2 ? 1 : 0, M.region === 3 ? 1 : 0, M.region === 4 ? 1 : 0);
  if (fromBrain) { activeShown = true; sweepBands(); }
  facing = lobeFace[M.region] || null; faceUntil = performance.now() + 3800;
  const el = $('modeName');
  if (fromBrain) {
    el.textContent = M.name; el.classList.add('show');
    clearTimeout(nameTimer); nameTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }
  // Mentor swaps both panels to the explainer. No AI call.
  const local = !!M.local;
  $('askForm').hidden = local; $('modeIntro').hidden = local;
  $('mentorLeft').hidden = !local; $('mentorRight').hidden = !local;
  $('answer').hidden = local; $('historyWrap').hidden = local;
  if (local) return;
  $('inMode').textContent = M.name;
  $('inHint').textContent = M.hint;
  $('question').placeholder = M.placeholder;
  $('guideBox').hidden = m !== 'guide';
  $('status').textContent = '';
  if (m === 'guide' && !$('optionList').children.length) { addOption(''); addOption(''); }
}

/* ---------- Panels ---------- */
const panels = { left: $('panelLeft'), right: $('panelRight') };
let openedAt = 0; // ignore the ghost click that follows the opening tap
function openPanel(side) {
  if (isMobile()) closePanel(side === 'left' ? 'right' : 'left');
  const p = panels[side];
  activeShown = true; openedAt = performance.now();
  p.classList.add('open'); p.removeAttribute('inert'); p.setAttribute('aria-hidden', 'false');
  if (side === 'left' && !isMobile()) setTimeout(() => $('question').focus({ preventScroll: true }), 300);
}
function closePanel(side) {
  const p = panels[side];
  if (!p.classList.contains('open')) return;
  if (p.contains(document.activeElement)) document.activeElement.blur();
  p.classList.remove('open'); p.setAttribute('inert', ''); p.setAttribute('aria-hidden', 'true');
  p.style.removeProperty('--drag');
}
for (const side of ['left', 'right']) {
  const p = panels[side];
  p.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => { if (performance.now() - openedAt > 450) closePanel(side); }));
  // Swipe back toward its own edge to close on mobile.
  const dir = side === 'left' ? -1 : 1;
  let start = null;
  p.addEventListener('touchstart', (e) => {
    if (!isMobile() || e.target.closest('textarea, input')) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), lock: null };
  }, { passive: true });
  p.addEventListener('touchmove', (e) => {
    if (!start) return;
    const dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y;
    if (!start.lock && Math.hypot(dx, dy) > 10) start.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (start.lock !== 'x') return;
    const d = Math.max(0, dx * dir);
    p.classList.add('dragging'); p.style.setProperty('--drag', (d * dir) + 'px');
  }, { passive: true });
  const endSwipe = (e) => {
    if (!start) return;
    const dx = (e.changedTouches[0].clientX - start.x) * dir, v = dx / (performance.now() - start.t), lock = start.lock;
    p.classList.remove('dragging'); p.style.removeProperty('--drag'); start = null;
    if (lock === 'x' && (dx > 90 || (dx > 35 && v > 0.5))) closePanel(side);
  };
  p.addEventListener('touchend', endSwipe);
  p.addEventListener('touchcancel', endSwipe);
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { const open = ['right', 'left'].find((s) => panels[s].classList.contains('open')); if (open) closePanel(open); }
});

/* ---------- Input ---------- */
const q = $('question');
const grow = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
q.addEventListener('input', () => grow(q));
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !isMobile()) { e.preventDefault(); $('askForm').requestSubmit(); }
});
function addOption(text, focus) {
  const list = $('optionList');
  if (list.children.length >= 8) return;
  const li = document.createElement('li');
  const input = document.createElement('input'); input.maxLength = 120; input.value = text; input.placeholder = 'Option'; input.setAttribute('aria-label', 'Option');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.metaKey || e.ctrlKey) $('askForm').requestSubmit(); else addOption('', true); } });
  const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '\u00d7'; x.setAttribute('aria-label', 'Remove option');
  x.addEventListener('click', () => li.remove());
  li.append(input, x); list.append(li);
  if (focus) input.focus();
}
$('addOption').addEventListener('click', () => addOption('', true));
const getOptions = () => [...$('optionList').querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);

async function relay(path, body) {
  const r = await fetch(RELAY + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'The brain is busy. Try again in a moment.');
  return data;
}
function setThinking(on) {
  thinking = on;
  if (on) { facing = lobeFace[MODES[mode].region] || null; faceUntil = Infinity; }
  else faceUntil = performance.now() + 2500;
}

$('suggest').addEventListener('click', async () => {
  const question = q.value.trim();
  if (!question) { $('status').textContent = 'Describe your situation first.'; q.focus(); return; }
  const b = $('suggest'); b.disabled = true; $('status').textContent = 'Thinking of options.';
  setThinking(true);
  try {
    const { options } = await relay('/suggest', { question });
    $('optionList').innerHTML = ''; options.forEach((o) => addOption(o));
    $('status').textContent = 'Edit them, add your own, then decide.';
  } catch (err) { $('status').textContent = err.message; }
  b.disabled = false; setThinking(false);
});

let busy = false;
$('askForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const question = q.value.trim();
  if (!question) { $('status').textContent = MODES[mode].hint; return; }
  const body = { mode, question };
  if (mode === 'guide') {
    body.options = getOptions();
    if (body.options.length < 2) { $('status').textContent = 'Add at least two options, or tap Suggest.'; return; }
  }
  busy = true; $('status').textContent = 'Thinking.'; setThinking(true);
  const started = performance.now();
  try {
    const data = await relay('/decide', body);
    const wait = Math.max(0, 1100 - (performance.now() - started)); // let the wave be seen
    await new Promise((r) => setTimeout(r, wait));
    $('status').textContent = '';
    showAnswer({ ...data, question }, true);
    if (isMobile()) closePanel('left');
    openPanel('right');
  } catch (err) { $('status').textContent = err.message; }
  busy = false; setThinking(false);
});

/* ---------- Answer cards ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (pct) => `<div class="bar"><i data-w="${Math.max(0, Math.min(100, pct))}"></i></div>`;
const CARDS = {
  oracle: (d) => `<p class="eyebrow">Oracle</p><p class="q">${esc(d.question)}</p>
    <p class="big">${d.verdict === 'YES' ? 'Yes' : 'No'}</p><p class="meta">${d.confidence}% confident</p>${bar(d.confidence)}`,
  judge: (d) => `<p class="eyebrow">Judge</p><p class="q">${esc(d.question)}</p>
    <p class="big">${d.score}<small>/ 100</small></p><p class="meta">Overall score</p>${bar(d.score)}
    <div class="subs">${['clarity', 'originality', 'risk'].map((k) => `<div><div class="sub-top"><span>${k[0].toUpperCase() + k.slice(1)}</span><b>${d.subscores[k]}</b></div>${bar(d.subscores[k])}</div>`).join('')}</div>`,
  guide: (d) => `<p class="eyebrow">Guide</p><p class="q">${esc(d.question)}</p>
    <p class="big word">${esc(d.ranked[0].option)}</p><p class="meta">${Math.round(d.ranked[0].probability * 100)}% likely the best choice</p>
    <div class="rank">${d.ranked.map((r) => `<div><div class="sub-top"><span>${esc(r.option)}</span><b>${Math.round(r.probability * 100)}%</b></div>${bar(r.probability * 100)}</div>`).join('')}</div>`,
};
const SHORT = { oracle: (d) => `${d.verdict === 'YES' ? 'Yes' : 'No'} ${d.confidence}%`, judge: (d) => `${d.score}/100`, guide: (d) => esc(d.ranked[0].option) };
const history = [];
function showAnswer(d, record) {
  const el = $('answer');
  el.innerHTML = CARDS[d.mode](d);
  el.classList.remove('land'); void el.offsetWidth; el.classList.add('land');
  requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.bar i').forEach((i) => { i.style.width = i.dataset.w + '%'; })));
  if (!record) return;
  history.unshift(d); if (history.length > 20) history.pop();
  $('historyTitle').hidden = history.length < 2;
  $('history').innerHTML = history.slice(1).map((h, i) => `<li data-i="${i + 1}"><span>${esc(h.question)}</span><b>${SHORT[h.mode](h)}</b></li>`).join('');
}
$('history').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) showAnswer(history[+li.dataset.i], false); });

let activeShown = false;
selectMode('oracle', false);
// Test hook: window.__sdiSelect('judge') lights that lobe as if it were tapped.
window.__sdiSelect = (m) => { if (MODES[m]) selectMode(m, true); };
window.__sdiState = () => ({ mode, yaw, ready: !!brain });
window.__sdiProbe = (x, y) => hitBrain(x, y);
window.__sdiPose = (y, p) => { facing = { yaw: y, pitch: p }; faceUntil = Infinity; };
window.__sdiFaces = () => lobeFace;

/* ---------- Loop ---------- */
const clock = new THREE.Clock();
const angleTo = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
let hoverRegion = 0;
const amt = [0, 0, 0, 0], hovAmt = [0, 0, 0, 0];
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
  uniforms.uTime.value += reduceMotion ? 0 : dt;
  const dragging = down && down.moved;
  if (facing && now > faceUntil) facing = null;
  if (!dragging) {
    if (facing) {
      const d = angleTo(yaw, facing.yaw);
      yaw += d * Math.min(1, dt * 3.2); yawVel = 0;
      pitchDrag += (facing.pitch - BASE_PITCH - pitchDrag) * Math.min(1, dt * 3.2);
    } else {
      yawVel += (BASE_SPEED - yawVel) * Math.min(1, dt * 1.6);
      yaw += yawVel * dt;
      pitchDrag += (0 - pitchDrag) * Math.min(1, dt * 1.8);
    }
  }
  lean.x += (leanTarget.x - lean.x) * Math.min(1, dt * 3);
  lean.y += (leanTarget.y - lean.y) * Math.min(1, dt * 3);
  spin.rotation.y = yaw + lean.y;
  tilt.rotation.x = BASE_PITCH + pitchDrag + lean.x;
  zoom += (zoomTarget - zoom) * Math.min(1, dt * 8);
  const s = restScale * zoom; tilt.scale.setScalar(s); tilt.position.y = brainLen * s * lift;
  // Lobe tint shows once a mode has been chosen on the brain or a panel is open.
  activeShown = activeShown || thinking;
  // Each lobe fades in or out over about 300 ms.
  const k = Math.min(1, dt * 10), av = uniforms.uActiveV.value.toArray();
  for (let i = 0; i < 4; i++) {
    amt[i] += ((activeShown && av[i] ? 1 : 0) - amt[i]) * k;
    hovAmt[i] += ((hoverRegion === i + 1 ? 1 : 0) - hovAmt[i]) * k;
  }
  uniforms.uAmt.value.fromArray(amt); uniforms.uHover.value.fromArray(hovAmt);
  uniforms.uThink.value += ((thinking ? 1 : 0) - uniforms.uThink.value) * Math.min(1, dt * (thinking ? 3 : 1.2));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
mobileQuery.addEventListener('change', () => { resize(); fitBrain(true); });
