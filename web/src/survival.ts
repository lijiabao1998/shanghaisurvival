/**
 * 魔都生存：10 分鐘生存循環（垂直切片 v1）
 *
 * 一個資源：電池　一個威脅：聲音　一個目標：撐到天亮
 * 不含背包格子、合成、技能、槍械、載具、存檔。
 *
 * 玩法：WASD 移動、Shift 跑（耗體力、噪音大）、F 手電筒、按住 E 搜刮。
 * 手電筒是唯一光源，開著看得遠但更容易被看見；關掉省電，但幾乎全黑。
 */
import * as THREE from 'three';
import {
  cityGeometry, makeCollider, makeInsideTest, sampleOpenSpot, wallGridOf,
  type Block, type Building,
} from './world';

/** A named place from OSM: hospitals, schools, temples, parks. Real names. */
type Landmark = { x: number; y: number; label: string; cn: string };
/** A commercial POI with the brand stripped, leaving only its category. */
type Shop = { x: number; y: number; label: string };
type GameBlock = Block & { landmarks?: Landmark[]; shops?: Shop[] };

// ---------------------------------------------------------------- 參數

const NIGHT_SECONDS = 480;      // 現實 8 分鐘 = 遊戲內 02:00 → 05:00
/** Instanced eye buffer capacity, and the hard cap on simultaneous zombies. */
const MAX_ZOMBIES = 240;
/** The 250 m single-block slice these numbers were tuned on. */
const REF_AREA = 250 * 250;
let zombieCount = 80;
let containerCount = 12;
const WALK_SPEED = 3.2;
const RUN_SPEED = 5.8;
const ZOMBIE_CHASE = 1.55;
const ZOMBIE_WANDER = 0.5;
const SENSE_LIGHT = 22;          // 手電筒開著，喪屍多遠會注意到你
const SENSE_DARK = 9;
const HEAR_RUN = 20;
const HEAR_LOOT = 26;
const BATTERY_DRAIN = 0.55;      // 每秒 %；100% 約 182 秒
const BATTERY_PICKUP = 40;
const LOOT_SECONDS = 2.5;
const HIT_DAMAGE = 34;
const INVULN = 1.3;

// ---------------------------------------------------------------- DOM

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const el = {
  clock: document.querySelector<HTMLElement>('#clock')!,
  hp: document.querySelector<HTMLElement>('#hp')!,
  sta: document.querySelector<HTMLElement>('#sta')!,
  bat: document.querySelector<HTMLElement>('#bat')!,
  prompt: document.querySelector<HTMLElement>('#prompt')!,
  progress: document.querySelector<HTMLElement>('#progress')!,
  progressFill: document.querySelector<HTMLElement>('#progress > i')!,
  overlay: document.querySelector<HTMLElement>('#overlay')!,
  ovTitle: document.querySelector<HTMLElement>('#ov-title')!,
  ovBody: document.querySelector<HTMLElement>('#ov-body')!,
  ovBtn: document.querySelector<HTMLButtonElement>('#ov-btn')!,
  flash: document.querySelector<HTMLElement>('#flash')!,
  hint: document.querySelector<HTMLElement>('#hint')!,
  place: document.querySelector<HTMLElement>('#place')!,
};

// ?data=block_250m.json swaps the block without touching code.
const params = new URLSearchParams(location.search);
const rawData = params.get('data');
const dataUrl = rawData ? (rawData.includes('/') ? rawData : `./data/${rawData}`) : './data/block.json';

addEventListener('error', e => {
  el.ovBody.textContent = `JS 錯誤：${e.message}`;
  el.overlay.classList.add('on');
});
addEventListener('unhandledrejection', e => {
  el.ovBody.textContent = `未處理錯誤：${String(e.reason)}`;
  el.overlay.classList.add('on');
});

// ---------------------------------------------------------------- 渲染

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
const NIGHT_SKY = new THREE.Color(0x070b12);
scene.background = NIGHT_SKY;
scene.fog = new THREE.Fog(NIGHT_SKY, 55, 260);

