// Probability Engine: the copper flag, the brain, the hidden bands, the shared history and the live agent feed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Local testing talks to wrangler dev on 127.0.0.1:8787; every other host uses the deployed pe-relay.
const RELAY = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'http://127.0.0.1:8787'
  : 'https://pe-relay.anticontainment-system.workers.dev';
const COPPER = '#B87333';
const KEY_STORE = 'pe.key', HIST_STORE = 'pe.history.cache', CLIENT_STORE = 'pe.client', ONBOARD_STORE = 'pe.onboarded';
let sharpenState = null; // the weak answer the Sharpen section would re-ask
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Phone layout also covers narrow desktop windows, where side panels would cover the brain.
const mobileQuery = matchMedia('(max-width: 1023px), (pointer: coarse) and (orientation: portrait)');
const touchQuery = matchMedia('(pointer: coarse)');
const isTouch = () => touchQuery.matches;
const isMobile = () => mobileQuery.matches;

// Version settings. Each version sets its own sizes.
const VERSION = {
  desktop: { restFill: 0.74, restHeight: 0.62 },
  mobile: { restFill: 1.08, restHeight: 0.6 },
};

// Modes. A fourth mode is one more entry here, one more region, and one more card.
// Regions: 1 frontal (front), 2 parietal (top), 3 temporal (lower side), 4 occipital (back).
const MODES = {
  guide: { name: 'Guide', region: 1, hint: 'Describe the full situation with every constraint, then list real, distinct options or let the brain suggest some.', placeholder: 'Describe your situation. Who, goal, budget, time, place, what is ruled out.' },
  judge: { name: 'Judge', region: 2, hint: 'Submit an idea, a line, or a plan. Give it the full picture: the engine knows only what you write.', placeholder: 'Your idea, with its goal and constraints' },
  settings: { name: 'Settings', region: 3, local: 'settings' },
  oracle: { name: 'Oracle', region: 4, hint: 'Ask a yes or no question. Include the timeframe and the facts that matter.', placeholder: 'Will it work by when, given what?' },
};
const REGION_MODE = { 1: 'guide', 2: 'judge', 3: 'settings', 4: 'oracle' };
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
scene.add(new THREE.HemisphereLight(0xfff6ec, 0x3a2412, 0.9));
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
  uLight: { value: new THREE.Color('#E8A86E') }, uDeep: { value: new THREE.Color('#6E3A14') },
  uLine: { value: new THREE.Color('#F6E6D2') },
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
// Double sided, so gaps in the mesh where lobes meet the cerebellum never show the charcoal through.
const material = new THREE.MeshStandardMaterial({ color: COPPER, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
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
      // Thin organic groove lines on each boundary, about 1.5 px, light copper-cream at 0.6, stronger beside the active lobe.
      vec3 n2 = lobeN(vPos);
      vec4 f2 = lobeFields(n2);
      vec4 fw = max(fwidth(f2), vec4(1e-6));
      vec4 dl = abs(f2) / (fw * uPx);
      float cer = sst(0.035, 0.075, f2.x);
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
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('../assets/brain.glb', (gltf) => {
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
  if (e.pointerType === 'mouse' && !isTouch()) {
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
// A lobe tap picks the mode and opens the left panel with the glide and one sweep
// (Settings opens "How it works"). Re-tapping the same lobe after closing the panel leaves it closed;
// a different lobe opens it again. Nothing opens on page load.
let lastLobe = null;
function tapLobe(m) {
  const same = m === lastLobe; lastLobe = m;
  const open = panels.left.classList.contains('open');
  const willOpen = !same && !open;
  selectMode(m, true, willOpen || (!same && open));
  if (willOpen) openPanel('left', true);
  else if (!same && open) sweepPanel('left');
}
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  canvas.classList.remove('dragging');
  if (!down) return;
  const d = down; down = null;
  if (performance.now() - lastMove.t > 80) yawVel = 0;
  if (d.moved || e.type === 'pointercancel') return;
  if (isMobile() && isTouch()) {
    const open = ['left', 'right'].find((s) => panels[s].classList.contains('open'));
    // The thin cue on the question side: tap it to glide back to the question panel.
    if (open === 'right' && e.clientX < W * 0.14) { openPanel('left'); return; }
    if (open) { cancelGlide(); closePanel(open); return; }
  }
  const r = hitBrain(e.clientX, e.clientY);
  if (r) { if (REGION_MODE[r]) tapLobe(REGION_MODE[r]); return; }
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
const drafts = { guide: '', judge: '', oracle: '' }; // each mode keeps its own text
function selectMode(m, fromBrain, noBandSweep) {
  const qBox = $('question');
  // A live agent feed is not the person's draft: never save it as one, and clear it when they move on.
  if (m !== mode && drafts[mode] !== undefined && !qBox.classList.contains('terminal')) drafts[mode] = qBox.value;
  if (qBox.classList.contains('terminal') && !livePlaying) endTerminal();
  if (m !== mode) hideSharpen();
  mode = m;
  const M = MODES[m];
  uniforms.uActiveV.value.set(M.region === 1 ? 1 : 0, M.region === 2 ? 1 : 0, M.region === 3 ? 1 : 0, M.region === 4 ? 1 : 0);
  if (fromBrain) { activeShown = true; if (!noBandSweep) sweepBands(); }
  facing = lobeFace[M.region] || null; faceUntil = performance.now() + 3800;
  const el = $('modeName');
  if (fromBrain) {
    // Restart the fade every time, even if the name was already showing.
    clearTimeout(nameTimer);
    el.classList.remove('show'); el.textContent = M.name; void el.offsetWidth;
    el.classList.add('show');
    nameTimer = setTimeout(() => el.classList.remove('show'), 1700);
  }
  // Settings swaps both panels to local text. No AI call.
  const local = M.local || '';
  $('closeStep').textContent = isTouch() ? 'Swipe a panel back toward its edge to close it.' : 'Click the band edge or press Escape to close it.';
  $('askForm').hidden = !!local; $('modeIntro').hidden = !!local;
  $('settingsLeft').hidden = local !== 'settings'; $('settingsRight').hidden = local !== 'settings';
  $('answer').hidden = !!local; $('historyWrap').hidden = !!local;
  document.querySelectorAll('#toolNav [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === m)));
  if (local) return;
  $('inMode').textContent = M.name;
  $('question').setAttribute('aria-label', m === 'judge' ? 'Judge submission' : m === 'guide' ? 'Guide situation' : 'Oracle question');
  $('inHint').textContent = M.hint;
  $('question').placeholder = M.placeholder;
  $('question').value = drafts[m] || ''; syncClear($('question'));
  $('guideBox').hidden = m !== 'guide';
  // Every mode has a visible submit: Oracle ASK, Judge SCORE, Guide DECIDE (inside the options box).
  $('askBtn').hidden = m === 'guide'; $('askBtn').textContent = m === 'judge' ? 'Score' : 'Ask';
  $('status').textContent = '';
  if (m === 'guide' && !$('optionList').children.length) { addOption(''); addOption(''); }
}

/* ---------- Panels ---------- */
const panels = { left: $('panelLeft'), right: $('panelRight') };
let openedAt = 0; // ignore the ghost click that follows the opening tap
// Soft glide timing. Must match --open and --close in style.css.
const OPEN_MS = reduceMotion ? 0 : 700, CLOSE_MS = reduceMotion ? 0 : 600, BEAT_MS = reduceMotion ? 0 : 200;
let glideTimers = [];
function cancelGlide() { glideTimers.forEach(clearTimeout); glideTimers = []; }
const later = (fn, ms) => { glideTimers.push(setTimeout(fn, ms)); };
// One white pass down an open panel, after it settles.
function sweepPanel(side) {
  if (reduceMotion) return;
  const el = panels[side].querySelector('.psheen');
  el.classList.remove('sweep', 'loop'); void el.offsetWidth; el.classList.add('sweep');
}
// Opens a panel with the soft glide. On mobile only one shows: the other eases back
// to its edge, a short beat shows the brain, then this one eases in.
function openPanel(side, sweep) {
  const other = side === 'left' ? 'right' : 'left';
  cancelGlide();
  const wasOpen = panels[side].classList.contains('open');
  if (isMobile() && panels[other].classList.contains('open')) {
    closePanel(other);
    later(() => { showPanel(side); if (sweep) later(() => sweepPanel(side), OPEN_MS); }, CLOSE_MS + BEAT_MS);
    return;
  }
  showPanel(side);
  if (sweep) later(() => sweepPanel(side), wasOpen ? 0 : OPEN_MS);
}
function showPanel(side) {
  const p = panels[side];
  activeShown = true; openedAt = performance.now();
  p.classList.add('open'); p.removeAttribute('inert'); p.setAttribute('aria-hidden', 'false');
  if (side === 'left' && !isTouch()) setTimeout(() => $('question').focus({ preventScroll: true }), 300);
  syncCue();
}
function closePanel(side) {
  const p = panels[side];
  if (!p.classList.contains('open')) return;
  if (p.contains(document.activeElement)) document.activeElement.blur();
  p.classList.remove('open'); p.setAttribute('inert', ''); p.setAttribute('aria-hidden', 'true');
  p.style.removeProperty('--drag');
  syncCue();
}
// On mobile, while the answer panel is open, a thin white line on the question side says it is still there.
function syncCue() { document.body.classList.toggle('cue-left', isMobile() && panels.right.classList.contains('open')); }
for (const side of ['left', 'right']) {
  const p = panels[side];
  p.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => { if (performance.now() - openedAt > 450) { cancelGlide(); closePanel(side); } }));
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
  if (e.key === 'Escape') { cancelGlide(); ['right', 'left'].forEach(closePanel); }
});

/* ---------- Input ---------- */
const X_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const q = $('question');
q.after(makeClear(q, () => { if (drafts[mode] !== undefined) drafts[mode] = ''; }));
syncClear(q);
// The box has a fixed height and scrolls inside, so typing never reflows the panel.
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !isTouch()) { e.preventDefault(); $('askForm').requestSubmit(); }
});
// Clear buttons: a small white x inside the right edge of each text field.
// Always takes its space (only visibility changes), so typing never shifts the layout.
function makeClear(field, onClear) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'clear'; b.innerHTML = X_SVG; b.setAttribute('aria-label', 'Clear text'); b.tabIndex = -1;
  b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus and the keyboard
  b.addEventListener('click', () => {
    field.value = ''; if (onClear) onClear();
    field.focus({ preventScroll: true }); syncClear(field);
  });
  field._clear = b; return b;
}
function syncClear(field) { if (field._clear) field._clear.classList.toggle('on', field.value.length > 0); }
document.addEventListener('input', (e) => { if (e.target._clear) syncClear(e.target); });
function addOption(text, focus) {
  const list = $('optionList');
  if (list.children.length >= 8) return null;
  const li = document.createElement('li');
  const input = document.createElement('input'); input.maxLength = 120; input.value = text; input.placeholder = 'Option'; input.setAttribute('aria-label', 'Option ' + (list.children.length + 1));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.metaKey || e.ctrlKey) $('askForm').requestSubmit(); else addOption('', true); } });
  input.addEventListener('focus', () => { if (q.classList.contains('terminal') && !livePlaying) endTerminal(); });
  const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '\u00d7'; x.setAttribute('aria-label', 'Remove option ' + (list.children.length + 1));
  x.addEventListener('click', () => { if (!livePlaying) { li.remove(); relabelOptions(); } });
  li.append(input, x); list.append(li);
  if (focus) input.focus();
  return input;
}
$('addOption').addEventListener('click', () => { if (q.classList.contains('terminal') && !livePlaying) endTerminal(); addOption('', true); });
function relabelOptions() { [...$('optionList').children].forEach((li, i) => { const inp = li.querySelector('input'), x = li.querySelector('.x'); if (inp) inp.setAttribute('aria-label', 'Option ' + (i + 1)); if (x) x.setAttribute('aria-label', 'Remove option ' + (i + 1)); }); }
// Hidden, labelled tool buttons: pick a tool without hunting on the canvas (same as tapping its lobe).
document.querySelectorAll('#toolNav [data-tool]').forEach((b) => b.addEventListener('click', () => {
  const m = b.dataset.tool;
  if (m === lastLobe && !panels.left.classList.contains('open')) { selectMode(m, true, true); openPanel('left', true); }
  else tapLobe(m);
}));
const getOptions = () => [...$('optionList').querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
const setOptions = (opts) => { $('optionList').innerHTML = ''; opts.forEach((o) => addOption(o)); };
// Settings: section links scroll inside the panel (no page jump, no hash change).
function jumpTo(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
document.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); jumpTo(a.getAttribute('href').slice(1)); }));
// Settings: each explainer panel links to the other with the same glide.
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const to = b.dataset.go;
  if (!isMobile() && panels[to].classList.contains('open')) { sweepPanel(to); return; }
  openPanel(to, true);
}));
/* ---------- Access key and relay ---------- */
// The key is never in these files. It is typed once and kept in this browser's localStorage.
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };
const CLIENT = store.get(CLIENT_STORE) || (() => { const c = 'web-' + Math.random().toString(36).slice(2, 10); store.set(CLIENT_STORE, c); return c; })();
let keyWaiters = [];
function askKey(wrong) {
  $('keyTitle').textContent = wrong ? 'Key not accepted' : 'Access key';
  $('keyHint').textContent = wrong ? 'That key did not work. Enter it again.' : 'Enter the access key once. It stays in this browser.';
  $('keyGate').hidden = false; $('keyInput').value = '';
  setTimeout(() => $('keyInput').focus(), 50);
  return new Promise((res) => keyWaiters.push(res));
}
$('keyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('keyInput').value.trim(); if (!k) return;
  store.set(KEY_STORE, k); $('keyInput').value = ''; $('keyGate').hidden = true;
  const w = keyWaiters; keyWaiters = []; w.forEach((f) => f());
});
$('changeKey').addEventListener('click', () => { store.del(KEY_STORE); askKey(false).then(() => { lastRev = 0; loadHistory(); }); });
window.__peOnboarding = () => openOnboarding();
async function relay(path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = store.get(KEY_STORE);
    if (!key) { await askKey(false); continue; }
    const r = await fetch(RELAY + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'Authorization': 'Bearer ' + key }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { store.del(KEY_STORE); await askKey(true); continue; }
    if (!r.ok) { const err = new Error(data.message || 'The engine is busy. Try again in a moment.'); err.status = r.status; err.data = data; throw err; }
    return data;
  }
  throw new Error('Access key required.');
}
// Working state: the pressed button pulses and a slow sheen loops down the question panel.
let workingBtn = null;
function setWorking(btn, on) {
  const sh = panels.left.querySelector('.psheen');
  if (on) {
    workingBtn = btn && btn.offsetParent ? btn : null;
    if (workingBtn) workingBtn.classList.add('working');
    if (!reduceMotion) { sh.classList.remove('sweep'); sh.classList.add('loop'); }
  } else {
    if (workingBtn) workingBtn.classList.remove('working');
    workingBtn = null; sh.classList.remove('loop');
  }
}
function setThinking(on) {
  thinking = on;
  if (on) { if (!down) { facing = lobeFace[MODES[mode].region] || null; faceUntil = Infinity; } }
  else if (facing) faceUntil = performance.now() + 1500;
}

