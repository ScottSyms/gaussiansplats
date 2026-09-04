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
camera.position.set(0, -2, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const spark = new SparkRenderer({ renderer });
scene.add(spark);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.2));

const params = new URLSearchParams(location.search);
const url = params.get('url') || './1713.spz';
const loadUrl = url;

let splatMesh = null;

async function loadSplat(loadUrl) {
  status.textContent = `Fetching ${loadUrl} ...`;
  bar.style.width = '10%';
  if (splatMesh) {
    scene.remove(splatMesh);
    splatMesh.dispose?.();
    splatMesh = null;
  }
  try {
    const res = await fetch(loadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${loadUrl}`);
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength) {
        const pct = Math.round((received / contentLength) * 90);
        bar.style.width = pct + '%';
        status.textContent = `Downloading ${(received/1024/1024).toFixed(1)} / ${(contentLength/1024/1024).toFixed(1)} MB`;
      } else {
        bar.style.width = Math.min(90, 10 + received / (18.1*1024*1024) * 80) + '%';
        status.textContent = `Downloading ${(received/1024/1024).toFixed(1)} MB ...`;
      }
    }
    const blob = new Blob(chunks);
    const buffer = await blob.arrayBuffer();
    bar.style.width = '95%';
    status.textContent = 'Decoding splats...';

    splatMesh = new SplatMesh({ fileBytes: new Uint8Array(buffer) });
    scene.add(splatMesh);
    await splatMesh.initialized;
    bar.style.width = '100%';
    status.textContent = `${(splatMesh.numSplats?.toLocaleString() || '832,888')} splats loaded`;

    const box = splatMesh.getBoundingBox?.(false);
    if (box) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = box.getSize(new THREE.Vector3()).length();
      controls.target.copy(center);
      camera.position.set(center.x, center.y - size * 0.3, center.z + size * 0.8);
      camera.near = Math.max(0.01, size / 1000);
      camera.far = size * 10;
      camera.updateProjectionMatrix();
    }
    setTimeout(() => overlay.classList.add('hidden'), 600);
    overlay.style.pointerEvents = 'none';
  } catch (e) {
    status.textContent = `Failed: ${e.message}`;
    bar.style.background = '#ff5555';
    console.error(e);
    overlay.classList.remove('hidden');
    overlay.style.pointerEvents = 'auto';
  }
}

canvas.addEventListener('dragover', e => { e.preventDefault(); overlay.classList.remove('hidden'); status.textContent = 'Drop .ply / .spz / .splat to view'; });
canvas.addEventListener('dragleave', () => { if (splatMesh) overlay.classList.add('hidden'); });
canvas.addEventListener('drop', async e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  status.textContent = `Reading ${file.name} ...`;
  bar.style.width = '30%';
  overlay.classList.remove('hidden');
  const buffer = await file.arrayBuffer();
  if (splatMesh) { scene.remove(splatMesh); splatMesh.dispose?.(); }
  splatMesh = new SplatMesh({ fileBytes: new Uint8Array(buffer) });
  scene.add(splatMesh);
  await splatMesh.initialized;
  bar.style.width = '100%';
  status.textContent = `${file.name} — ${(file.size/1024/1024).toFixed(1)} MB loaded`;
  setTimeout(() => overlay.classList.add('hidden'), 800);
  history.replaceState(null, '', `?url=${encodeURIComponent(file.name)} (local)`);
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
window.scene = scene; window.camera = camera; window.spark = spark;
