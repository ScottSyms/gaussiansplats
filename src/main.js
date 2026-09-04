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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
const rawUrl = params.get('url') || './1713.spz';
const loadUrl = new URL(rawUrl, window.location.href).href;

let splatMesh = null;
let t0 = 0;

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

    // Use TransformStream for progress while piping to Spark
    let received = 0;
    const progressStream = res.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        received += chunk.length;
        if (len) {
          const pct = 5 + Math.round((received / len) * 65);
          setProgress(pct, `Downloading ${(received/1024/1024).toFixed(1)} / ${(len/1024/1024).toFixed(1)} MB`);
        } else {
          setProgress(5 + Math.min(65, received / (20.7*1024*1024) * 65), `Downloading ${(received/1024/1024).toFixed(1)} MB…`);
        }
        controller.enqueue(chunk);
      }
    }));

    const dtFetchStart = performance.now();
    splatMesh = new SplatMesh({ stream: progressStream, streamLength: len || undefined });
    scene.add(splatMesh);
    await splatMesh.initialized;
    const dt = ((performance.now() - t0)/1000).toFixed(1);
    const dtDecode = ((performance.now() - dtFetchStart)/1000).toFixed(1);
    console.log(`[loadSplat] stream initialized ${splatMesh.numSplats} splats in ${dt}s (decode ${dtDecode}s)`, splatMesh);
    if (!splatMesh.numSplats) throw new Error('Decoded 0 splats — file may be corrupt or unsupported');

    setProgress(98, `Finalizing — ${splatMesh.numSplats.toLocaleString()} splats`);
    try {
      const box = splatMesh.getBoundingBox?.(false) || splatMesh.getBoundingBox?.(true);
      if (box && !box.isEmpty()) {
        const center = new THREE.Vector3(); box.getCenter(center);
        const size = box.getSize(new THREE.Vector3()).length();
        console.log('[loadSplat] bbox center', center, 'size', size);
        controls.target.copy(center);
        const dist = Math.max(4, size * 0.9);
        camera.position.set(center.x, center.y - dist * 0.25, center.z + dist);
        camera.near = Math.max(0.01, size / 1000);
        camera.far = size * 10;
        camera.updateProjectionMatrix();
        controls.update();
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