// Suggest: Workers AI drafts options from the situation. Not saved to history.
$('suggest').addEventListener('click', async () => {
  if (livePlaying) return;
  if (q.classList.contains('terminal')) endTerminal();
  const situation = q.value.trim();
  if (!situation) { $('status').textContent = 'Describe your situation first.'; q.focus(); return; }
  const b = $('suggest'); b.disabled = true; $('status').textContent = 'Thinking of options.';
  setThinking(true); setWorking(b, true);
  try {
    const { options } = await relay('/suggest', { situation, client: CLIENT });
    setOptions(options);
    $('status').textContent = 'Edit them, add your own, then decide.';
  } catch (err) { $('status').textContent = err.message; }
  b.disabled = false; setThinking(false); setWorking(b, false);
});

let busy = false;
$('askForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy || livePlaying) return;
  if (q.classList.contains('terminal')) { endTerminal(); return; }
  const question = q.value.trim();
  if (!question) { $('status').textContent = MODES[mode].hint; return; }
  const body = mode === 'judge' ? { submission: question, client: CLIENT } : mode === 'guide' ? { situation: question, client: CLIENT } : { question, client: CLIENT };
  if (mode === 'guide') {
    body.options = getOptions();
    if (body.options.length < 2) { $('status').textContent = 'Add at least two options, or tap Suggest.'; return; }
  }
  const pressed = e.submitter && e.submitter.offsetParent ? e.submitter : (mode === 'guide' ? $('decideBtn') : $('askBtn'));
  await sendAsk(body, question, pressed);
});
// Sends one oracle/judge/guide call from this page and shows the answer (also used by Sharpen).
async function sendAsk(body, question, pressed) {
  busy = true; $('status').textContent = 'Thinking.'; setThinking(true); hideSharpen();
  setWorking(pressed, true);
  const started = performance.now();
  try {
    const data = await relay('/' + mode, body);
    const wait = Math.max(0, 1100 - (performance.now() - started)); // let the wave be seen
    await new Promise((r) => setTimeout(r, wait));
    $('status').textContent = '';
    setWorking(null, false);
    showAnswer({ ...data, question, source: 'web' }, true);
    if (data.id) seen.add(data.id);
    if (data.sharpen) showSharpen({ id: data.id, mode, question, options: body.options || null, context: body.context ?? null, sharpen: data.sharpen });
    openPanel('right', true); // every mode: the answer panel opens by itself, then one sweep
  } catch (err) {
    // 422: the brain understood but the question does not fit the mode. Say so in the answer panel, in theme.
    if (err.status === 422 && NOTICE[mode]) {
      const wait = Math.max(0, 1100 - (performance.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      $('status').textContent = '';
      setWorking(null, false);
      showAnswer({ mode: 'notice', of: mode, question, source: 'web', ...NOTICE[mode] }, false);
      if (err.data && err.data.id) seen.add(err.data.id);
      openPanel('right', true);
    } else $('status').textContent = err.message;
  }
  setWorking(null, false);
  busy = false; setThinking(false);
}

/* ---------- Sharpen: a weak answer lists its gaps; fill them and re-ask, linked to the original ---------- */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
function hideSharpen() { sharpenState = null; $('sharpen').hidden = true; $('sharpenFields').innerHTML = ''; }
function showSharpen(st) {
  if (!st.id || !st.sharpen || !st.sharpen.fill || !st.sharpen.fill.length || st.mode !== mode) return;
  sharpenState = st;
  $('sharpenNote').textContent = 'Missing: ' + st.sharpen.missing.join(', ') + '. Fill what you can, then ask again.';
  const box = $('sharpenFields'); box.innerHTML = '';
  st.sharpen.fill.forEach((f) => {
    const label = document.createElement('label');
    const span = document.createElement('span'); span.textContent = f.prompt;
    const input = document.createElement('input'); input.dataset.key = f.key; input.maxLength = 600; input.setAttribute('aria-label', 'Sharpen: ' + f.prompt);
    if (f.key === 'today') input.value = localToday();
    if (f.key === 'timezone') input.value = localZone();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('sharpenBtn').click(); } });
    label.append(span, input); box.append(label);
  });
  $('sharpenBtn').setAttribute('aria-label', `Sharpen and ask again (re-ask of #${st.id})`);
  $('sharpen').hidden = false;
}
$('sharpenBtn').addEventListener('click', async () => {
  const st = sharpenState; if (!st || busy || livePlaying) return;
  const add = {};
  $('sharpenFields').querySelectorAll('input').forEach((i) => { if (i.value.trim()) add[i.dataset.key] = i.value.trim(); });
  if (!Object.keys(add).length) { $('status').textContent = 'Fill at least one field.'; return; }
  const base = st.context == null ? {} : typeof st.context === 'string' ? { notes: st.context } : { ...st.context };
  const context = { ...base, ...add };
  if (q.classList.contains('terminal')) endTerminal();
  const question = q.value.trim() || st.question; // the person may sharpen the question itself too
  const f = st.mode === 'judge' ? 'submission' : st.mode === 'guide' ? 'situation' : 'question';
  const body = { [f]: question, context, reask_of: st.id, client: CLIENT };
  if (st.mode === 'guide') body.options = getOptions().length >= 2 ? getOptions() : st.options;
  await sendAsk(body, question, $('sharpenBtn'));
});

