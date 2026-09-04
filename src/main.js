import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const bar = document.getElementById('bar');
const status = document.getElementById('status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 0, 8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// (debug cube removed for production)

const spark = new SparkRenderer({ renderer });
scene.add(spark);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.minDistance = 0.5;
controls.maxDistance = 100;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// --- Walkthrough (PointerLock) ---
const pointerControls = new PointerLockControls(camera, document.body);
let isWalkMode = false;
let walkCenter = new THREE.Vector3(0, 0, 0); // updated on load
const keys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false, space: false };
const walkSpeed = { base: 3.0, sprint: 6.0 }; // units/sec
const clock = new THREE.Clock();

function setWalkMode(enabled) {
  isWalkMode = enabled;
  const btn = document.getElementById('walkBtn');
  const hint = document.getElementById('walkHint');
  if (enabled) {
    controls.enabled = false;
    pointerControls.lock();
    if (btn) btn.textContent = 'Exit walk (Esc)';
    if (hint) hint.style.display = 'block';
    // Start inside centre at eye height
    camera.position.copy(walkCenter).add(new THREE.Vector3(0, 0, 1.6 * 0.5)); // slight offset for splat scale
    // Look slightly down the scene - face +Y (common forward for this capture)
    // Keep current rotation from pointer lock; ensure not inside floor
    document.body.style.cursor = 'none';
  } else {
    pointerControls.unlock();
    controls.enabled = true;
    if (btn) btn.textContent = 'Enter walkthrough';
    if (hint) hint.style.display = 'none';
    document.body.style.cursor = '';
  }
}
pointerControls.addEventListener('unlock', () => {
  if (isWalkMode) {
    // User pressed Esc - exit walk mode but keep camera where it is
    isWalkMode = false;
    controls.enabled = true;
    const btn = document.getElementById('walkBtn');
    if (btn) btn.textContent = 'Enter walkthrough';
    const hint = document.getElementById('walkHint');
    if (hint) hint.style.display = 'none';
    document.body.style.cursor = '';
    // Re-target orbit to current position look-at
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    controls.target.copy(camera.position).add(dir.multiplyScalar(2));
    controls.update();
  }
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['w','a','s','d','q','e',' '].includes(k) || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (k === 'w') keys.w = true;
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === 'q') keys.q = true;
    if (k === 'e') keys.e = true;
    if (k === ' ') keys.space = true;
    if (e.shiftKey) keys.shift = true;
  }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w') keys.w = false;
  if (k === 'a') keys.a = false;
  if (k === 's') keys.s = false;
  if (k === 'd') keys.d = false;
  if (k === 'q') keys.q = false;
  if (k === 'e') keys.e = false;
  if (k === ' ') keys.space = false;
  if (!e.shiftKey) keys.shift = false;
  if (e.key === 'Shift') keys.shift = false;
});
// Click on canvas in walk mode re-locks
canvas.addEventListener('click', () => {
  if (isWalkMode && !pointerControls.isLocked) pointerControls.lock();
});

const params = new URLSearchParams(location.search);
const rawUrl = params.get('url') || document.getElementById('fileSelect')?.value || './1713.spz';
const loadUrl = new URL(rawUrl, window.location.href).href;

let splatMesh = null;
let t0 = 0;
let currentSH = 3;