const camera = new THREE.OrthographicCamera(-30, 30, 22, -22, 0.1, 2400);
let viewSize = 30;

const hemi = new THREE.HemisphereLight(0x3b4a66, 0x0a0d10, 1.45);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9db2dd, 0.75);
moon.position.set(-40, 80, 30);
scene.add(moon);

// ---------------------------------------------------------------- 玩家

const player = new THREE.Group();
scene.add(player);

function part(w: number, h: number, d: number, x: number, y: number, color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.position.set(x, y, 0);
  player.add(m);
  return m;
}
part(0.55, 0.7, 0.3, 0, 1.15, 0x54695f);
part(0.34, 0.37, 0.32, 0, 1.72, 0xd8c5a6);
const legL = part(0.18, 0.6, 0.2, -0.16, 0.48, 0x2f3738);
const legR = part(0.18, 0.6, 0.2, 0.16, 0.48, 0x2f3738);
part(0.16, 0.55, 0.18, -0.36, 1.12, 0x46584f);
part(0.16, 0.55, 0.18, 0.36, 1.12, 0x46584f);

const torch = new THREE.SpotLight(0xffe3ab, 170, 34, 0.55, 0.6, 1.3);
torch.position.set(0, 1.45, 0);
torch.target.position.set(0, 0.4, -8);
player.add(torch, torch.target);

// 玩家自身周圍的補光：讓角色與腳下地面看得見，不影響遠處的黑暗。
const torchHalo = new THREE.PointLight(0xa8c6b4, 10, 12, 2);
torchHalo.position.set(0, 2.4, 0);
player.add(torchHalo);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.46, 0.6, 24),
  new THREE.MeshBasicMaterial({ color: 0x8fb8a2, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.04;
player.add(ring);

// ---------------------------------------------------------------- 喪屍

const skinGeo = (() => {
  const g = new THREE.BoxGeometry(0.52, 1.72, 0.34, 1, 6, 1);
  g.translate(0, 0.86, 0);
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

const zombieMat = new THREE.MeshStandardMaterial({ color: 0x5d6650, roughness: 1 });

// 黑暗裡唯一能讀出危險的訊號：眼睛。休眠是暗綠，甦醒轉紅。
const eyeMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.15, 6, 4),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  MAX_ZOMBIES * 2,
);
eyeMesh.frustumCulled = false;
eyeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(eyeMesh);
const eyeDummy = new THREE.Object3D();
const eyeColor = new THREE.Color();

type ZState = 'sleep' | 'wander' | 'chase';
type Zombie = {
  mesh: THREE.SkinnedMesh;
  hips: THREE.Bone; chest: THREE.Bone; head: THREE.Bone;
  x: number; z: number; hx: number; hz: number;
  state: ZState;
  think: number; attackCd: number; lose: number; phase: number; walk: number;
  wx: number; wz: number;
};

const zombies: Zombie[] = [];
const zombieMeshes: THREE.SkinnedMesh[] = [];

function makeZombieMesh(): { mesh: THREE.SkinnedMesh; hips: THREE.Bone; chest: THREE.Bone; head: THREE.Bone } {
  const mesh = new THREE.SkinnedMesh(skinGeo, zombieMat);
  const hips = new THREE.Bone();
  const chest = new THREE.Bone();
  const head = new THREE.Bone();
  chest.position.y = 0.86;
  head.position.y = 0.44;
  hips.add(chest);
  chest.add(head);
  mesh.add(hips);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips, chest, head]));
  scene.add(mesh);
  return { mesh, hips, chest, head };
}

function buildZombies() {
  for (let i = 0; i < zombieCount; i++) {
    const rig = makeZombieMesh();
    zombieMeshes.push(rig.mesh);
    zombies.push({
      ...rig, x: 0, z: 0, hx: 0, hz: 0, state: 'sleep',
      think: Math.random() * 0.35, attackCd: 0, lose: 0, phase: Math.random() * 6.28, walk: 0,
      wx: 0, wz: 0,
    });
  }
}

