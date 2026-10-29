/**
 * 屍群壓力測試台（獨立於 main.ts，不動現有原型）。
 *
 * 目的：在同一份上海街區資料上，量測三種實作方式的實際成本——
 *   1. instanced  InstancedMesh × N     → 1 個 draw call，無骨骼
 *   2. mesh       獨立 Mesh × N         → N 個 draw call，無骨骼
 *   3. skinned    SkinnedMesh × N       → N 個 draw call，三骨蒙皮
 *
 * 用法：/stress.html?mode=skinned&n=150
 *       /stress.html?bench=1   自動跑完三種模式的爬坡，輸出表格
 */
import * as THREE from 'three';
import { UniformGrid } from './spatial';

type Point = [number, number];
type Building = { id: string; footprint: Point[]; holes: Point[][]; height_m: number };
type Block = { buildings: Building[]; spawn: Point };
type Wall = { a: Point; b: Point };
type Mode = 'instanced' | 'mesh' | 'skinned';

const MODES: Mode[] = ['instanced', 'mesh', 'skinned'];
const MODE_LABEL: Record<Mode, string> = {
  instanced: 'InstancedMesh × N（1 draw call）',
  mesh: '獨立 Mesh × N（無骨骼）',
  skinned: 'SkinnedMesh × N（三骨蒙皮）',
};

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const ui = {
  mode: document.querySelector<HTMLElement>('#mode')!,
  count: document.querySelector<HTMLElement>('#count')!,
  fps: document.querySelector<HTMLElement>('#fps')!,
  ms: document.querySelector<HTMLElement>('#ms')!,
  info: document.querySelector<HTMLElement>('#info')!,
  rows: document.querySelector<HTMLTableSectionElement>('#rows')!,
  status: document.querySelector<HTMLElement>('#status')!,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaebbb8);
scene.fog = new THREE.Fog(0xaebbb8, 90, 320);

const camera = new THREE.OrthographicCamera(-30, 30, 22, -22, 0.1, 700);
let viewSize = 44;

scene.add(new THREE.HemisphereLight(0xe3e8e2, 0x6f766b, 2.05));
const sun = new THREE.DirectionalLight(0xffe8c7, 2);
sun.position.set(-50, 100, 40);
scene.add(sun);

// ---------------------------------------------------------------- 世界幾何