// UI bindings
const fileSelect = document.getElementById('fileSelect');
const hudFile = document.getElementById('hud-file');
const resetBtn = document.getElementById('resetView');
const centerBtn = document.getElementById('centerView');
const shBtn = document.getElementById('toggleSH');
if (fileSelect) {
  // Set initial from URL if provided
  if (params.get('url')) fileSelect.value = params.get('url');
  fileSelect.addEventListener('change', () => {
    const v = fileSelect.value;
    hudFile.textContent = fileSelect.options[fileSelect.selectedIndex].text;
    history.replaceState(null, '', `?url=${encodeURIComponent(v)}`);
    loadSplat(v);
  });
}
if (resetBtn) resetBtn.addEventListener('click', () => {
  if (isWalkMode) setWalkMode(false);
  if (!splatMesh) return;
  try {
    const box = splatMesh.getBoundingBox?.(false) || splatMesh.getBoundingBox?.(true);
    if (box && !box.isEmpty()) {
      const center = new THREE.Vector3(); box.getCenter(center);
      const size = box.getSize(new THREE.Vector3()).length();
      let dist = Math.max(4, size * 0.6);
      if (size > 100) center.set(0,0,0);
      if (size > 100) dist = 8;
      // Reset to outside orbit view (overview)
      controls.target.copy(center);
      camera.position.set(center.x, center.y - dist*0.4, center.z + dist);
      camera.near = Math.max(0.01, dist/50);
      camera.far = dist*20;
      camera.updateProjectionMatrix();
      controls.update();
      walkCenter.copy(center);
      window._walkStart = center.clone().add(new THREE.Vector3(0,0,1.2));
    } else {
      camera.position.copy(walkCenter).add(new THREE.Vector3(0,0,8));
      controls.target.copy(walkCenter);
      controls.update();
    }
  } catch {}
});
if (centerBtn) centerBtn.addEventListener('click', () => {
  if (isWalkMode) {
    camera.position.copy(walkCenter).add(new THREE.Vector3(0, 0.3, 1.2));
    camera.lookAt(walkCenter.clone().add(new THREE.Vector3(0, 2, 0)));
  } else {
    // Orbit: go to centre inside (eye level)
    const inside = walkCenter.clone().add(new THREE.Vector3(0, 0.3, 1.2));
    camera.position.copy(inside);
    controls.target.copy(walkCenter.clone().add(new THREE.Vector3(0, 2, 0)));
    controls.update();
  }
});
// Walk button
const walkBtn = document.getElementById('walkBtn');
if (walkBtn) walkBtn.addEventListener('click', () => {
  if (!splatMesh) return;
  if (isWalkMode) setWalkMode(false);
  else {
    // Jump to centre inside before locking
    camera.position.copy(walkCenter).add(new THREE.Vector3(0, 0.3, 1.2));
    camera.lookAt(walkCenter.clone().add(new THREE.Vector3(0, 2, 0)));
    setWalkMode(true);
  }
});
if (shBtn) shBtn.addEventListener('click', () => {
  currentSH = currentSH ? 0 : 3;
  shBtn.textContent = `SH: ${currentSH ? 'on' : 'off'}`;
  if (splatMesh) {
    try { splatMesh.setMaxSh?.(currentSH); splatMesh.updateGenerator?.(); } catch {}
  }
});

function setProgress(pct, text) {
  bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (text) status.textContent = text;
  if (pct < 100) bar.getBoundingClientRect();
}

