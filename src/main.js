import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

// Debug cube to verify Three rendering works
{
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true});
  const cube = new THREE.Mesh(geo, mat);
  cube.position.set(0,0,0);
  scene.add(cube);
  window._cube = cube;
}

const spark = new SparkRenderer({ renderer });
scene.add(spark);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.minDistance = 0.5;
controls.maxDistance = 100;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

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
  if (!splatMesh) return;
  try {
    const box = splatMesh.getBoundingBox?.(false) || splatMesh.getBoundingBox?.(true);
    if (box && !box.isEmpty()) {
      const center = new THREE.Vector3(); box.getCenter(center);
      const size = box.getSize(new THREE.Vector3()).length();
      // For huge bbox (outliers) use median-ish target 0,0,0 and smaller dist
      let dist = Math.max(4, size * 0.6);
      if (size > 100) {
        // Outlier-heavy scene: use median 0,0,0 and dist 8
        center.set(0,0,0);
        dist = 8;
      }
      controls.target.copy(center);
      camera.position.set(center.x, center.y - dist*0.4, center.z + dist);
      camera.near = Math.max(0.01, dist/50);
      camera.far = dist*20;
      camera.updateProjectionMatrix();
      controls.update();
    }
  } catch {}
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
        controls.target.copy(target);
        camera.position.set(target.x, target.y - dist*0.4, target.z + dist);
        camera.near = Math.max(0.01, dist/50);
        camera.far = dist*20;
        camera.updateProjectionMatrix();
        controls.update();
        console.log('[loadSplat] camera after', camera.position.x.toFixed(2), camera.position.y.toFixed(2), camera.position.z.toFixed(2), 'target', controls.target.x.toFixed(2), controls.target.y.toFixed(2), controls.target.z.toFixed(2), 'near', camera.near.toFixed(3), 'far', camera.far.toFixed(1));
        if (window._cube) window._cube.position.copy(target);
        if (hudFile) hudFile.textContent = `${absoluteUrl.split('/').pop()} — ${splatMesh.numSplats.toLocaleString()} splats, bbox ${size.toFixed(0)}`;
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
  controls.update();
  renderer.render(scene, camera);
});

loadSplat(loadUrl);
window.scene = scene; window.camera = camera; window.spark = spark; window.splatMesh = () => splatMesh;