// ---------------------------------------------------------------- 世界

let block: GameBlock;
let landmarks: Landmark[] = [];
let collides: (x: number, z: number, r?: number) => boolean;
let insideBuilding: (x: number, z: number) => boolean;
let bounds = { minX: 0, maxX: 250, minY: 0, maxY: 250 };
let px = 0, pz = 0, facing = 0;

type Container = { x: number; z: number; mesh: THREE.Mesh; looted: boolean };
const containers: Container[] = [];

const containerGeo = new THREE.BoxGeometry(0.8, 0.75, 0.6);
const containerMat = new THREE.MeshStandardMaterial({ color: 0x9a7635, emissive: 0xb87c1e, emissiveIntensity: 1.35, roughness: 0.85 });
const containerGeoUsed = new THREE.MeshStandardMaterial({ color: 0x3a3d3a, roughness: 1 });

// ---------------------------------------------------------------- 遊戲狀態

let phase: 'title' | 'play' | 'win' | 'lose' = 'title';
let hp = 100, stamina = 100, battery = 100;
let lightOn = true;
let invuln = 0;
let timeLeft = NIGHT_SECONDS;
let batteriesFound = 0;
let runNoiseTimer = 0, lootNoiseTimer = 0;
let lootTarget: Container | null = null;
let lootProgress = 0;
let shake = 0;
let walkCycle = 0;

// ---------------------------------------------------------------- 輸入

