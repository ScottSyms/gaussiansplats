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

// --- Walkthrough (PointerLock) --- improved
const pointerControls = new PointerLockControls(camera, canvas);
let isWalkMode = false;
let walkCenter = new THREE.Vector3(0, 0, 0); // updated on load
let walkSize = 11.7; // bbox diagonal, updated on load
const keys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false, space: false, ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
let walkSpeedBase = 3.0;
let walkSpeedSprint = 6.0;
const clock = new THREE.Clock();
const walkVelocity = new THREE.Vector3(0, 0, 0);
const walkConfig = { damping: 12.0, mouseSensitivity: 1.0, invertY: false, flyMode: true, turnSpeed: 1.1 }; // ~63°/sec
let walkYaw = 0, walkPitch = 0; // radians, for arrow/mouse unified

function updateWalkSpeedFromSize(size) {
  walkSize = size;
  // Scale speeds to scene extent: filtered ~11 => 2.5/5, raw huge 308 but we clamp to 8 dist => use 8
  const base = Math.max(1.5, Math.min(8, size * 0.22));
  walkSpeedBase = base;
  walkSpeedSprint = base * 2.2;
}

function setWalkMode(enabled) {
  isWalkMode = enabled;
  const btn = document.getElementById('walkBtn');
  const hint = document.getElementById('walkHint');
  if (enabled) {
    controls.enabled = false;
    walkVelocity.set(0, 0, 0);
    // Init yaw/pitch from current camera for arrow/mouse
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    walkYaw = e.y;
    walkPitch = e.x;
    console.log('[walk] enter walkYaw', (walkYaw*180/Math.PI).toFixed(1), 'walkPitch', (walkPitch*180/Math.PI).toFixed(1));
    walkMouseIgnore = 3;
    // Use canvas for lock (more reliable than body)
    pointerControls.lock();
    if (btn) btn.textContent = 'Exit walk (Esc)';
    if (hint) hint.style.display = 'block';
    document.body.style.cursor = 'none';
  } else {
    pointerControls.unlock();
    controls.enabled = true;
    if (btn) btn.textContent = 'Enter walkthrough';
    if (hint) hint.style.display = 'none';
    document.body.style.cursor = '';
    walkVelocity.set(0, 0, 0);
  }
}
// Sync walkYaw/walkPitch from mouse when locked
let walkMouseIgnore = 3;
document.addEventListener('mousemove', (e) => {
  if (!isWalkMode || !pointerControls.isLocked) return;
  if (walkMouseIgnore > 0) { walkMouseIgnore--; return; }
  if (Math.abs(e.movementX) > 50 || Math.abs(e.movementY) > 50) return;
  const sens = 0.002 * walkConfig.mouseSensitivity;
  walkYaw -= e.movementX * sens;
  walkPitch -= e.movementY * sens * (walkConfig.invertY ? -1 : 1);
  walkPitch = THREE.MathUtils.clamp(walkPitch, -Math.PI/2 + 0.1, Math.PI/2 - 0.1);
  const euler = new THREE.Euler(walkPitch, walkYaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(euler);
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  controls.target.copy(camera.position).add(dir.multiplyScalar(2));
});
pointerControls.addEventListener('lock', () => {
  // Ensure controls are in correct state when locked
  if (isWalkMode) {
    const hint = document.getElementById('walkHint');
    if (hint) hint.innerHTML = '<div style="font-weight:600; color:#8ab4ff">Walkthrough — arrows or mouse to look</div><div><kbd>←/→</kbd> turn · <kbd>↑/↓</kbd> look · <kbd>W/S</kbd> forward/back · <kbd>A/D</kbd> strafe · <kbd>Q/E</kbd> up/down · <kbd>Shift</kbd> sprint · <kbd>Esc</kbd> exit</div>';
  }
});
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
    walkVelocity.set(0, 0, 0);
    // Re-target orbit to current position look-at
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    controls.target.copy(camera.position).add(dir.multiplyScalar(2));
    controls.update();
    updateCoordHUD(); // immediate
  }
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  // Arrow keys for turning / looking (intuitive, no mouse required)
  if (e.key === 'ArrowLeft') { keys.ArrowLeft = true; console.log('[keys] ArrowLeft down', isWalkMode); if (isWalkMode) e.preventDefault(); }
  if (e.key === 'ArrowRight') { keys.ArrowRight = true; console.log('[keys] ArrowRight down', isWalkMode, keys.ArrowRight); if (isWalkMode) e.preventDefault(); }
  if (e.key === 'ArrowUp') { keys.ArrowUp = true; console.log('[keys] ArrowUp down'); if (isWalkMode) e.preventDefault(); }
  if (e.key === 'ArrowDown') { keys.ArrowDown = true; if (isWalkMode) e.preventDefault(); }
  // Prevent browser shortcuts when walk mode (e.g., space scroll)
  if (isWalkMode && ['w','a','s','d','q','e',' '].includes(k)) e.preventDefault();
  if (k === 'w') keys.w = true;
  if (k === 'a') keys.a = true;
  if (k === 's') keys.s = true;
  if (k === 'd') keys.d = true;
  if (k === 'q') keys.q = true;
  if (k === 'e') keys.e = true;
  if (k === ' ') keys.space = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift') keys.shift = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'ArrowLeft') keys.ArrowLeft = false;
  if (e.key === 'ArrowRight') keys.ArrowRight = false;
  if (e.key === 'ArrowUp') keys.ArrowUp = false;
  if (e.key === 'ArrowDown') keys.ArrowDown = false;
  if (k === 'w') keys.w = false;
  if (k === 'a') keys.a = false;
  if (k === 's') keys.s = false;
  if (k === 'd') keys.d = false;
  if (k === 'q') keys.q = false;
  if (k === 'e') keys.e = false;
  if (k === ' ') keys.space = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift') keys.shift = false;
});
// Click on canvas in walk mode re-locks (also allow clicking overlay hint)
canvas.addEventListener('click', () => {
  if (isWalkMode && !pointerControls.isLocked) pointerControls.lock();
});
const walkHintEl = document.getElementById('walkHint');
if (walkHintEl) walkHintEl.addEventListener('click', () => {
  if (isWalkMode && !pointerControls.isLocked) pointerControls.lock();
});