function cityGeometry(block: Block): THREE.BufferGeometry {
  const verts: number[] = [];
  const v = (p: Point, y: number) => { verts.push(p[0], y, -p[1]); };
  const quad = (a: Point, b: Point, y0: number, y1: number) => {
    v(a, y0); v(b, y0); v(b, y1);
    v(a, y0); v(b, y1); v(a, y1);
  };
  for (const b of block.buildings) {
    const h = Number.isFinite(b.height_m) && b.height_m > 2 && b.height_m < 250 ? b.height_m : 12;
    const ring = b.footprint;
    for (let i = 0; i < ring.length; i++) quad(ring[i], ring[(i + 1) % ring.length], 0, h);
    for (const hole of b.holes) {
      for (let i = 0; i < hole.length; i++) quad(hole[i], hole[(i + 1) % hole.length], 0, h);
    }
    for (let i = 1; i < ring.length - 1; i++) { v(ring[0], h); v(ring[i], h); v(ring[i + 1], h); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

const wallGrid = new UniformGrid<Wall>(8);
function buildWalls(block: Block) {
  for (const b of block.buildings) {
    const ring = b.footprint;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      wallGrid.insert({
        minX: Math.min(a[0], c[0]) - 0.5, maxX: Math.max(a[0], c[0]) + 0.5,
        minY: Math.min(a[1], c[1]) - 0.5, maxY: Math.max(a[1], c[1]) + 0.5,
      }, { a, b: c });
    }
  }
}

const scratch: Wall[] = [];
function blockedAt(x: number, z: number): boolean {
  scratch.length = 0;
  wallGrid.query({ minX: x - 0.4, maxX: x + 0.4, minY: z - 0.4, maxY: z + 0.4 }, scratch);
  for (const w of scratch) {
    const ex = w.b[0] - w.a[0], ey = w.b[1] - w.a[1];
    const t = Math.max(0, Math.min(1, ((x - w.a[0]) * ex + (z - w.a[1]) * ey) / (ex * ex + ey * ey)));
    if (Math.hypot(x - w.a[0] - t * ex, z - w.a[1] - t * ey) < 0.4) return true;
  }
  return false;
}

// ---------------------------------------------------------------- 模型

const plainGeo = new THREE.BoxGeometry(0.5, 1.7, 0.3);
plainGeo.translate(0, 0.85, 0);

const skinGeo = (() => {
  const g = new THREE.BoxGeometry(0.5, 1.7, 0.3, 1, 6, 1);
  g.translate(0, 0.85, 0);
  const pos = g.getAttribute('position');
  const index = new Uint16Array(pos.count * 4);
  const weight = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let a = 0, b = 1, w = 0;
    if (y < 0.55) { a = 0; b = 1; w = 0; }
    else if (y < 0.9) { a = 0; b = 1; w = (y - 0.55) / 0.35; }
    else if (y < 1.25) { a = 1; b = 2; w = 0; }
    else if (y < 1.55) { a = 1; b = 2; w = (y - 1.25) / 0.3; }
    else { a = 2; b = 2; w = 0; }
    index[i * 4] = a; weight[i * 4] = 1 - w;
    index[i * 4 + 1] = b; weight[i * 4 + 1] = w;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
  return g;
})();

const zombieMat = new THREE.MeshStandardMaterial({ color: 0x6f7f63, roughness: 1 });

const player = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x435b56 }));
player.position.y = 0.85;
scene.add(player);

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.48, 0.61, 24),
  new THREE.MeshBasicMaterial({ color: 0xe7c878, side: THREE.DoubleSide }),
);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.04;
player.add(marker);

type Zombie = {
  obj: THREE.Object3D; x: number; z: number; phase: number;
  hips?: THREE.Bone; chest?: THREE.Bone; head?: THREE.Bone;
};

let block: Block;
let mode: Mode = 'instanced';
let count = 0;
let zombies: Zombie[] = [];
let instanced: THREE.InstancedMesh | null = null;
let px = 0, pz = 0;

const dummy = new THREE.Object3D();

function clearZombies() {
  for (const z of zombies) {
    scene.remove(z.obj);
    const sm = z.obj as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) sm.skeleton.dispose();
  }
  zombies = [];
  if (instanced) { scene.remove(instanced); instanced.dispose(); instanced = null; }
}

function spawnRing(n: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    let x = px, z = pz;
    for (let tries = 0; tries < 24; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 9 + Math.random() * 22;
      x = px + Math.cos(ang) * r;
      z = pz + Math.sin(ang) * r;
      if (!blockedAt(x, z)) break;
    }
    out.push({ x, z });
  }
  return out;
}

function buildZombies(n: number) {
  clearZombies();
  count = n;
  const spots = spawnRing(n);

  if (mode === 'instanced') {
    instanced = new THREE.InstancedMesh(plainGeo, zombieMat, n);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(instanced);
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 0, -s.z);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.updateMatrix();
      instanced!.setMatrixAt(i, dummy.matrix);
      zombies.push({ obj: dummy, x: s.x, z: s.z, phase: Math.random() * 6.28 });
    });
    instanced.instanceMatrix.needsUpdate = true;
    return;
  }

  for (const s of spots) {
    if (mode === 'mesh') {
      const m = new THREE.Mesh(plainGeo, zombieMat);
      m.position.set(s.x, 0, -s.z);
      scene.add(m);
      zombies.push({ obj: m, x: s.x, z: s.z, phase: Math.random() * 6.28 });
    } else {
      const mesh = new THREE.SkinnedMesh(skinGeo, zombieMat);
      const hips = new THREE.Bone();
      const chest = new THREE.Bone();
      const head = new THREE.Bone();
      chest.position.y = 0.85;
      head.position.y = 0.45;
      hips.add(chest);
      chest.add(head);
      mesh.add(hips);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton([hips, chest, head]));
      mesh.position.set(s.x, 0, -s.z);
      scene.add(mesh);
      zombies.push({ obj: mesh, x: s.x, z: s.z, phase: Math.random() * 6.28, hips, chest, head });
    }
  }
}