const keys = new Set<string>();
addEventListener('keydown', e => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyF' && phase === 'play') {
    lightOn = !lightOn && battery > 0;
    torch.visible = lightOn;
    torchHalo.visible = lightOn;
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- 聲音

function makeNoise(x: number, z: number, radius: number) {
  for (const zb of zombies) {
    if (zb.state === 'chase') continue;
    if (Math.hypot(zb.x - x, zb.z - z) < radius) wake(zb);
  }
}

function wake(zb: Zombie) {
  zb.state = 'chase';
  zb.lose = 0;
  zb.attackCd = 0.6;
}

/** 粗略視線：沿線取樣，撞牆就看不到。 */
function canSee(ax: number, az: number, bx: number, bz: number): boolean {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (collides(ax + (bx - ax) * t, az + (bz - az) * t, 0.15)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- 更新

function updatePlayer(dt: number) {
  const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const fwd = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const moving = right !== 0 || fwd !== 0;
  const wantRun = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && stamina > 1;
  const speed = wantRun ? RUN_SPEED : WALK_SPEED;

  if (moving) {
    const len = Math.hypot(right + fwd, right - fwd);
    const dx = (right - fwd) / len;
    const dz = (right + fwd) / len;
    const nx = px + dx * speed * dt;
    const nz = pz + dz * speed * dt;
    if (!collides(nx, pz, 0.36)) px = nx;
    if (!collides(px, nz, 0.36)) pz = nz;
    facing = Math.atan2(-dx, -dz);
    walkCycle += dt * (wantRun ? 13 : 8);
  } else {
    walkCycle *= 0.9;
  }

  stamina = wantRun
    ? Math.max(0, stamina - 22 * dt)
    : Math.min(100, stamina + 15 * dt);

  const legSwing = Math.sin(walkCycle) * (wantRun ? 0.7 : 0.45);
  legL.rotation.x = legSwing;
  legR.rotation.x = -legSwing;

  if (wantRun) {
    runNoiseTimer -= dt;
    if (runNoiseTimer <= 0) { runNoiseTimer = 0.35; makeNoise(px, pz, HEAR_RUN); }
  }

  if (lightOn) {
    battery = Math.max(0, battery - BATTERY_DRAIN * dt);
    if (battery <= 0) {
      lightOn = false;
      torch.visible = false;
      torchHalo.visible = false;
    }
  }

  invuln = Math.max(0, invuln - dt);
  player.position.set(px, 0, -pz);
  player.rotation.y = facing;
  torch.visible = lightOn;
  torchHalo.visible = lightOn;
}

function updateZombies(dt: number) {
  for (const zb of zombies) {
    const dx = px - zb.x, dz = pz - zb.z;
    const dist = Math.hypot(dx, dz);

    if (zb.state === 'sleep') {
      zb.think -= dt;
      if (zb.think <= 0) {
        zb.think = 0.35;
        const sense = lightOn ? SENSE_LIGHT : SENSE_DARK;
        if (dist < sense && canSee(zb.x, zb.z, px, pz)) wake(zb);
      }
      zb.mesh.position.set(zb.x, 0, -zb.z);
      continue;
    }

    if (zb.state === 'chase') {
      if (dist > 44) {
        zb.lose += dt;
        if (zb.lose > 6) {
          zb.state = 'wander';
          zb.wx = zb.hx; zb.wz = zb.hz;
          zb.lose = 0;
        }
      } else zb.lose = 0;

      if (dist > 1.15) {
        const step = ZOMBIE_CHASE * dt;
        const nx = zb.x + (dx / dist) * step;
        const nz = zb.z + (dz / dist) * step;
        if (!collides(nx, zb.z, 0.34)) zb.x = nx;
        if (!collides(zb.x, nz, 0.34)) zb.z = nz;
        zb.walk += step * 4;
      }

      zb.attackCd = Math.max(0, zb.attackCd - dt);
      if (dist < 1.25 && zb.attackCd <= 0 && invuln <= 0) {
        zb.attackCd = 1.7;
        hp = Math.max(0, hp - HIT_DAMAGE);
        invuln = INVULN;
        shake = 0.5;
        el.flash.classList.add('on');
        setTimeout(() => el.flash.classList.remove('on'), 220);
        if (hp <= 0) lose();
      }
    } else {
      // wander
      const tdx = zb.wx - zb.x, tdz = zb.wz - zb.z;
      const td = Math.hypot(tdx, tdz);
      if (td < 0.6) {
        zb.wx = zb.hx + (Math.random() - 0.5) * 8;
        zb.wz = zb.hz + (Math.random() - 0.5) * 8;
      } else {
        const step = ZOMBIE_WANDER * dt;
        const nx = zb.x + (tdx / td) * step;
        const nz = zb.z + (tdz / td) * step;
        if (!collides(nx, zb.z, 0.34)) zb.x = nx;
        if (!collides(zb.x, nz, 0.34)) zb.z = nz;
        zb.walk += step * 3;
      }
      if (dist < 4 && canSee(zb.x, zb.z, px, pz)) wake(zb);
    }

    zb.mesh.position.set(zb.x, 0, -zb.z);
    const ang = Math.atan2(dx, -dz);
    zb.mesh.rotation.y = ang;
    const swing = Math.sin(zb.walk + zb.phase);
    zb.chest.rotation.x = 0.1 + swing * 0.07;
    zb.hips.rotation.z = swing * 0.06;
    zb.head.rotation.x = -0.12;
  }
  syncEyes();
}

function syncEyes() {
  for (let i = 0; i < zombies.length; i++) {
    const zb = zombies[i];
    const c = Math.cos(zb.mesh.rotation.y), s = Math.sin(zb.mesh.rotation.y);
    const color = zb.state === 'chase' ? 0xff4a2a : zb.state === 'wander' ? 0x7a8f5e : 0x3f5a44;
    for (let e = 0; e < 2; e++) {
      const lx = e === 0 ? -0.11 : 0.11;
      const lz = -0.21;
      eyeDummy.position.set(zb.x + lx * c + lz * s, 1.58, -zb.z - lx * s + lz * c);
      eyeDummy.updateMatrix();
      eyeMesh.setMatrixAt(i * 2 + e, eyeDummy.matrix);
      eyeMesh.setColorAt(i * 2 + e, eyeColor.setHex(color));
    }
  }
  eyeMesh.count = zombies.length * 2;
  eyeMesh.instanceMatrix.needsUpdate = true;
  if (eyeMesh.instanceColor) eyeMesh.instanceColor.needsUpdate = true;
}

function updateLoot(dt: number) {
  let nearest: Container | null = null;
  let best = 1.9;
  for (const c of containers) {
    if (c.looted) continue;
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d < best) { best = d; nearest = c; }
  }

  if (nearest !== lootTarget) {
    lootTarget = nearest;
    lootProgress = 0;
    el.progress.classList.remove('on');
  }

  if (!lootTarget) {
    el.prompt.classList.remove('on');
    return;
  }

  el.prompt.classList.add('on');
  const holding = keys.has('KeyE');
  if (holding) {
    lootProgress += dt / LOOT_SECONDS;
    lootNoiseTimer -= dt;
    if (lootNoiseTimer <= 0) { lootNoiseTimer = 0.7; makeNoise(px, pz, HEAR_LOOT); }
    el.progress.classList.add('on');
    el.progressFill.style.width = `${Math.min(1, lootProgress) * 100}%`;

    if (lootProgress >= 1) {
      lootTarget.looted = true;
      lootTarget.mesh.material = containerGeoUsed;
      const got = Math.random() < 0.7;
      if (got) { batteriesFound++; battery = Math.min(100, battery + BATTERY_PICKUP); }
      el.hint.textContent = got ? `找到電池 +${BATTERY_PICKUP}%` : '空的。';
      setTimeout(() => { el.hint.textContent = 'F 手電筒 · Shift 跑 · 按住 E 搜刮'; }, 2200);
      lootTarget = null;
      lootProgress = 0;
      el.progress.classList.remove('on');
      el.prompt.classList.remove('on');
    }
  } else {
    lootProgress = Math.max(0, lootProgress - dt * 1.6);
    el.progressFill.style.width = `${Math.min(1, lootProgress) * 100}%`;
    if (lootProgress <= 0) el.progress.classList.remove('on');
  }
}

/** Nearest named place within 46 m: the only wayfinding cue in the dark. */
function updatePlaceLabel() {
  let best: Landmark | null = null;
  let bestDistance = 46;
  for (const l of landmarks) {
    const d = Math.hypot(l.x - px, l.y - pz);
    if (d < bestDistance) { bestDistance = d; best = l; }
  }
  if (best) {
    el.place.textContent = `${best.label}　${best.cn}`;
    el.place.classList.add('on');
  } else {
    el.place.classList.remove('on');
  }
}

function updateHud() {
  const t = 1 - Math.max(0, timeLeft) / NIGHT_SECONDS;
  const minutes = 120 + t * 180;
  const hh = Math.floor(minutes / 60);
  const mm = Math.floor(minutes % 60);
  el.clock.textContent = `0${hh}:${mm.toString().padStart(2, '0')}`;
  el.hp.style.width = `${hp}%`;
  el.sta.style.width = `${stamina}%`;
  el.bat.style.width = `${battery}%`;
  el.bat.classList.toggle('low', battery < 25);
  el.sta.classList.toggle('low', stamina < 25);
}

// ---------------------------------------------------------------- 流程

function resetWorld() {
  px = block.spawn[0];
  pz = block.spawn[1];
  facing = 0;
  for (const zb of zombies) {
    const spot = sampleOpenSpot(collides, insideBuilding, bounds, { x: px, z: pz }, 26);
    zb.x = zb.hx = spot ? spot.x : px + 30;
    zb.z = zb.hz = spot ? spot.z : pz + 30;
    zb.state = 'sleep';
    zb.think = Math.random() * 0.35;
    zb.attackCd = 0;
    zb.lose = 0;
    zb.wx = zb.hx; zb.wz = zb.hz;
    zb.mesh.position.set(zb.x, 0, -zb.z);
    zb.mesh.visible = true;
  }
  for (let i = 0; i < MAX_ZOMBIES * 2; i++) eyeMesh.setColorAt(i, eyeColor.setHex(0x3f5a44));
  syncEyes();

  for (const c of containers) {
    const spot = placeContainer();
    c.x = spot.x; c.z = spot.z; c.looted = false;
    c.mesh.position.set(c.x, 0.26, -c.z);
    c.mesh.material = containerMat;
    c.mesh.visible = true;
  }
}

function placeContainer(): { x: number; z: number } {
  // Prefer a real shopfront: loot belongs where the OSM POIs put the shops.
  const anchors = block.shops ?? [];
  if (anchors.length && Math.random() < 0.6) {
    const anchor = anchors[Math.floor(Math.random() * anchors.length)];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.8 + Math.random() * 5.5;
      const x = anchor.x + Math.cos(angle) * radius;
      const z = anchor.y + Math.sin(angle) * radius;
      if (!insideBuilding(x, z) && !collides(x, z, 0.5)) return { x, z };
    }
  }
  // Otherwise: a point just off a random facade, still on the street.
  for (let i = 0; i < 80; i++) {
    const b: Building = block.buildings[Math.floor(Math.random() * block.buildings.length)];
    const ring = b.footprint;
    const k = Math.floor(Math.random() * ring.length);
    const a = ring[k], c = ring[(k + 1) % ring.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 2) continue;
    let nx = -(c[1] - a[1]) / len, nz = (c[0] - a[0]) / len;
    let cx = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cz += p[1]; }
    cx /= ring.length; cz /= ring.length;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
    const x = mx + nx * 1.1, z = mz + nz * 1.1;
    if (insideBuilding(x, z) || collides(x, z, 0.5)) continue;
    return { x, z };
  }
  return { x: px + 4, z: pz + 4 };
}