const params = new URLSearchParams(location.search);
const rawUrl = params.get('url') || document.getElementById('fileSelect')?.value || './1713.spz';
const loadUrl = new URL(rawUrl, window.location.href).href;

// --- Pose helpers (URL + UI) ---
function parseVec3(str) {
  if (!str) return null;
  const parts = str.split(',').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new THREE.Vector3(parts[0], parts[1], parts[2]);
}
function parseQuat(str) {
  if (!str) return null;
  const p = str.split(',').map(Number);
  if (p.length !== 4 || p.some(isNaN)) return null;
  return new THREE.Quaternion(p[0], p[1], p[2], p[3]);
}
function parseEulerDeg(str) {
  if (!str) return null;
  const p = str.split(',').map(Number);
  if (p.length < 2 || p.some(isNaN)) return null;
  // yaw (Y), pitch (X), roll (Z) degrees
  return { yaw: p[0]||0, pitch: p[1]||0, roll: p[2]||0 };
}
function getInitialPose() {
  console.log('[getInitialPose] params', window.location.search, 'pos raw', params.get('pos'), 'yaw raw', params.get('yaw'));
  // Supports: pos, camPos, camYaw/pitch/roll, quat, camQuat, splatPos, splatQuat etc.
  const pos = parseVec3(params.get('pos') || params.get('camPos') || params.get('cameraPos'));
  console.log('[getInitialPose] parsed pos', pos?.toArray());
  const quat = parseQuat(params.get('quat') || params.get('camQuat'));
  const euler = parseEulerDeg(params.get('rot') || params.get('camRot') || params.get('yaw') && `${params.get('yaw')},${params.get('pitch')||0},${params.get('roll')||0}`);
  // Also support separate x,y,z,yaw,pitch,roll params
  const px = params.get('x')||params.get('posX'), py=params.get('y')||params.get('posY'), pz=params.get('z')||params.get('posZ');
  let pos2 = pos;
  if (!pos2 && px!==null && py!==null && pz!==null) {
    const v = [Number(px), Number(py), Number(pz)];
    if (!v.some(isNaN)) pos2 = new THREE.Vector3(v[0],v[1],v[2]);
  }
  const yaw = params.get('yaw')!==null ? Number(params.get('yaw')) : (euler?euler.yaw:null);
  const pitch = params.get('pitch')!==null ? Number(params.get('pitch')) : (euler?euler.pitch:null);
  const roll = params.get('roll')!==null ? Number(params.get('roll')) : (euler?euler.roll:null);
  let yawPitchRoll = null;
  if (yaw!==null && !isNaN(yaw)) yawPitchRoll = { yaw, pitch: pitch||0, roll: roll||0 };
  else if (euler) yawPitchRoll = euler;
  // Splat pose
  const splatPos = parseVec3(params.get('splatPos') || params.get('splat_pos'));
  const splatQuat = parseQuat(params.get('splatQuat') || params.get('splat_quat'));
  const splatEuler = parseEulerDeg(params.get('splatRot') || params.get('splat_rot'));
  const splatScaleStr = params.get('splatScale') || params.get('splat_scale');
  let splatScale = null;
  if (splatScaleStr) {
    const p = splatScaleStr.split(',').map(Number);
    if (p.length===1 && !isNaN(p[0])) splatScale = new THREE.Vector3(p[0],p[0],p[0]);
    else if (p.length===3 && !p.some(isNaN)) splatScale = new THREE.Vector3(p[0],p[1],p[2]);
  }
  return { pos: pos2, quat, yawPitchRoll, splatPos, splatQuat, splatEuler, splatScale };
}
let pendingInitialPose = getInitialPose();