/* ---------- Track record: mark Oracle answers right or wrong ---------- */
function renderTrack() {
  const o = history.filter((e) => e.mode === 'oracle' && e.status === 'done' && e.outcome);
  const right = o.filter((e) => e.outcome === 'right').length;
  const c = o.filter((e) => e.answer && e.answer.confidence >= 70), cr = c.filter((e) => e.outcome === 'right').length;
  $('trackText').textContent = o.length ? `Oracle: ${right} of ${o.length} right` : 'Oracle: no answers marked yet.';
  $('trackCal').textContent = c.length ? `Answers at 70% or more: ${cr} of ${c.length} right.` : '';
}
$('answer').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mark]'); if (!b) return;
  const id = +b.dataset.id, outcome = b.dataset.mark === 'clear' ? null : b.dataset.mark;
  b.disabled = true;
  try {
    const r = await relay('/mark', { id, outcome, client: CLIENT });
    if (r.entry) { upsert(r.entry); renderHistory(); saveCache(); renderCard(cardOf(r.entry)); }
  } catch (err) { $('status').textContent = err.message; b.disabled = false; }
});

/* ---------- Answer cards ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (pct) => `<div class="bar"><i data-w="${Math.max(0, Math.min(100, pct))}"></i></div>`;
const NOTICE = {
  oracle: { title: 'Ask a yes or no question.', note: 'That one needs a different kind of answer. Rephrase it as yes or no, with a timeframe, or use Guide to compare options.' },
  guide: { title: 'None of these options fit.', note: 'Try different ones, or tap Suggest.' },
};
// Who asked: shown on every card so watchers can tell web from agents.
const who = (d) => (d.source && d.source !== 'web' ? `<span class="who">${esc(d.agent || 'agent')} · ${esc(d.source)}</span>` : (d.source === 'web' && d.agent ? `<span class="who">${esc(d.agent)}</span>` : ''))
  + (d.reask_of ? `<span class="who">re-ask of #${+d.reask_of}</span>` : '');
// Right / Wrong / Clear on finished Oracle answers (track record).
const markRow = (d) => !d.id ? '' : `<div class="mark" role="group" aria-label="Track record for Oracle answer #${+d.id}">
  <button type="button" class="btn" data-mark="right" data-id="${+d.id}" aria-pressed="${d.outcome === 'right'}" aria-label="Mark Oracle answer #${+d.id} right">Right</button>
  <button type="button" class="btn" data-mark="wrong" data-id="${+d.id}" aria-pressed="${d.outcome === 'wrong'}" aria-label="Mark Oracle answer #${+d.id} wrong">Wrong</button>
  ${d.outcome ? `<button type="button" class="btn" data-mark="clear" data-id="${+d.id}" aria-label="Clear the mark on Oracle answer #${+d.id}">Clear</button><span class="mark-state">Marked ${d.outcome}</span>` : ''}</div>`;
const CARDS = {
  notice: (d) => `<p class="eyebrow">${MODES[d.of].name}${who(d)}</p><p class="q">${esc(d.question)}</p>
    <p class="big word">${esc(d.title)}</p><p class="meta notice">${esc(d.note)}</p>`,
  oracle: (d) => `<p class="eyebrow">Oracle${who(d)}</p><p class="q">${esc(d.question)}</p>
    <p class="big">${d.verdict === 'YES' ? 'Yes' : 'No'}</p><p class="meta">${d.confidence}% confident</p>${bar(d.confidence)}${markRow(d)}`,
  judge: (d) => `<p class="eyebrow">Judge${who(d)}</p><p class="q">${esc(d.question)}</p>
    <p class="big">${d.score}<small>/ 100</small></p><p class="meta">Overall, ${d.confidence}% confident</p>${bar(d.score)}
    <div class="subs">${['clarity', 'originality', 'risk'].map((k) => `<div><div class="sub-top"><span>${k[0].toUpperCase() + k.slice(1)}</span><b>${d.subscores[k]}</b></div>${bar(d.subscores[k])}</div>`).join('')}</div>`,
  guide: (d) => `<p class="eyebrow">Guide${who(d)}</p><p class="q">${esc(d.question)}</p>
    <p class="big word">${esc(d.ranked[0].option)}</p><p class="meta">${Math.round(d.ranked[0].probability * 100)}% likely the best choice, ${d.confidence}% confident</p>
    <div class="rank">${d.ranked.map((r) => `<div><div class="sub-top"><span>${esc(r.option)}</span><b>${Math.round(r.probability * 100)}%</b></div>${bar(r.probability * 100)}</div>`).join('')}</div>`,
};
const SHORT = { oracle: (d) => `${d.verdict === 'YES' ? 'Yes' : 'No'} ${d.confidence}%`, judge: (d) => `${d.score}/100`, guide: (d) => esc(d.ranked[0].option), notice: () => 'No fit', error: () => 'No answer' };
function renderCard(d) {
  const el = $('answer');
  el.innerHTML = (CARDS[d.mode] || CARDS.notice)(d);
  el.querySelectorAll('.bar i').forEach((i) => { i.style.transition = 'none'; i.style.width = i.dataset.w + '%'; });
}
function showAnswer(d) {
  const el = $('answer');
  el.innerHTML = (CARDS[d.mode] || CARDS.notice)(d);
  el.classList.remove('land'); void el.offsetWidth; el.classList.add('land');
  requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.bar i').forEach((i) => { i.style.width = i.dataset.w + '%'; })));
  // The record itself lives on the server; the next poll brings it into the history list.
  pollSoon();
}

/* ---------- Shared history (server-side, newest 200; localStorage is only a cache) ---------- */
const HIST_CAP = 200;
let history = []; // server entries, newest first
const seen = new Set(); // entry ids this browser has already shown live
try { history = JSON.parse(store.get(HIST_STORE) || '[]').slice(0, HIST_CAP); } catch { history = []; }
history.forEach((e) => seen.add(e.id));
// A finished entry as a card.
function cardOf(e) {
  const base = { question: e.question, source: e.source, agent: e.agent, id: e.id, outcome: e.outcome, reask_of: e.reask_of };
  if (e.status === 'done') return { ...e.answer, ...base, mode: e.mode };
  if (e.status === 'rejected') return { ...base, mode: 'notice', of: e.mode, ...NOTICE[e.mode] || NOTICE.oracle };
  return { ...base, mode: 'notice', of: e.mode, title: 'No answer.', note: (e.answer && e.answer.message) || 'The engine did not answer.' };
}
const shortOf = (e) => e.status === 'done' && SHORT[e.mode] ? SHORT[e.mode](e.answer) : e.status === 'rejected' ? (e.mode === 'oracle' ? 'Not yes/no' : SHORT.notice()) : SHORT.error();
function renderHistory() {
  const done = history.filter((e) => e.status !== 'pending');
  $('historyTitle').hidden = !done.length;
  $('historyTitle').textContent = `History · ${done.length}`;
  $('history').innerHTML = done.map((e) => `<li data-id="${e.id}"><span>${e.reask_of ? `<em>re #${+e.reask_of}</em> ` : ''}${e.source !== 'web' ? `<em>${esc(e.agent || e.source)}</em> ` : ''}${esc(e.question)}</span><b>${shortOf(e)}${e.outcome ? `<span class="oc">${e.outcome}</span>` : ''}</b></li>`).join('');
  renderTrack();
  requestAnimationFrame(syncHistFade);
}
function upsert(e) {
  const i = history.findIndex((h) => h.id === e.id);
  if (i >= 0) history[i] = e; else { history.push(e); history.sort((a, b) => b.id - a.id); }
  // Mirror the server cap: over 200, the oldest goes, one at a time.
  while (history.length > HIST_CAP) history.pop();
}
const saveCache = () => store.set(HIST_STORE, JSON.stringify(history.filter((e) => e.status !== 'pending')));
let lastRev = 0, pollTimer = 0, polling = false;
async function loadHistory() {
  try {
    const h = await relay('/history?order=desc&limit=200');
    history = h.entries; history.forEach((e) => seen.add(e.id));
    lastRev = h.rev || 0;
    renderHistory(); saveCache();
    return true;
  } catch (e) { renderHistory(); return false; }
}
function pollSoon() { clearTimeout(pollTimer); pollTimer = setTimeout(poll, 300); }
async function poll() {
  clearTimeout(pollTimer);
  if (polling || !store.get(KEY_STORE)) { pollTimer = setTimeout(poll, 2000); return; }
  polling = true;
  try {
    const l = await relay('/live?after=' + lastRev);
    lastRev = l.rev;
    if (l.deleted && l.deleted.length) { const gone = new Set(l.deleted); history = history.filter((h) => !gone.has(h.id)); renderHistory(); saveCache(); }
    for (const e of l.entries) {
      upsert(e);
      // Someone else (an agent, or another browser) asked: play it live, once per entry.
      if (e.client !== CLIENT && !seen.has(e.id)) { seen.add(e.id); liveQueue.push(e.id); }
    }
    if (l.entries.length) { renderHistory(); saveCache(); }
    playLive();
  } catch (e) { /* offline or busy: try again */ }
  polling = false;
  pollTimer = setTimeout(poll, document.hidden ? 6000 : 2000);
}

/* ---------- Live terminal: agent input types itself into the fields ---------- */
// Oracle and Judge: the question box. Guide: the situation box, then each option in turn.
const liveQueue = []; let livePlaying = false, liveDraft = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byId = (id) => history.find((h) => h.id === id);
const optInputs = () => [...$('optionList').querySelectorAll('input')];
function setTerminal(on) {
  q.classList.toggle('terminal', on); q.readOnly = on;
  $('optionList').classList.toggle('terminal', on); $('guideBox').classList.toggle('terminal', on);
  optInputs().forEach((i) => { i.classList.toggle('terminal', on); i.readOnly = on; });
}
// Leave the terminal view and give the person their own draft (and Guide options) back.
function endTerminal() {
  setTerminal(false); $('liveTag').hidden = true;
  if (liveDraft) {
    drafts[liveDraft.mode] = liveDraft.text;
    if (liveDraft.options) setOptions(liveDraft.options);
  }
  while (mode === 'guide' && $('optionList').children.length < 2) addOption('');
  q.value = drafts[mode] || '';
  liveDraft = null; syncClear(q);
}
async function typeInto(el, text, perStep) {
  const step = reduceMotion ? Math.max(1, text.length) : Math.max(1, Math.ceil(text.length / perStep)); // long inputs type faster
  for (let i = 0; i < text.length; i += step) { el.value = text.slice(0, i + step); el.scrollTop = el.scrollHeight; await sleep(reduceMotion ? 0 : 22); }
  el.value = text;
}
async function playLive() {
  if (livePlaying || !liveQueue.length || busy) return;
  livePlaying = true;
  try {
  while (liveQueue.length) {
    const e = byId(liveQueue.shift()); if (!e) continue;
    if (!MODES[e.mode] || MODES[e.mode].local) continue;
    $('liveDot').hidden = false; hideSharpen();
    // Keep whatever the person here was typing; it comes back when they tap a field.
    if (liveDraft === null && !MODES[mode].local) liveDraft = { mode, text: q.value, options: getOptions() };
    if (mode !== e.mode) selectMode(e.mode, true, true);
    if (!panels.left.classList.contains('open')) openPanel('left');
    const tag = $('liveTag'); tag.hidden = false; tag.textContent = `> ${e.agent || 'agent'} · ${e.source} · #${e.id}`;
    if (e.mode === 'guide') $('optionList').innerHTML = '';
    setTerminal(true); q.value = ''; syncClear(q);
    $('status').textContent = '';
    setThinking(true); setWorking(null, true);
    const text = e.question + (e.context != null ? '\n\n// context\n' + (typeof e.context === 'string' ? e.context : JSON.stringify(e.context, null, 1)) : '');
    await typeInto(q, text, 160);
    q.scrollTop = 0; // back to the question itself
    if (e.mode === 'guide') {
      for (const o of e.options || []) {
        const inp = addOption(''); if (!inp) break;
        inp.classList.add('terminal'); inp.readOnly = true;
        await typeInto(inp, o, 40); await sleep(reduceMotion ? 0 : 120);
      }
    }
    // Wait for the answer (the poll keeps updating the entry).
    let cur = byId(e.id), waited = 0;
    while (cur && cur.status === 'pending' && waited < 45000) { await sleep(400); waited += 400; cur = byId(e.id); }
    setThinking(false); setWorking(null, false);
    if (cur && cur.status !== 'pending') { showAnswer(cardOf(cur)); openPanel('right', true); }
    q.readOnly = false;
    await sleep(liveQueue.length ? 1200 : 400);
  }
  } catch (err) { setThinking(false); setWorking(null, false); q.readOnly = false; }
  finally {
    // Live is on only while an agent call is playing; it always turns off when idle.
    $('liveDot').hidden = true;
    livePlaying = false;
  }
}
// Tap the box after a live feed to get your own draft back (pointerdown too, in case the box already has focus).
const backToDraft = () => { if (q.classList.contains('terminal') && !livePlaying) endTerminal(); };
q.addEventListener('focus', backToDraft);
q.addEventListener('pointerdown', backToDraft);
// History scrolls on its own. Soft fades show only where there is more to see.
function syncHistFade() {
  const h = $('history');
  h.classList.toggle('fade-top', h.scrollTop > 2);
  h.classList.toggle('fade-bottom', h.scrollTop + h.clientHeight < h.scrollHeight - 2);
}
$('history').addEventListener('scroll', syncHistFade, { passive: true });
addEventListener('resize', () => requestAnimationFrame(syncHistFade));
panels.right.addEventListener('transitionend', syncHistFade);
$('history').addEventListener('click', (e) => { const li = e.target.closest('li'); const h = li && byId(+li.dataset.id); if (h) { const el = $('answer'); el.innerHTML = (CARDS[cardOf(h).mode] || CARDS.notice)(cardOf(h)); requestAnimationFrame(() => el.querySelectorAll('.bar i').forEach((i) => { i.style.width = i.dataset.w + '%'; })); } });

let activeShown = false;
selectMode('oracle', false);
renderHistory();
// First unlock in this browser: open Settings at Onboarding so a new agent (or person) reads it first.
function openOnboarding() {
  store.set(ONBOARD_STORE, '1');
  lastLobe = 'settings';
  selectMode('settings', true, true);
  openPanel('left', true);
  setTimeout(() => jumpTo('set-onboarding'), reduceMotion ? 0 : OPEN_MS + 100);
}
(async () => {
  if (!store.get(KEY_STORE)) await askKey(false);
  const ok = await loadHistory();
  if (ok && !store.get(ONBOARD_STORE)) openOnboarding();
  poll();
})();
// Test hook: window.__sdiSelect('judge') lights that lobe as if it were tapped.
window.__sdiTap = (m) => tapLobe(m);
window.__sdiShow = (d) => showAnswer(d);
window.__sdiSelect = (m) => { if (MODES[m]) selectMode(m, true); };
window.__sdiState = () => ({ mode, yaw, ready: !!brain });
window.__sdiProbe = (x, y) => hitBrain(x, y);
window.__sdiPose = (y, p) => { facing = { yaw: y, pitch: p }; faceUntil = Infinity; };
window.__sdiFaces = () => lobeFace;
window.__sdiOpen = (side, sweep) => openPanel(side, sweep);

/* ---------- Loop ---------- */
const clock = new THREE.Clock();
const angleTo = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
let hoverRegion = 0;
const amt = [0, 0, 0, 0], hovAmt = [0, 0, 0, 0];
const aside = { k: 1, x: 0 };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
  uniforms.uTime.value += reduceMotion ? 0 : dt;
  const dragging = down && down.moved;
  if (facing && now > faceUntil) facing = null;
  if (!dragging) {
    if (facing) {
      const d = angleTo(yaw, facing.yaw);
      yaw += d * Math.min(1, dt * 3.2); yawVel = 0;
      const dp = facing.pitch - BASE_PITCH - pitchDrag;
      pitchDrag += dp * Math.min(1, dt * 3.2);
      // The turn to face plays once. When it arrives (and nothing is thinking), it ends.
      if (!thinking && Math.abs(d) < 0.01 && Math.abs(dp) < 0.01) facing = null;
    } else {
      yawVel += (BASE_SPEED - yawVel) * Math.min(1, dt * 1.6);
      yaw += yawVel * dt;
      pitchDrag += (0 - pitchDrag) * Math.min(1, dt * 0.5);
    }
  }
  lean.x += (leanTarget.x - lean.x) * Math.min(1, dt * 3);
  lean.y += (leanTarget.y - lean.y) * Math.min(1, dt * 3);
  spin.rotation.y = yaw + lean.y;
  tilt.rotation.x = BASE_PITCH + pitchDrag + lean.x;
  zoom += (zoomTarget - zoom) * Math.min(1, dt * 8);
  // Narrow desktop: one panel at a time, and the brain glides aside (and shrinks if needed) so it is never covered.
  let fitK = 1, shiftX = 0;
  if (isMobile() && !isTouch()) {
    const side = panels.left.classList.contains('open') ? 1 : panels.right.classList.contains('open') ? -1 : 0;
    if (side) {
      const pw = panels.left.offsetWidth || panels.right.offsetWidth, free = W - pw;
      fitK = Math.min(1, (free * 0.86) / (brainLen * restScale * zoom * 1.05));
      shiftX = side * pw / 2;
    }
  }
  aside.k += (fitK - aside.k) * Math.min(1, dt * 4.5); aside.x += (shiftX - aside.x) * Math.min(1, dt * 4.5);
  const s = restScale * zoom * aside.k; tilt.scale.setScalar(s); tilt.position.y = brainLen * s * lift; tilt.position.x = aside.x;
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
mobileQuery.addEventListener('change', () => { syncCue(); resize(); fitBrain(true); selectMode(mode, false); });