// ---------------------------------------------------------------- 量測

const frameTimes: number[] = [];
let uiTimer = 0;
let time = 0;
let last = performance.now();
let calls = 0, tris = 0;

function stats() {
  const s = [...frameTimes].sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  const p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? avg;
  return { avg, p95, fps: 1000 / Math.max(0.001, avg), samples: s.length };
}

function fmt(n: number, digits = 1) { return n.toFixed(digits); }

function refreshHud() {
  const st = stats();
  ui.mode.textContent = MODE_LABEL[mode];
  ui.count.textContent = `${count} 隻`;
  ui.fps.textContent = st.samples > 10 ? fmt(st.fps, 0) : '—';
  ui.ms.textContent = st.samples > 10 ? `平均 ${fmt(st.avg, 1)} ms · p95 ${fmt(st.p95, 1)} ms` : '暖機中…';
  ui.info.textContent = `draw calls ${calls} · triangles ${tris.toLocaleString()} · ${fmt(time, 0)} s`;
}

// ---------------------------------------------------------------- 輸入

const keys = new Set<string>();
addEventListener('keydown', e => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Digit1') setMode('instanced');
  if (e.code === 'Digit2') setMode('mesh');
  if (e.code === 'Digit3') setMode('skinned');
  if (e.code === 'Minus') buildZombies(Math.max(0, count - 25));
  if (e.code === 'Equal') buildZombies(count + 25);
  if (e.code === 'KeyR' && !ramping) void runRamp(mode);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function setMode(m: Mode) {
  mode = m;
  buildZombies(count);
  refreshHud();
}

// ---------------------------------------------------------------- 主循環

function frame(dt: number) {
  const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const fwd = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  if (right || fwd) {
    const len = Math.hypot(right + fwd, right - fwd);
    const speed = 3;
    const nx = px + ((right - fwd) / len) * speed * dt;
    const nz = pz + ((right + fwd) / len) * speed * dt;
    if (!blockedAt(nx, pz)) px = nx;
    if (!blockedAt(px, nz)) pz = nz;
  }
  player.position.set(px, 0.85, -pz);

  time += dt;

  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    const dx = px - z.x, dz = pz - z.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.9) {
      const step = Math.min(1.25 * dt, d - 0.8);
      let nx = z.x + (dx / d) * step;
      let nz = z.z + (dz / d) * step;
      if (blockedAt(nx, nz)) {
        if (!blockedAt(nx, z.z)) nz = z.z;
        else if (!blockedAt(z.x, nz)) nx = z.x;
        else { nx = z.x; nz = z.z; }
      }
      z.x = nx; z.z = nz;
    }

    const t = time * 6 + z.phase;
    if (mode === 'instanced' && instanced) {
      dummy.position.set(z.x, Math.abs(Math.sin(t)) * 0.04, -z.z);
      dummy.rotation.set(0, Math.atan2(dx, -dz), Math.sin(t) * 0.04);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    } else {
      z.obj.position.set(z.x, Math.abs(Math.sin(t)) * 0.04, -z.z);
      z.obj.rotation.y = Math.atan2(dx, -dz);
      if (z.chest) {
        z.chest.rotation.x = 0.08 + Math.sin(t) * 0.06;
        z.hips!.rotation.z = Math.sin(t) * 0.05;
        z.head!.rotation.x = -0.08 - Math.sin(t) * 0.04;
      }
    }
  }
  if (instanced) instanced.instanceMatrix.needsUpdate = true;

  const target = new THREE.Vector3(px, 1, -pz);
  camera.position.copy(target).add(new THREE.Vector3(40, 56, 40));
  camera.lookAt(target);
}

function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (dt > 0.2) return; // 分頁切換等異常幀不計入

  frame(dt);
  renderer.render(scene, camera);

  calls = renderer.info.render.calls;
  tris = renderer.info.render.triangles;
  frameTimes.push(dt * 1000);
  if (frameTimes.length > 180) frameTimes.shift();

  uiTimer += dt;
  if (uiTimer > 0.2) { uiTimer = 0; refreshHud(); }
}