function start() {
  hp = 100; stamina = 100; battery = 100;
  lightOn = true; invuln = 0; timeLeft = NIGHT_SECONDS;
  batteriesFound = 0; runNoiseTimer = 0; lootNoiseTimer = 0;
  lootTarget = null; lootProgress = 0; shake = 0;
  resetWorld();
  el.overlay.classList.remove('on');
  el.progress.classList.remove('on');
  el.prompt.classList.remove('on');
  el.hint.textContent = 'F 手電筒 · Shift 跑 · 按住 E 搜刮';
  phase = 'play';
}

function showOverlay(title: string, body: string, button: string) {
  el.ovTitle.textContent = title;
  el.ovBody.innerHTML = body;
  el.ovBtn.textContent = button;
  el.overlay.classList.add('on');
}

function win() {
  phase = 'win';
  showOverlay('天亮了', `你撐過了整夜。<br>找到電池 ${batteriesFound} 顆 · 剩餘體力 ${Math.round(hp)}`, '再來一次');
}

function lose() {
  phase = 'lose';
  showOverlay('你死了', `撐了 ${Math.floor((NIGHT_SECONDS - timeLeft) / 60)} 分 ${Math.floor((NIGHT_SECONDS - timeLeft) % 60)} 秒<br>找到電池 ${batteriesFound} 顆`, '再試一次');
}