function applySplatPose() {
  if (!splatMesh) return;
  const { splatPos, splatQuat, splatEuler, splatScale } = pendingInitialPose;
  // Also check UI inputs if no URL pose
  let pos = splatPos;
  let quat = splatQuat;
  let eul = splatEuler;
  let scale = splatScale;
  // UI overrides if fields filled
  const sx = document.getElementById('splatX'), sy=document.getElementById('splatY'), sz=document.getElementById('splatZ');
  const sqx=document.getElementById('splatQx'), sqy=document.getElementById('splatQy'), sqz=document.getElementById('splatQz'), sqw=document.getElementById('splatQw');
  const ssx=document.getElementById('splatSx'), ssy=document.getElementById('splatSy'), ssz=document.getElementById('splatSz');
  if (sx && sy && sz && sx.value && sy.value && sz.value) {
    const v=[Number(sx.value), Number(sy.value), Number(sz.value)];
    if (!v.some(isNaN)) pos = new THREE.Vector3(v[0],v[1],v[2]);
  }
  if (sqx && sqy && sqz && sqw && sqx.value) {
    const q=[Number(sqx.value), Number(sqy.value), Number(sqz.value), Number(sqw.value)];
    if (!q.some(isNaN)) quat = new THREE.Quaternion(q[0],q[1],q[2],q[3]);
  }
  if (!quat && eul) {
    const e = new THREE.Euler(THREE.MathUtils.degToRad(eul.pitch||0), THREE.MathUtils.degToRad(eul.yaw||0), THREE.MathUtils.degToRad(eul.roll||0), 'YXZ');
    quat = new THREE.Quaternion().setFromEuler(e);
  }
  if (ssx && ssy && ssz && ssx.value) {
    const s=[Number(ssx.value), Number(ssy.value), Number(ssz.value)];
    if (!s.some(isNaN)) scale = new THREE.Vector3(s[0],s[1],s[2]);
  }
  if (pos) splatMesh.position.copy(pos);
  if (quat) splatMesh.quaternion.copy(quat);
  if (scale) splatMesh.scale.copy(scale);
  splatMesh.updateMatrixWorld(true);
}
function applyCameraPoseFromParams() {
  console.log('[applyCameraPose] pending', pendingInitialPose.pos?.toArray(), pendingInitialPose.yawPitchRoll, 'quat', pendingInitialPose.quat?.toArray());
  const { pos, quat, yawPitchRoll } = pendingInitialPose;
  // Also check UI camera inputs - only if URL didn't provide pos, and UI has explicit values
  const cx=document.getElementById('camX'), cy=document.getElementById('camY'), cz=document.getElementById('camZ');
  const cyaw=document.getElementById('camYaw'), cpitch=document.getElementById('camPitch'), croll=document.getElementById('camRoll');
  console.log('[applyCameraPose] UI cam inputs', cx?.value, cy?.value, cz?.value, 'yaw', cyaw?.value);
  let p = pos;
  if (cx && cy && cz && cx.value!=='' && cy.value!=='' && cz.value!=='') {
    const v=[Number(cx.value), Number(cy.value), Number(cz.value)];
    if (!v.some(isNaN)) p = new THREE.Vector3(v[0],v[1],v[2]);
  }
  let q = quat;
  // Only use UI yaw/pitch if URL didn't provide quat and UI has explicit values
  let yawVal = null, pitchVal = null, rollVal = null;
  if (!q) {
    // Prefer URL yaw/pitch/roll
    if (yawPitchRoll) {
      yawVal = yawPitchRoll.yaw;
      pitchVal = yawPitchRoll.pitch;
      rollVal = yawPitchRoll.roll;
    }
    // Only fall back to UI if URL didn't provide
    if (yawVal===null && cyaw && cyaw.value!=='' ) yawVal = Number(cyaw.value);
    if (pitchVal===null && cpitch && cpitch.value!=='' ) pitchVal = Number(cpitch.value);
    if (rollVal===null && croll && croll.value!=='' ) rollVal = Number(croll.value);
  }
  console.log('[applyCameraPose] yaw/pitch/roll vals', yawVal, pitchVal, rollVal, 'q before', q?.toArray());
  if (!q && yawVal!==null && !isNaN(yawVal)) {
    const e = new THREE.Euler(THREE.MathUtils.degToRad(pitchVal||0), THREE.MathUtils.degToRad(yawVal), THREE.MathUtils.degToRad(rollVal||0), 'YXZ');
    q = new THREE.Quaternion().setFromEuler(e);
    console.log('[applyCameraPose] quat from yaw/pitch', q.toArray());
  }
  // Only use UI pos if URL didn't provide pos
  if (!p && cx && cy && cz && cx.value!=='' && cy.value!=='' && cz.value!=='') {
    const v=[Number(cx.value), Number(cy.value), Number(cz.value)];
    if (!v.some(isNaN)) p = new THREE.Vector3(v[0],v[1],v[2]);
  }
  console.log('[applyCameraPose] final p', p?.toArray(), 'q', q?.toArray());
  if (p) {
    camera.position.copy(p);
    // If we have rotation, apply it; otherwise look at walkCenter
    if (q) {
      camera.quaternion.copy(q);
      // Sync controls target to look direction
      const dir = new THREE.Vector3(0,0,-1).applyQuaternion(q);
      controls.target.copy(p).add(dir.multiplyScalar(2));
    } else {
      camera.lookAt(walkCenter);
    }
    controls.update();
    console.log('[applyCameraPose] applied p, cam now', camera.position.toArray(), 'target', controls.target.toArray());
    return true;
  } else if (q) {
    camera.quaternion.copy(q);
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(q);
    controls.target.copy(camera.position).add(dir.multiplyScalar(2));
    controls.update();
    console.log('[applyCameraPose] applied q only, cam', camera.position.toArray());
    return true;
  }
  console.log('[applyCameraPose] nothing to apply, return false');
  return false;
}
function buildPoseURL() {
  const p = camera.position;
  const q = camera.quaternion;
  // Derive yaw/pitch from quaternion for URL friendliness
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  const yaw = THREE.MathUtils.radToDeg(e.y).toFixed(2);
  const pitch = THREE.MathUtils.radToDeg(e.x).toFixed(2);
  const roll = THREE.MathUtils.radToDeg(e.z).toFixed(2);
  const u = new URL(window.location.href);
  u.searchParams.set('pos', `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`);
  u.searchParams.set('yaw', yaw);
  u.searchParams.set('pitch', pitch);
  if (Math.abs(Number(roll))>0.1) u.searchParams.set('roll', roll);
  else u.searchParams.delete('roll');
  // Splat pose if non-default
  if (splatMesh) {
    const sp = splatMesh.position;
    if (sp.length() > 0.001) u.searchParams.set('splatPos', `${sp.x.toFixed(3)},${sp.y.toFixed(3)},${sp.z.toFixed(3)}`);
    const sq = splatMesh.quaternion;
    if (Math.abs(sq.x)>0.001 || Math.abs(sq.y)>0.001 || Math.abs(sq.z)>0.001 || Math.abs(sq.w-1)>0.001) {
      u.searchParams.set('splatQuat', `${sq.x.toFixed(4)},${sq.y.toFixed(4)},${sq.z.toFixed(4)},${sq.w.toFixed(4)}`);
    }
    const sc = splatMesh.scale;
    if (Math.abs(sc.x-1)>0.001 || Math.abs(sc.y-1)>0.001 || Math.abs(sc.z-1)>0.001) {
      u.searchParams.set('splatScale', `${sc.x.toFixed(3)},${sc.y.toFixed(3)},${sc.z.toFixed(3)}`);
    }
  }
  return u.toString();
}