async function loadSplat(url) {
  const absoluteUrl = new URL(url, window.location.href).href;
  t0 = performance.now();
  setProgress(5, `Fetching ${absoluteUrl} …`);
  console.log('[loadSplat] fetch', absoluteUrl);
  if (splatMesh) {
    try { scene.remove(splatMesh); splatMesh.dispose?.(); } catch {}
    splatMesh = null;
  }
  overlay.classList.remove('hidden');
  overlay.style.pointerEvents = 'auto';
  bar.style.background = '#fff';

  try {
    const res = await fetch(absoluteUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${absoluteUrl}`);
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    console.log('[loadSplat] content-length', len, 'status', res.status);

    // Spark works best with stream; we keep a progress poll instead of TransformStream
    // to avoid interfering with Spark's internal fetch handling.
    let received = 0;
    // For progress, we do a parallel fetch clone if possible, but simpler: poll
    const progIv = setInterval(() => {
      // Estimate progress via time if len unknown
      if (!len) {
        const elapsed = (performance.now() - t0)/1000;
        setProgress(5 + Math.min(65, elapsed*10), `Downloading… ${elapsed.toFixed(1)}s`);
      }
    }, 500);

    const dtFetchStart = performance.now();
    // Prefer stream (efficient), fallback to fileBytes if stream fails
    try {
      splatMesh = new SplatMesh({ stream: res.body, streamLength: len || undefined });
      scene.add(splatMesh);
      await splatMesh.initialized;
    } catch (streamErr) {
      console.warn('[loadSplat] stream failed, trying fileBytes fallback', streamErr);
      clearInterval(progIv);
      // Fallback: buffer entire file
      const res2 = await fetch(absoluteUrl);
      const buf = await res2.arrayBuffer();
      setProgress(75, `Decoding ${(buf.byteLength/1024/1024).toFixed(1)} MB…`);
      splatMesh = new SplatMesh({ fileBytes: new Uint8Array(buf) });
      // Remove previous (if any)
      try { scene.remove(splatMesh); } catch {}
      scene.add(splatMesh);
      await splatMesh.initialized;
    }
    clearInterval(progIv);
    const dt = ((performance.now() - t0)/1000).toFixed(1);
    const dtDecode = ((performance.now() - dtFetchStart)/1000).toFixed(1);
    console.log(`[loadSplat] initialized ${splatMesh.numSplats} splats in ${dt}s (decode ${dtDecode}s)`, splatMesh);
    if (!splatMesh.numSplats) throw new Error('Decoded 0 splats — file may be corrupt or unsupported');

    setProgress(98, `Finalizing — ${splatMesh.numSplats.toLocaleString()} splats`);
    try {
      const box = splatMesh.getBoundingBox?.(false) || splatMesh.getBoundingBox?.(true);
      if (box && !box.isEmpty()) {
        const center = new THREE.Vector3(); box.getCenter(center);
        const size = box.getSize(new THREE.Vector3()).length();
        console.log('[loadSplat] bbox center', center.x.toFixed(2), center.y.toFixed(2), center.z.toFixed(2), 'size', size.toFixed(2));
        console.log('[loadSplat] camera before', camera.position.x.toFixed(2), camera.position.y.toFixed(2), camera.position.z.toFixed(2), 'target', controls.target.x.toFixed(2), controls.target.y.toFixed(2), controls.target.z.toFixed(2));
        // For outlier-heavy scenes (size >100) use median-ish view
        let target = center.clone();
        let dist = Math.max(4, size * 0.6);
        if (size > 100) {
          target.set(0,0,0);
          dist = 8;
          console.log('[loadSplat] huge bbox detected, using median target 0,0,0 dist 8');
        }
        // Store true scene centre for walkthrough (inside view)
        walkCenter.copy(target);
        const walkStart = target.clone().add(new THREE.Vector3(0, 0.3, 1.2));
        window._walkStart = walkStart.clone();
        window._walkCenter = target.clone();
        // --- Starting view: INSIDE centre (as requested) ---
        // Default orbit now starts inside at eye height looking forward
        controls.target.copy(target.clone().add(new THREE.Vector3(0, 1.5, 0)));
        camera.position.copy(walkStart);
        // Keep outside overview available via Reset button
        window._orbitOutside = { target: target.clone(), dist };
        camera.near = Math.max(0.01, dist/50);
        camera.far = dist*20;
        camera.updateProjectionMatrix();
        controls.update();
        console.log('[loadSplat] camera after (inside centre)', camera.position.x.toFixed(2), camera.position.y.toFixed(2), camera.position.z.toFixed(2), 'target', controls.target.x.toFixed(2), controls.target.y.toFixed(2), controls.target.z.toFixed(2), 'near', camera.near.toFixed(3), 'far', camera.far.toFixed(1));
        console.log('[loadSplat] walk start (inside centre)', walkStart.x.toFixed(2), walkStart.y.toFixed(2), walkStart.z.toFixed(2), 'outside would be', target.x.toFixed(2), (target.y - dist*0.4).toFixed(2), (target.z+dist).toFixed(2));
        if (window._cube) window._cube.position.copy(target);
        if (hudFile) hudFile.textContent = `${absoluteUrl.split('/').pop()} — ${splatMesh.numSplats.toLocaleString()} splats, bbox ${size.toFixed(0)}`;
        // Update walk hint with centre
        const hint = document.getElementById('walkHint');
        if (hint) hint.textContent = `Walkthrough: click to lock mouse · WASD move · Q/E up/down · Shift sprint · Esc exit · Start at centre ${target.x.toFixed(1)},${target.y.toFixed(1)},${target.z.toFixed(1)}`;
      }
    } catch (e) { console.warn('bbox failed', e); }

    setProgress(100, `${splatMesh.numSplats.toLocaleString()} splats — ${dt}s`);
    setTimeout(() => { overlay.classList.add('hidden'); overlay.style.pointerEvents = 'none'; }, 700);
  } catch (e) {
    console.error('[loadSplat] failed', e);
    setProgress(100, `Failed: ${e.message} — check console`);
    bar.style.background = '#ff5555';
    status.innerHTML = `Failed: ${e.message}<br><span style="opacity:0.7;font-size:11px">Try <a href="${absoluteUrl}" target="_blank" style="color:#8ab4ff">direct link</a> or <code>?url=&lt;url&gt;</code>. Console has details.</span>`;
    overlay.classList.remove('hidden');
    overlay.style.pointerEvents = 'auto';
  }
}

canvas.addEventListener('dragover', e => { e.preventDefault(); overlay.classList.remove('hidden'); setProgress(30, 'Drop .ply / .spz / .splat to view'); });
canvas.addEventListener('dragleave', () => { if (splatMesh?.isInitialized) overlay.classList.add('hidden'); });
canvas.addEventListener('drop', async e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  t0 = performance.now();
  setProgress(30, `Reading ${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`);
  overlay.classList.remove('hidden');
  overlay.style.pointerEvents = 'auto';
  if (splatMesh) { try { scene.remove(splatMesh); splatMesh.dispose?.(); } catch {} }
  try {
    const buffer = await file.arrayBuffer();
    setProgress(70, `Decoding ${file.name}…`);
    splatMesh = new SplatMesh({ fileBytes: new Uint8Array(buffer) });
    scene.add(splatMesh);
    await splatMesh.initialized;
    const dt = ((performance.now()-t0)/1000).toFixed(1);
    if (!splatMesh.numSplats) throw new Error('Decoded 0 splats');
    setProgress(100, `${file.name} — ${splatMesh.numSplats.toLocaleString()} splats — ${dt}s`);
    setTimeout(()=> overlay.classList.add('hidden'), 700);
    overlay.style.pointerEvents = 'none';
    history.replaceState(null, '', `?url=${encodeURIComponent(file.name)} (local)`);
  } catch (err) {
    console.error('drop failed', err);
    setProgress(100, `Failed: ${err.message}`);
    bar.style.background = '#ff5555';
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  if (isWalkMode && pointerControls.isLocked) {
    const speed = (keys.shift ? walkSpeed.sprint : walkSpeed.base) * delta;
    // Move relative to camera orientation
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.z = 0; // keep walk mostly horizontal; remove if you want fly
    // Actually allow full 3D: don't zero z for splats (they are volumetric)
    // Recompute with full direction for fly-through
    camera.getWorldDirection(forward);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3(0, 0, 1); // world up
    if (keys.w) camera.position.addScaledVector(forward, speed);
    if (keys.s) camera.position.addScaledVector(forward, -speed);
    if (keys.a) camera.position.addScaledVector(right, -speed);
    if (keys.d) camera.position.addScaledVector(right, speed);
    if (keys.q || keys.e) {
      const vert = keys.e ? 1 : -1;
      if (keys.q || keys.e) camera.position.addScaledVector(up, vert * speed);
    }
    if (keys.space) camera.position.addScaledVector(up, speed);
    // Clamp to reasonable scene bounds to avoid flying infinitely
    // No clamp - free fly
  } else {
    controls.update();
  }
  renderer.render(scene, camera);
});

loadSplat(loadUrl);
window.scene = scene; window.camera = camera; window.spark = spark; window.splatMesh = () => splatMesh;