el.ovBtn.addEventListener('click', start);

// ---------------------------------------------------------------- 主循環

function frame(dt: number) {
  if (phase === 'play') {
    timeLeft -= dt;
    updatePlayer(dt);
    updateZombies(dt);
    updateLoot(dt);
    updateHud();
    updatePlaceLabel();
    if (timeLeft <= 0 && phase === 'play') win();
  }

  shake = Math.max(0, shake - dt * 2.4);
  const jitter = shake * 0.35;
  const target = new THREE.Vector3(px, 1, -pz);
  camera.position.copy(target).add(new THREE.Vector3(40 + (Math.random() - 0.5) * jitter, 56 + (Math.random() - 0.5) * jitter, 40));
  camera.lookAt(target);
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  frame(dt);
  renderer.render(scene, camera);
}

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
  viewSize = THREE.MathUtils.clamp(viewSize * (e.deltaY < 0 ? 0.9 : 1.1), 12, 260);
  resize();
}, { passive: false });
resize();

// ---------------------------------------------------------------- 啟動

fetch(dataUrl)
  .then(r => { if (!r.ok) throw new Error(`資料載入失敗 ${r.status}`); return r.json() as Promise<GameBlock>; })
  .then(data => {
    block = data;
    landmarks = data.landmarks ?? [];
    const grid = wallGridOf(data);
    collides = makeCollider(grid);
    insideBuilding = makeInsideTest(data);
    px = data.spawn[0];
    pz = data.spawn[1];

    bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const b of data.buildings) {
      for (const p of b.footprint) {
        bounds.minX = Math.min(bounds.minX, p[0]); bounds.maxX = Math.max(bounds.maxX, p[0]);
        bounds.minY = Math.min(bounds.minY, p[1]); bounds.maxY = Math.max(bounds.maxY, p[1]);
      }
    }

    // Entities cost frame time, so density necessarily falls as the map grows:
    // 80 zombies on a 250 m block would mean ~800 here. sqrt keeps it affordable.
    const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
    zombieCount = Math.min(MAX_ZOMBIES, Math.max(80, Math.round(80 * Math.sqrt(area / REF_AREA))));
    containerCount = Math.min(48, Math.max(12, Math.round(12 * area / REF_AREA)));

    const city = new THREE.Mesh(
      cityGeometry(data),
      new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1, side: THREE.DoubleSide }),
    );
    scene.add(city);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(
        bounds.maxX - bounds.minX + 320,
        bounds.maxY - bounds.minY + 320,
      ),
      new THREE.MeshStandardMaterial({ color: 0x40484a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((bounds.minX + bounds.maxX) / 2, -0.02, -(bounds.minY + bounds.maxY) / 2);
    scene.add(ground);

    for (let i = 0; i < containerCount; i++) {
      const mesh = new THREE.Mesh(containerGeo, containerMat);
      mesh.position.set(0, 0.26, 0);
      scene.add(mesh);
      containers.push({ x: 0, z: 0, mesh, looted: false });
    }

    buildZombies();
    resetWorld();
    updateHud();

    showOverlay(
      '魔都生存',
      '凌晨兩點，街區斷電。<br>天亮之前，你只有一支手電筒。<br><br>'
      + '<b>WASD</b> 移動　<b>Shift</b> 跑（很吵）　<b>F</b> 手電筒<br>'
      + '<b>E</b> 按住搜刮路邊的箱子，裡面可能有電池。',
      '開始',
    );

    if (params.has('debug')) {
      (window as unknown as { __modu: unknown }).__modu = {
        state: () => ({
          phase, hp, battery, stamina, timeLeft,
          zombies: zombies.length, awake: zombies.filter(z => z.state === 'chase').length,
        }),
        wakeAll: () => { for (const zb of zombies) wake(zb); },
        swarm: (n = 12) => {
          const k = Math.min(n, zombies.length);
          for (let i = 0; i < k; i++) {
            const a = (i / k) * Math.PI * 2;
            const zb = zombies[i];
            zb.x = px + Math.cos(a) * 6.5;
            zb.z = pz + Math.sin(a) * 6.5;
            zb.state = 'chase';
            zb.lose = 0;
            zb.attackCd = 1.2;
          }
        },
        hurt: (n = 34) => { hp = Math.max(0, hp - n); if (hp <= 0) lose(); },
      };
    }

    if (params.has('play')) start();

    requestAnimationFrame(animate);
  })
  .catch(err => {
    el.hint.textContent = `無法載入場景：${String(err)}`;
    console.error(err);
  });