// ---------------------------------------------------------------- 爬坡與報告

type Row = { mode: Mode; count: number; fps: number; avg: number; p95: number; calls: number; tris: number };
const results: Row[] = [];
let ramping = false;

function addRow(r: Row) {
  results.push(r);
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${r.mode}</td><td>${r.count}</td><td>${fmt(r.fps, 0)}</td><td>${fmt(r.avg, 1)}</td><td>${fmt(r.p95, 1)}</td><td>${r.calls}</td>`;
  ui.rows.appendChild(tr);
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function runRamp(m: Mode, start = 25, step = 25, cap = 400) {
  if (ramping) return;
  ramping = true;
  ui.status.textContent = '爬坡中…（每階 1.8 秒）';
  setMode(m);
  for (let n = start; n <= cap; n += step) {
    buildZombies(n);
    frameTimes.length = 0;
    await wait(1800);
    const st = stats();
    addRow({ mode: m, count: n, fps: st.fps, avg: st.avg, p95: st.p95, calls, tris });
    refreshHud();
    if (st.avg > 20) break;
  }
  ui.status.textContent = `完成：${m} 的最高可持續數量見表格（判定：平均 > 20 ms 即停止）`;
  ramping = false;
}

async function runBench() {
  for (const m of MODES) await runRamp(m);
  ui.status.textContent = '三種模式都跑完了。', 
  (window as unknown as { __stress: unknown }).__stress = api;
}

function download() {
  const blob = new Blob([JSON.stringify({ gpu, pixelRatio: renderer.getPixelRatio(), results }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stress-results.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

const api = {
  report: () => ({ gpu, pixelRatio: renderer.getPixelRatio(), results }),
  mode: setMode,
  count: buildZombies,
  ramp: runRamp,
  bench: runBench,
  download,
};

// ---------------------------------------------------------------- 啟動

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight;
  camera.left = -viewSize * a / 2;
  camera.right = viewSize * a / 2;
  camera.top = viewSize / 2;
  camera.bottom = -viewSize / 2;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('wheel', e => {
  e.preventDefault();
  viewSize = THREE.MathUtils.clamp(viewSize * (e.deltaY < 0 ? 0.9 : 1.1), 18, 90);
  resize();
}, { passive: false });
resize();

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode as Mode));
});
document.querySelector<HTMLButtonElement>('#less')!.addEventListener('click', () => buildZombies(Math.max(0, count - 25)));
document.querySelector<HTMLButtonElement>('#more')!.addEventListener('click', () => buildZombies(count + 25));
document.querySelector<HTMLButtonElement>('#ramp')!.addEventListener('click', () => void runRamp(mode));
document.querySelector<HTMLButtonElement>('#bench')!.addEventListener('click', () => void runBench());
document.querySelector<HTMLButtonElement>('#save')!.addEventListener('click', download);

fetch('./data/block.json')
  .then(r => { if (!r.ok) throw new Error(`資料載入失敗 ${r.status}`); return r.json() as Promise<Block>; })
  .then(data => {
    block = data;
    px = data.spawn[0];
    pz = data.spawn[1];

    scene.add(new THREE.Mesh(cityGeometry(data), new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 1, side: THREE.DoubleSide })));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x9a9d8e, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    buildWalls(data);

    const p = new URLSearchParams(location.search);
    const m = p.get('mode') as Mode | null;
    mode = m && MODES.includes(m) ? m : 'instanced';
    const n = Number(p.get('n') ?? 100);
    buildZombies(Math.max(0, Math.min(600, Number.isFinite(n) ? n : 100)));

    ui.status.textContent = `GPU：${gpu}｜按 1/2/3 切換模式、- / + 調整數量、R 爬坡`;
    requestAnimationFrame(animate);

    if (p.has('bench')) void runBench();
  })
  .catch(err => {
    ui.status.textContent = `無法載入場景：${String(err)}`;
    console.error(err);
  });