// --- Live coordinate HUD ---
function formatVec3(v) { return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`; }
function formatQuat(q) { return `${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)}, ${q.w.toFixed(3)}`; }
let lastHudUpdate = 0;
function updateCoordHUD() {
  const now = performance.now();
  if (now - lastHudUpdate < 100) return; // 10Hz throttle
  lastHudUpdate = now;
  const camPosEl = document.getElementById('camPos');
  const camRotEl = document.getElementById('camRot');
  const camQuatEl = document.getElementById('camQuat');
  const splatPosEl = document.getElementById('splatPosHud');
  const splatRotEl = document.getElementById('splatRotHud');
  if (camPosEl) camPosEl.textContent = formatVec3(camera.position);
  if (camRotEl || camQuatEl) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const yaw = THREE.MathUtils.radToDeg(e.y).toFixed(1);
    const pitch = THREE.MathUtils.radToDeg(e.x).toFixed(1);
    const roll = THREE.MathUtils.radToDeg(e.z).toFixed(1);
    if (camRotEl) camRotEl.textContent = `yaw ${yaw}° pitch ${pitch}° roll ${roll}°`;
    if (camQuatEl) camQuatEl.textContent = `q ${formatQuat(camera.quaternion)}`;
  }
  if (splatPosEl && splatMesh) splatPosEl.textContent = formatVec3(splatMesh.position);
  if (splatRotEl && splatMesh) splatRotEl.textContent = `q ${formatQuat(splatMesh.quaternion)}`;
}

let splatMesh = null;
let t0 = 0;
let currentSH = 3;
let poseApplied = false;

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

// --- Pose panel wiring ---
const poseToggle = document.getElementById('poseToggle');
const poseBody = document.getElementById('poseBody');
if (poseToggle && poseBody) {
  poseToggle.addEventListener('click', () => {
    const hidden = poseBody.style.display === 'none';
    poseBody.style.display = hidden ? 'block' : 'none';
    poseToggle.textContent = hidden ? '− hide' : '+ show';
  });
}
const applyCamBtn = document.getElementById('applyCamPose');
if (applyCamBtn) applyCamBtn.addEventListener('click', () => {
  // Build a temporary pending pose from UI then apply
  const cx=Number(document.getElementById('camX').value), cy=Number(document.getElementById('camY').value), cz=Number(document.getElementById('camZ').value);
  const yaw=Number(document.getElementById('camYaw').value), pitch=Number(document.getElementById('camPitch').value), roll=Number(document.getElementById('camRoll').value);
  if (![cx,cy,cz].some(isNaN)) {
    camera.position.set(cx,cy,cz);
    const e = new THREE.Euler(THREE.MathUtils.degToRad(pitch||0), THREE.MathUtils.degToRad(yaw||0), THREE.MathUtils.degToRad(roll||0), 'YXZ');
    camera.quaternion.setFromEuler(e);
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).add(dir.multiplyScalar(2));
    controls.update();
    // Persist to URL
    history.replaceState(null, '', buildPoseURL());
    updateCoordHUD();
  }
});
const setFromCurrentBtn = document.getElementById('setFromCurrentCam');
if (setFromCurrentBtn) setFromCurrentBtn.addEventListener('click', () => {
  const p = camera.position;
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  document.getElementById('camX').value = p.x.toFixed(2);
  document.getElementById('camY').value = p.y.toFixed(2);
  document.getElementById('camZ').value = p.z.toFixed(2);
  document.getElementById('camYaw').value = THREE.MathUtils.radToDeg(e.y).toFixed(1);
  document.getElementById('camPitch').value = THREE.MathUtils.radToDeg(e.x).toFixed(1);
  document.getElementById('camRoll').value = THREE.MathUtils.radToDeg(e.z).toFixed(1);
});
const applySplatBtn = document.getElementById('applySplatPose');
if (applySplatBtn) applySplatBtn.addEventListener('click', () => {
  applySplatPose();
  history.replaceState(null, '', buildPoseURL());
  updateCoordHUD();
});
const resetSplatBtn = document.getElementById('resetSplatPose');
if (resetSplatBtn) resetSplatBtn.addEventListener('click', () => {
  if (!splatMesh) return;
  splatMesh.position.set(0,0,0);
  splatMesh.quaternion.identity();
  splatMesh.scale.set(1,1,1);
  splatMesh.updateMatrixWorld(true);
  ['splatX','splatY','splatZ','splatQx','splatQy','splatQz','splatQw','splatSx','splatSy','splatSz'].forEach(id=>{
    const el=document.getElementById(id);
    if (el) el.value='';
  });
  history.replaceState(null, '', buildPoseURL());
  updateCoordHUD();
});
const copyPoseLinkBtn = document.getElementById('copyPoseLink');
if (copyPoseLinkBtn) copyPoseLinkBtn.addEventListener('click', async () => {
  const url = buildPoseURL();
  try { await navigator.clipboard.writeText(url); copyPoseLinkBtn.textContent='Copied!'; setTimeout(()=>copyPoseLinkBtn.textContent='Copy share link',1500); } catch { prompt('Copy link:', url); }
  history.replaceState(null, '', url);
});
const updateUrlBtn = document.getElementById('updateUrlPose');
if (updateUrlBtn) updateUrlBtn.addEventListener('click', () => {
  history.replaceState(null, '', buildPoseURL());
  updateUrlBtn.textContent='Updated!'; setTimeout(()=>updateUrlBtn.textContent='Update URL',1500);
});
const copyPoseBtn = document.getElementById('copyPose');
if (copyPoseBtn) copyPoseBtn.addEventListener('click', async () => {
  const url = buildPoseURL();
  try { await navigator.clipboard.writeText(url); copyPoseBtn.textContent='Copied!'; setTimeout(()=>copyPoseBtn.textContent='Copy link',1500);} catch { prompt('Copy link:', url); }
});
const copyCoordsBtn = document.getElementById('copyCoords');
if (copyCoordsBtn) copyCoordsBtn.addEventListener('click', async () => {
  const p=camera.position, e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');
  const txt=`pos ${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)} yaw ${THREE.MathUtils.radToDeg(e.y).toFixed(2)} pitch ${THREE.MathUtils.radToDeg(e.x).toFixed(2)} roll ${THREE.MathUtils.radToDeg(e.z).toFixed(2)} quat ${formatQuat(camera.quaternion)}`;
  try { await navigator.clipboard.writeText(txt); copyCoordsBtn.textContent='Copied!'; setTimeout(()=>copyCoordsBtn.textContent='Copy coords',1500);} catch { prompt('Coords:', txt); }
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
  console.log('[loadSplat] fetch', absoluteUrl, 'pendingInitialPose', pendingInitialPose);
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
        updateWalkSpeedFromSize(size);
        const walkStart = target.clone().add(new THREE.Vector3(0, 0.3, 1.2));
        window._walkStart = walkStart.clone();
        window._walkCenter = target.clone();
        // Apply splat pose first (so bbox already accounted, but allow user offset)
        applySplatPose();
        // --- Starting view: INSIDE centre (as requested) ---
        // Default orbit now starts inside at eye height looking forward
        let poseOverridden = applyCameraPoseFromParams();
        if (!poseOverridden) {
          controls.target.copy(target.clone().add(new THREE.Vector3(0, 1.5, 0)));
          camera.position.copy(walkStart);
        }
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

const walkTargetVelocity = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  if (isWalkMode) {
    // Arrow keys turn (intuitive, no mouse required) - update yaw/pitch
    const turn = walkConfig.turnSpeed * delta;
    let turned = false;
    const beforeYaw = walkYaw, beforePitch = walkPitch;
    if (keys.ArrowLeft) { walkYaw += turn; turned = true; }
    if (keys.ArrowRight) { walkYaw -= turn; turned = true; }
    if (keys.ArrowUp) { walkPitch += turn; turned = true; }
    if (keys.ArrowDown) { walkPitch -= turn; turned = true; }
    if (turned) {
      walkPitch = THREE.MathUtils.clamp(walkPitch, -Math.PI/2 + 0.1, Math.PI/2 - 0.1);
      const e = new THREE.Euler(walkPitch, walkYaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(e);
      const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
      controls.target.copy(camera.position).add(dir.multiplyScalar(2));
      if (Math.random() < 0.1) console.log('[walk] turn walkYaw', (walkYaw*180/Math.PI).toFixed(1), 'walkPitch', (walkPitch*180/Math.PI).toFixed(1), 'delta', delta.toFixed(3), 'turn', turn.toFixed(3));
    }
    if (turned && Math.abs(walkPitch - beforePitch) > 0.01 && !keys.ArrowUp && !keys.ArrowDown) {
      console.log('[walk] pitch changed without ArrowUp/Down!', beforePitch.toFixed(3), '->', walkPitch.toFixed(3), 'keys', JSON.stringify(keys));
    }
    // Allow movement even if not locked (for headless test), but mouse look requires lock
    const moveSpeed = keys.shift ? walkSpeedSprint : walkSpeedBase;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3(0, 0, 1);
    walkTargetVelocity.set(0,0,0);
    if (keys.w) walkTargetVelocity.addScaledVector(forward, moveSpeed);
    if (keys.s) walkTargetVelocity.addScaledVector(forward, -moveSpeed);
    if (keys.a) walkTargetVelocity.addScaledVector(right, -moveSpeed);
    if (keys.d) walkTargetVelocity.addScaledVector(right, moveSpeed);
    if (keys.q) walkTargetVelocity.addScaledVector(up, -moveSpeed);
    if (keys.e) walkTargetVelocity.addScaledVector(up, moveSpeed);
    if (keys.space) walkTargetVelocity.addScaledVector(up, moveSpeed);
    // Smooth damping
    walkVelocity.lerp(walkTargetVelocity, Math.min(1, walkConfig.damping * delta));
    if (walkTargetVelocity.lengthSq() > 0 || walkVelocity.lengthSq() > 0.001) {
      camera.position.addScaledVector(walkVelocity, delta);
      // Update orbit target to keep controls in sync when exiting walk
      // Don't update controls.target while in walk, just keep camera
    }
    updateCoordHUD();
  }
  if (!isWalkMode) {
    // Damp velocity when not walking
    walkVelocity.lerp(new THREE.Vector3(0,0,0), Math.min(1, walkConfig.damping * delta));
    controls.update();
  } else if (!pointerControls.isLocked) {
    // Still update controls damping when walk but not locked (so orbit doesn't jump)
    controls.update();
  }
  // Live HUD (throttled inside)
  updateCoordHUD();
  renderer.render(scene, camera);
});

loadSplat(loadUrl);
window.scene = scene; window.camera = camera; window.spark = spark; window.splatMesh = () => splatMesh;
