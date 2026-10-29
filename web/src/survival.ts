/**
 * 魔都生存：老西門夜間生存
 *
 * 一個資源：電池　一個威脅：聲音　一個目標：撐到天亮
 * 十二個角色，六女六男，職業都是老城廂真的會遇到的。
 *
 * WASD 移動　Shift 跑　空白跳　F 手電筒
 * J 揮擊　K 投擲　G 開槍（需手槍與彈藥）　E 按住搜刮
 * 1 水　2 罐頭　3 醫療包　4 電池
 */
import * as THREE from 'three';
import {
  cityWalls, makeCollider, makeInsideTest, roofGeometry,
  sampleOpenSpot, wallGridOf,
  type Block, type Building,
} from './world';
import { ROSTER, buildRig, buildWeapon, type CharSpec, type Rig } from './characters';

// ---------------------------------------------------------------- 參數

const NIGHT_SECONDS = 480;
const MAX_ZOMBIES = 240;
const REF_AREA = 250 * 250;
const WALK_SPEED = 3.3;
const RUN_SPEED = 5.9;
const ZOMBIE_CHASE = 1.6;
const ZOMBIE_WANDER = 0.5;
const SENSE_LIGHT = 22;
const SENSE_DARK = 9;
const HEAR_RUN = 20;
const HEAR_LOOT = 26;
const HEAR_SWING = 14;
const HEAR_GUN = 70;
const BATTERY_DRAIN = 0.55;
const BATTERY_PICKUP = 40;
const LOOT_SECONDS = 1.3;

type ItemId = 'water' | 'food' | 'medkit' | 'battery' | 'ammo' | 'pistol';
const ITEMS: Record<ItemId, { label: string; hint: string }> = {
  water: { label: '水', hint: '體力 +35' },
  food: { label: '罐頭', hint: 'HP +14' },
  medkit: { label: '醫療包', hint: 'HP +45' },
  battery: { label: '電池', hint: '電量 +40' },
  ammo: { label: '彈藥', hint: '手槍 +6' },
  pistol: { label: '手槍', hint: '按 G 開槍' },
};
const LOOT_TABLE: [ItemId, number][] = [
  ['water', 28], ['food', 24], ['battery', 22], ['medkit', 10], ['ammo', 10], ['pistol', 6],
];

type Landmark = { x: number; y: number; label: string; cn: string };
type Shop = { x: number; y: number; label: string };
type GameBlock = Block & { landmarks?: Landmark[]; shops?: Shop[] };

// ---------------------------------------------------------------- DOM

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const el = {
  clock: q<HTMLElement>('#clock'),
  phase: q<HTMLElement>('#phase'),
  nightFill: q<HTMLElement>('#night-fill'),
  whoName: q<HTMLElement>('#who-name'),
  whoJob: q<HTMLElement>('#who-job'),
  hp: q<HTMLElement>('#hp'),
  sta: q<HTMLElement>('#sta'),
  bat: q<HTMLElement>('#bat'),
  hpNum: q<HTMLElement>('#hp-num'),
  staNum: q<HTMLElement>('#sta-num'),
  batNum: q<HTMLElement>('#bat-num'),
  barHp: q<HTMLElement>('#bar-hp'),
  barSta: q<HTMLElement>('#bar-sta'),
  barBat: q<HTMLElement>('#bar-bat'),
  moodles: q<HTMLElement>('#moodles'),
  bag: q<HTMLElement>('#bag'),
  kill: q<HTMLElement>('#tally-kill'),
  loot: q<HTMLElement>('#tally-loot'),
  prompt: q<HTMLElement>('#prompt'),
  promptKey: q<HTMLElement>('#prompt-key'),
  promptText: q<HTMLElement>('#prompt-text'),
  ring: q<SVGSVGElement>('#ring'),
  ringFg: q<SVGCircleElement>('#ring .fg'),
  overlay: q<HTMLElement>('#overlay'),
  roster: q<HTMLElement>('#roster'),
  pick: q<HTMLElement>('#pick'),
  ovBtn: q<HTMLButtonElement>('#ov-btn'),
  hurt: q<HTMLElement>('#hurt'),
  darkfall: q<HTMLElement>('#darkfall'),
  hint: q<HTMLElement>('#hint'),
  place: q<HTMLElement>('#place'),
};
const RING_LEN = 2 * Math.PI * 7.5;

addEventListener('error', e => {
  el.hint.textContent = `JS 錯誤：${e.message}`;
  console.error(e);
});

const params = new URLSearchParams(location.search);
const rawData = params.get('data');
const dataUrl = rawData ? (rawData.includes('/') ? rawData : `./data/${rawData}`) : './data/block.json';

// ---------------------------------------------------------------- 渲染

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
const NIGHT = new THREE.Color(0x0a1017);
scene.background = NIGHT;
scene.fog = new THREE.Fog(NIGHT, 70, 320);

// Key light sits on the camera side, otherwise every facade facing the player
// renders black and the street becomes unreadable.
const hemi = new THREE.HemisphereLight(0x5a6d8c, 0x1b2024, 2.1);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa8bcd8, 1.15);
moon.position.set(70, 95, 20);
scene.add(moon);

const camera = new THREE.OrthographicCamera(-30, 30, 22, -22, 0.1, 2400);
let viewSize = 17;

// ---------------------------------------------------------------- 玩家

let rig: Rig | null = null;
let playerRoot: THREE.Group | null = null;
let torch: THREE.SpotLight | null = null;
let halo: THREE.PointLight | null = null;
let weapon: THREE.Group | null = null;
let camShake = 0;

function spawnCharacter(spec: CharSpec) {
  if (playerRoot) scene.remove(playerRoot);
  rig = buildRig(spec);
  playerRoot = rig.root;

  torch = new THREE.SpotLight(0xffe3ab, 150, 32, 0.55, 0.6, 1.3);
  torch.position.set(0, 1.45, 0.15);
  torch.target.position.set(0, 0.3, 9);
  halo = new THREE.PointLight(0xa8c6b4, 9, 11, 2);
  halo.position.set(0, 2.3, 0);
  playerRoot.add(torch, torch.target, halo);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x8fb8a2, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  playerRoot.add(ring);

  weapon = buildWeapon('pipe');
  weapon.position.set(0, -spec.height * 0.27, 0.03);
  rig.armR.add(weapon);

  scene.add(playerRoot);
}

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

const zombieMat = new THREE.MeshStandardMaterial({ color: 0x646b56, roughness: 1 });
const eyeMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.095, 6, 4),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  MAX_ZOMBIES * 2,
);
eyeMesh.frustumCulled = false;
eyeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(eyeMesh);
const eyeDummy = new THREE.Object3D();
const eyeColor = new THREE.Color();

type ZState = 'sleep' | 'wander' | 'chase' | 'dead';
type Zombie = {
  mesh: THREE.SkinnedMesh;
  hips: THREE.Bone; chest: THREE.Bone; head: THREE.Bone;
  x: number; z: number; hx: number; hz: number;
  state: ZState;
  think: number; attackCd: number; lose: number; phase: number; walk: number;
  wx: number; wz: number; hp: number; flashT: number;
};

const zombies: Zombie[] = [];
let zombieCount = 80;

function makeZombieMesh() {
  const mesh = new THREE.SkinnedMesh(skinGeo, zombieMat.clone());
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
    const built = makeZombieMesh();
    zombies.push({
      ...built, x: 0, z: 0, hx: 0, hz: 0, state: 'sleep',
      think: Math.random() * 0.35, attackCd: 0, lose: 0, phase: Math.random() * 6.28,
      walk: 0, wx: 0, wz: 0, hp: 100, flashT: 0,
    });
  }
}

// ---------------------------------------------------------------- 世界

let block: GameBlock;
let collides: (x: number, z: number, r?: number) => boolean;
let insideBuilding: (x: number, z: number) => boolean;
let landmarks: Landmark[] = [];
let bounds = { minX: 0, maxX: 250, minY: 0, maxY: 250 };
let px = 0, pz = 0, py = 0, vy = 0, facing = 0;
let grounded = true;

type Container = { x: number; z: number; mesh: THREE.Mesh; looted: boolean };
const containers: Container[] = [];
let containerCount = 12;
const containerGeo = new THREE.BoxGeometry(0.8, 0.75, 0.6);
const containerMat = new THREE.MeshStandardMaterial({ color: 0x9a7635, emissive: 0xb87c1e, emissiveIntensity: 1.1, roughness: 0.85 });
const containerUsed = new THREE.MeshStandardMaterial({ color: 0x3a3d3a, roughness: 1 });

type Projectile = { mesh: THREE.Mesh; x: number; z: number; y: number; vx: number; vz: number; vy: number; life: number; kind: 'brick' | 'bottle' };
const projectiles: Projectile[] = [];
const brickGeo = new THREE.BoxGeometry(0.16, 0.1, 0.22);
const brickMat = new THREE.MeshStandardMaterial({ color: 0x8d5b45, roughness: 1 });

// ---------------------------------------------------------------- 狀態

let phase: 'menu' | 'play' | 'win' | 'lose' = 'menu';
let spec: CharSpec = ROSTER[0];
let hp = 100, stamina = 100, battery = 100;
let lightOn = true;
let invuln = 0, shake = 0;
let timeLeft = NIGHT_SECONDS;
let kills = 0;
let looted = 0;
let hasPistol = false, ammo = 0;
let runNoiseTimer = 0, lootNoiseTimer = 0;
let lootTarget: Container | null = null;
let lootProgress = 0;
let walkPhase = 0;
let action: 'none' | 'swing' | 'throw' | 'loot' = 'none';
let actionT = 0, actionDur = 0, actionFired = false;
let muzzle: THREE.PointLight | null = null;
let muzzleT = 0;
const inventory: Record<ItemId, number> = { water: 1, food: 1, medkit: 0, battery: 0, ammo: 0, pistol: 0 };

// ---------------------------------------------------------------- 音源

function makeNoise(x: number, z: number, radius: number) {
  for (const zb of zombies) {
    if (zb.state === 'chase' || zb.state === 'dead') continue;
    if (Math.hypot(zb.x - x, zb.z - z) < radius) wake(zb);
  }
}
function wake(zb: Zombie) {
  if (zb.state === 'dead') return;
  zb.state = 'chase';
  zb.lose = 0;
  zb.attackCd = 0.6;
}
/** Cheap line of sight: sample the wall grid along the segment. */
function canSee(ax: number, az: number, bx: number, bz: number): boolean {
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    if (collides(ax + (bx - ax) * t, az + (bz - az) * t, 0.15)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- 輸入

const keys = new Set<string>();
const ATTACK_KEYS = ['KeyJ', 'KeyK', 'KeyG'];
addEventListener('keydown', e => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (phase !== 'play') return;
  if (e.code === 'KeyF') {
    lightOn = !lightOn && battery > 0;
    if (torch) torch.visible = lightOn;
    if (halo) halo.visible = lightOn;
  }
  if (e.code === 'Space' && grounded) { vy = 4.9; grounded = false; }
  if (e.code === 'KeyJ') startSwing();
  if (e.code === 'KeyK') startThrow();
  if (e.code === 'KeyG') fire();
  if (e.code === 'Digit1') useItem('water');
  if (e.code === 'Digit2') useItem('food');
  if (e.code === 'Digit3') useItem('medkit');
  if (e.code === 'Digit4') useItem('battery');
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- 動作

function startSwing() {
  if (action !== 'none' || stamina < 6) return;
  action = 'swing'; actionT = 0; actionDur = 0.36; actionFired = false;
  stamina = Math.max(0, stamina - 6);
  makeNoise(px, pz, HEAR_SWING);
}

function startThrow() {
  if (action !== 'none' || stamina < 8) return;
  action = 'throw'; actionT = 0; actionDur = 0.44; actionFired = false;
  stamina = Math.max(0, stamina - 8);
}

function forwardXZ() {
  return { x: Math.sin(facing), z: -Math.cos(facing) };
}

function meleeHit() {
  const f = forwardXZ();
  for (const zb of zombies) {
    if (zb.state === 'dead') continue;
    const dx = zb.x - px, dz = zb.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > 2.4 || d < 0.01) continue;
    const dot = (dx / d) * f.x + (dz / d) * f.z;
    if (dot < 0.45) continue;
    damageZombie(zb, 45, dx / d, dz / d, 1.6);
  }
}

function throwBrick() {
  const f = forwardXZ();
  const mesh = new THREE.Mesh(brickGeo, brickMat);
  scene.add(mesh);
  projectiles.push({
    mesh, x: px + f.x * 0.5, z: pz + f.z * 0.5, y: py + 1.35,
    vx: f.x * 13, vz: f.z * 13, vy: 3.4, life: 3, kind: 'brick',
  });
}

function fire() {
  if (!hasPistol || ammo <= 0 || action !== 'none') return;
  ammo -= 1;
  action = 'throw'; actionT = 0; actionDur = 0.22; actionFired = true;
  muzzleT = 0.07;
  camShake = Math.max(camShake, 0.7);
  makeNoise(px, pz, HEAR_GUN);
  const f = forwardXZ();
  if (muzzle) {
    muzzle.position.set(px + f.x * 0.8, py + 1.35, -(pz + f.z * 0.8));
    muzzle.visible = true;
  }
  let best: Zombie | null = null;
  let bestD = 30;
  for (const zb of zombies) {
    if (zb.state === 'dead') continue;
    const dx = zb.x - px, dz = zb.z - pz;
    const along = dx * f.x + dz * f.z;
    if (along < 0.5 || along > bestD) continue;
    const perp = Math.abs(dx * f.z - dz * f.x);
    if (perp > 0.85) continue;
    best = zb; bestD = along;
  }
  if (best) damageZombie(best, 200, f.x, f.z, 3);
  updateBag();
}

function damageZombie(zb: Zombie, amount: number, nx: number, nz: number, knock: number) {
  zb.hp -= amount;
  zb.flashT = 0.12;
  if (zb.hp <= 0) {
    zb.state = 'dead';
    zb.mesh.visible = false;
    kills += 1;
    return;
  }
  zb.state = 'chase';
  zb.x += nx * knock * 0.4;
  zb.z += nz * knock * 0.4;
}

function useItem(id: ItemId) {
  if (phase !== 'play' || inventory[id] <= 0) return;
  inventory[id] -= 1;
  if (id === 'water') { stamina = Math.min(100, stamina + 35); flashHint('喝了一瓶水，體力回復。'); }
  if (id === 'food') { hp = Math.min(100, hp + 14); flashHint('吃了罐頭，HP +14。'); }
  if (id === 'medkit') { hp = Math.min(100, hp + 45); flashHint('包紮完成，HP +45。'); }
  if (id === 'battery') { battery = Math.min(100, battery + BATTERY_PICKUP); flashHint(`換了電池，電量 ${Math.round(battery)}%。`); }
  if (id === 'ammo') { ammo += 6; flashHint('彈藥 +6。'); }
  if (id === 'pistol') { hasPistol = true; ammo += 6; flashHint('撿到手槍。按 G 開槍，很吵。'); }
  updateBag();
}

let hintTimer = 0;
function flashHint(text: string) {
  el.hint.textContent = text;
  hintTimer = 2.4;
}
const HINT_DEFAULT = 'F 手電筒 · Shift 跑 · 空白鍵跳 · J 揮擊 · K 投擲 · G 開槍 · E 搜刮';

// ---------------------------------------------------------------- 更新

function updatePlayer(dt: number) {
  const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const fwd = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const moving = right !== 0 || fwd !== 0;
  const wantRun = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && stamina > 1 && action === 'none';
  const speed = wantRun ? RUN_SPEED : WALK_SPEED;

  let movedSpeed = 0;
  if (moving && action === 'none') {
    const len = Math.hypot(right + fwd, right - fwd);
    const dx = (right - fwd) / len;
    const dz = (right + fwd) / len;
    const nx = px + dx * speed * dt;
    const nz = pz + dz * speed * dt;
    if (!collides(nx, pz, 0.36)) px = nx;
    if (!collides(px, nz, 0.36)) pz = nz;
    // Model faces +Z, and world z is -data y.
    facing = Math.atan2(dx, -dz);
    movedSpeed = speed;
    walkPhase += dt * speed * 2.5;
  }

  stamina = wantRun
    ? Math.max(0, stamina - 22 * dt)
    : Math.min(100, stamina + 14 * dt);

  if (wantRun) {
    runNoiseTimer -= dt;
    if (runNoiseTimer <= 0) { runNoiseTimer = 0.35; makeNoise(px, pz, HEAR_RUN); }
  }

  if (lightOn) {
    battery = Math.max(0, battery - BATTERY_DRAIN * dt);
    if (battery <= 0) {
      lightOn = false;
      if (torch) torch.visible = false;
      if (halo) halo.visible = false;
      flashHint('手電筒沒電了。');
    }
  }

  if (!grounded) {
    vy -= 16 * dt;
    py += vy * dt;
    if (py <= 0) { py = 0; vy = 0; grounded = true; }
  }

  invuln = Math.max(0, invuln - dt);
  if (playerRoot) {
    playerRoot.position.set(px, py, -pz);
    playerRoot.rotation.y = facing;
  }
  if (torch) torch.visible = lightOn;
  if (halo) halo.visible = lightOn;

  animateRig(dt, movedSpeed);
}

function animateRig(dt: number, speed: number) {
  if (!rig) return;
  const { legL, legR, armL, armR, torso } = rig;
  const moving = speed > 0.05;
  const amp = Math.min(1, speed / RUN_SPEED);

  const swingAmt = moving ? Math.sin(walkPhase) * (0.42 + amp * 0.55) : 0;
  legL.rotation.x = swingAmt;
  legR.rotation.x = -swingAmt;
  armL.rotation.x = moving ? -swingAmt * 0.75 : -0.12;
  armR.rotation.x = moving ? swingAmt * 0.55 : -0.12;
  armL.rotation.z = -0.05;
  armR.rotation.z = 0.05;
  torso.rotation.set(moving ? 0.05 + amp * 0.1 : Math.sin(walkPhase * 0.4) * 0.02, 0, 0);

  if (!grounded) {
    legL.rotation.x = -0.55; legR.rotation.x = 0.35;
    armL.rotation.x = -0.8; armR.rotation.x = -0.6;
    torso.rotation.x = 0.12;
  }

  if (action !== 'none') {
    actionT += dt;
    const t = Math.min(1, actionT / actionDur);
    if (action === 'swing') {
      const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      armR.rotation.x = -2.2 * k;
      armR.rotation.z = 0.45 * k;
      torso.rotation.y = -0.45 * k;
      torso.rotation.x = 0.18 * k;
      if (!actionFired && t >= 0.38) { actionFired = true; meleeHit(); }
    } else if (action === 'throw') {
      const k = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
      armR.rotation.x = -1.6 * k;
      armR.rotation.z = -0.3 * k;
      torso.rotation.y = 0.35 * k;
      if (actionFired) { armR.rotation.x = -0.9; }
      if (!actionFired && t >= 0.45) { actionFired = true; throwBrick(); }
    } else if (action === 'loot') {
      torso.rotation.x = 0.55;
      armR.rotation.x = 1.15;
      armL.rotation.x = 1.0;
      legL.rotation.x = -0.25; legR.rotation.x = 0.2;
    }
    if (actionT >= actionDur) {
      action = 'none'; actionT = 0; actionFired = false;
      torso.rotation.y = 0;
    }
  }
}

function updateZombies(dt: number) {
  for (const zb of zombies) {
    if (zb.state === 'dead') continue;
    zb.flashT = Math.max(0, zb.flashT - dt);
    (zb.mesh.material as THREE.MeshStandardMaterial).color.setHex(zb.flashT > 0 ? 0xa33a2a : 0x646b56);

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
        if (zb.lose > 6) { zb.state = 'wander'; zb.wx = zb.hx; zb.wz = zb.hz; zb.lose = 0; }
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
      // Reach only counts with line of sight; a wall between you is a wall.
      if (dist < 1.3 && zb.attackCd <= 0 && invuln <= 0 && canSee(zb.x, zb.z, px, pz)) {
        zb.attackCd = 1.7;
        hp = Math.max(0, hp - 30);
        invuln = 1.3;
        camShake = 0.6;
        el.hurt.style.opacity = '0.85';
        setTimeout(() => { if (hp >= 35) el.hurt.style.opacity = ''; }, 190);
        if (hp <= 0) lose();
      }
    } else {
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
    zb.mesh.rotation.y = Math.atan2(dx, -dz);
    const sw = Math.sin(zb.walk + zb.phase);
    zb.chest.rotation.x = 0.1 + sw * 0.07;
    zb.hips.rotation.z = sw * 0.06;
    zb.head.rotation.x = -0.12;
  }
  syncEyes();
}

function syncEyes() {
  let n = 0;
  for (const zb of zombies) {
    if (zb.state === 'dead') continue;
    const c = Math.cos(zb.mesh.rotation.y), s = Math.sin(zb.mesh.rotation.y);
    const color = zb.state === 'chase' ? 0xff4a2a : zb.state === 'wander' ? 0x7a8f5e : 0x3f5a44;
    for (let e = 0; e < 2; e++) {
      const lx = e === 0 ? -0.11 : 0.11;
      const lz = 0.21;
      eyeDummy.position.set(zb.x + lx * c + lz * s, 1.58, -zb.z - lx * s + lz * c);
      eyeDummy.updateMatrix();
      eyeMesh.setMatrixAt(n * 2 + e, eyeDummy.matrix);
      eyeMesh.setColorAt(n * 2 + e, eyeColor.setHex(color));
    }
    n += 1;
  }
  eyeMesh.count = n * 2;
  eyeMesh.instanceMatrix.needsUpdate = true;
  if (eyeMesh.instanceColor) eyeMesh.instanceColor.needsUpdate = true;
}

function updateProjectiles(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.vy -= 18 * dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.y += p.vy * dt;
    p.mesh.position.set(p.x, p.y, -p.z);
    p.mesh.rotation.x += dt * 9;
    p.mesh.rotation.z += dt * 7;

    let hit = false;
    for (const zb of zombies) {
      if (zb.state === 'dead') continue;
      if (Math.hypot(zb.x - p.x, zb.z - p.z) < 0.6 && p.y < 2) {
        damageZombie(zb, 60, p.vx * 0.05, p.vz * 0.05, 1.2);
        hit = true;
        break;
      }
    }
    if (p.y <= 0.08) { hit = true; makeNoise(p.x, p.z, 12); }
    if (hit || p.life <= 0) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

function setRing(progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  el.ring.classList.toggle('on', p > 0.001);
  el.ringFg.style.strokeDashoffset = String(RING_LEN * (1 - p));
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
    setRing(0);
    if (action === 'loot') action = 'none';
  }

  if (!lootTarget) {
    el.prompt.classList.remove('on');
    setRing(0);
    if (action === 'loot') action = 'none';
    return;
  }

  el.prompt.classList.add('on');
  const holding = keys.has('KeyE');
  if (holding) {
    if (action !== 'loot') { action = 'loot'; actionT = 0; actionDur = 1e9; }
    lootProgress += dt / LOOT_SECONDS;
    lootNoiseTimer -= dt;
    if (lootNoiseTimer <= 0) { lootNoiseTimer = 0.7; makeNoise(px, pz, HEAR_LOOT); }
    setRing(lootProgress);

    if (lootProgress >= 1) {
      lootTarget.looted = true;
      lootTarget.mesh.material = containerUsed;
      const item = rollLoot();
      inventory[item] += 1;
      if (item === 'pistol') { hasPistol = true; ammo += 6; }
      looted += 1;
      flashHint(`撿到 ${ITEMS[item].label}（${ITEMS[item].hint}）`);
      updateBag();
      lootTarget = null;
      lootProgress = 0;
      action = 'none'; actionT = 0;
      setRing(0);
      el.prompt.classList.remove('on');
    }
  } else {
    if (action === 'loot') { action = 'none'; actionT = 0; }
    lootProgress = Math.max(0, lootProgress - dt * 1.8);
    setRing(lootProgress);
  }
}

function rollLoot(): ItemId {
  const total = LOOT_TABLE.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of LOOT_TABLE) {
    r -= w;
    if (r <= 0) return id;
  }
  return 'water';
}

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
  el.nightFill.style.width = `${Math.min(100, t * 100)}%`;
  el.phase.textContent = t > 0.82 ? 'dawn' : 'night';

  el.hp.style.width = `${hp}%`;
  el.sta.style.width = `${stamina}%`;
  el.bat.style.width = `${battery}%`;
  el.hpNum.textContent = String(Math.round(hp));
  el.staNum.textContent = String(Math.round(stamina));
  el.batNum.textContent = String(Math.round(battery));

  el.barHp.classList.toggle('low', hp < 35);
  el.barSta.classList.toggle('low', stamina < 22);
  el.barBat.classList.toggle('low', battery < 20);
  el.hurt.classList.toggle('low', hp < 35 && hp > 0);
  if (hp >= 35) el.hurt.style.opacity = '';
  el.darkfall.classList.toggle('on', !lightOn);
  updateMoodles();
}

let moodleKey = '';
function updateMoodles() {
  const list: [string, string][] = [];
  if (hp < 30) list.push(['重傷', 'bad']);
  else if (hp < 65) list.push(['受傷', 'warn']);
  if (stamina < 22) list.push(['疲憊', 'warn']);
  if (battery <= 0) list.push(['全黑', 'bad']);
  else if (battery < 20) list.push(['快沒電', 'warn']);
  if (lightOn) list.push(['顯眼', '']);
  if (hasPistol && ammo > 0) list.push([`彈藥 ${ammo}`, '']);
  const key = list.map(([t]) => t).join('|');
  if (key === moodleKey) return;
  moodleKey = key;
  el.moodles.innerHTML = list
    .map(([text, cls]) => `<span class="moodle ${cls}">${text}</span>`)
    .join('');
}

const ITEM_COLOR: Record<ItemId, string> = {
  water: '#6aa8c9', food: '#c9a15a', medkit: '#c96a6a',
  battery: '#d8b45f', ammo: '#9aa0a6', pistol: '#b8bcc2',
};
const BAG_ROWS: [ItemId | 'kill', string, string][] = [
  ['water', '礦泉水', '1'], ['food', '罐頭', '2'], ['medkit', '醫療包', '3'],
  ['battery', '電池', '4'], ['ammo', '彈藥', 'G'], ['pistol', '手槍', 'G'],
];

function updateBag() {
  el.bag.innerHTML = '';
  for (const [id, label, key] of BAG_ROWS) {
    if (id === 'pistol' && !hasPistol) continue;
    if (id === 'ammo' && !hasPistol) continue;
    const count = id === 'pistol' ? 1 : id === 'ammo' ? ammo : inventory[id as ItemId];
    const row = document.createElement('div');
    row.className = `row ${count > 0 ? 'has' : 'empty'}`;
    row.innerHTML =
      `<span class="dot" style="background:${ITEM_COLOR[id as ItemId]}"></span>` +
      `<span class="nm">${label}</span>` +
      `<span class="ct">${count > 0 ? `×${count}` : '—'}</span>` +
      `<span class="hk">${key}</span>`;
    el.bag.appendChild(row);
  }
  el.kill.textContent = `擊殺 ${kills}`;
  el.loot.textContent = `搜刮 ${looted}`;
}

// ---------------------------------------------------------------- 流程

function resetWorld() {
  px = block.spawn[0];
  pz = block.spawn[1];
  py = 0; vy = 0; grounded = true;
  facing = Math.PI;
  for (const zb of zombies) {
    const spot = sampleOpenSpot(collides, insideBuilding, bounds, { x: px, z: pz }, 26);
    zb.x = zb.hx = spot ? spot.x : px + 30;
    zb.z = zb.hz = spot ? spot.z : pz + 30;
    zb.state = 'sleep';
    zb.think = Math.random() * 0.35;
    zb.attackCd = 0; zb.lose = 0;
    zb.wx = zb.hx; zb.wz = zb.hz;
    zb.hp = 100;
    zb.mesh.visible = true;
    zb.mesh.position.set(zb.x, 0, -zb.z);
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
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
}

function placeContainer(): { x: number; z: number } {
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
    if (!insideBuilding(x, z) && !collides(x, z, 0.5)) return { x, z };
  }
  return { x: px + 4, z: pz + 4 };
}

function start(chosen: CharSpec) {
  spec = chosen;
  hp = 100; stamina = 100; battery = 100;
  lightOn = true; invuln = 0; timeLeft = NIGHT_SECONDS;
  kills = 0; hasPistol = false; ammo = 0;
  runNoiseTimer = 0; lootNoiseTimer = 0;
  lootTarget = null; lootProgress = 0; shake = 0; camShake = 0;
  action = 'none'; actionT = 0; actionFired = false;
  inventory.water = 1; inventory.food = 1; inventory.medkit = 0;
  inventory.battery = 0; inventory.ammo = 0; inventory.pistol = 0;

  spawnCharacter(chosen);
  if (torch) torch.visible = lightOn;
  if (halo) halo.visible = lightOn;
  el.whoName.textContent = chosen.name;
  el.whoJob.textContent = chosen.job;
  el.hurt.style.opacity = '';
  el.hurt.classList.remove('low');
  looted = 0;
  moodleKey = '';
  resetWorld();
  updateHud();
  updateBag();
  el.hint.textContent = HINT_DEFAULT;
  el.overlay.classList.remove('on');
  setRing(0);
  el.prompt.classList.remove('on');
  phase = 'play';
}

function showOverlay(title: string, body: string, button: string, stats?: [string, string][]) {
  const card = el.overlay.querySelector<HTMLElement>('.card')!;
  el.overlay.querySelector('h1')!.textContent = title;
  el.overlay.querySelector('.sub')!.innerHTML = body;
  el.roster.style.display = 'none';
  el.roster.innerHTML = '';
  card.querySelector('#stats')?.remove();
  if (stats?.length) {
    const grid = document.createElement('div');
    grid.id = 'stats';
    grid.innerHTML = stats
      .map(([label, value]) => `<div class="s"><div class="l">${label}</div><div class="n">${value}</div></div>`)
      .join('');
    card.insertBefore(grid, el.ovBtn);
  }
  el.pick.style.display = 'block';
  el.pick.className = 'empty';
  el.pick.textContent = '';
  const swap = document.createElement('span');
  swap.textContent = '換一個角色';
  swap.style.cssText = 'color:#93a296;text-decoration:underline;cursor:pointer';
  swap.onclick = () => location.reload();
  el.pick.appendChild(swap);
  el.ovBtn.textContent = button;
  el.ovBtn.disabled = false;
  el.ovBtn.onclick = () => { el.overlay.classList.remove('on'); start(spec); };
  el.overlay.classList.add('on');
}

function win() {
  phase = 'win';
  const secs = Math.floor(NIGHT_SECONDS - timeLeft);
  showOverlay('天亮了', `<b>${spec.name}</b>（${spec.job}）走完了這一夜。`, '再守一夜', [
    ['存活', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
    ['擊殺', String(kills)],
    ['搜刮', String(looted)],
    ['剩餘 HP', String(Math.round(hp))],
  ]);
}

function lose() {
  phase = 'lose';
  const secs = Math.floor(NIGHT_SECONDS - timeLeft);
  showOverlay('你死了', `<b>${spec.name}</b>沒能走出這條弄堂。`, '再試一次', [
    ['撐了', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
    ['擊殺', String(kills)],
    ['搜刮', String(looted)],
    ['進度', `${Math.round((secs / NIGHT_SECONDS) * 100)}%`],
  ]);
}

// ---------------------------------------------------------------- 選單

function buildMenu() {
  el.roster.style.display = '';
  el.pick.style.display = '';
  el.roster.innerHTML = '';
  for (const c of ROSTER) {
    const card = document.createElement('div');
    card.className = 'who';
    const face = document.createElement('div');
    face.className = 'face';
    face.style.background = `linear-gradient(160deg, #${c.hair.toString(16).padStart(6, '0')} 0 34%, #${c.skin.toString(16).padStart(6, '0')} 34% 100%)`;
    face.style.borderTop = `3px solid #${c.top.toString(16).padStart(6, '0')}`;
    const nm = document.createElement('div');
    nm.className = 'nm'; nm.textContent = c.name;
    const jb = document.createElement('div');
    jb.className = 'jb'; jb.textContent = c.job;
    const sx = document.createElement('div');
    sx.className = 'sx'; sx.textContent = c.sex === 'f' ? '女' : '男';
    card.append(face, nm, jb, sx);
    card.onclick = () => {
      el.roster.querySelectorAll('.who').forEach(w => w.classList.remove('sel'));
      card.classList.add('sel');
      el.pick.className = '';
      el.pick.innerHTML = `<b>${c.name}</b>·${c.job}·${c.sex === 'f' ? '女' : '男'}——${c.blurb}`;
      el.ovBtn.disabled = false;
      spec = c;
    };
    el.roster.appendChild(card);
  }
  el.ovBtn.disabled = true;
  el.ovBtn.onclick = () => { el.overlay.classList.remove('on'); start(spec); };
}

// ---------------------------------------------------------------- 主循環

function frame(dt: number) {
  if (phase === 'play') {
    timeLeft -= dt;
    updatePlayer(dt);
    updateZombies(dt);
    updateProjectiles(dt);
    updateLoot(dt);
    updateHud();
    updatePlaceLabel();
    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) el.hint.textContent = HINT_DEFAULT;
    }
    if (muzzleT > 0) {
      muzzleT -= dt;
      if (muzzle && muzzleT <= 0) muzzle.visible = false;
    }
    if (timeLeft <= 0) win();
  }

  shake = Math.max(0, shake - dt * 2.4);
  camShake = Math.max(0, camShake - dt * 3);
  const jitter = camShake * 0.5;
  const target = new THREE.Vector3(px, 1, -pz);
  camera.position.copy(target).add(new THREE.Vector3(
    40 + (Math.random() - 0.5) * jitter,
    56 + (Math.random() - 0.5) * jitter,
    40,
  ));
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
  viewSize = THREE.MathUtils.clamp(viewSize * (e.deltaY < 0 ? 0.9 : 1.1), 9, 200);
  resize();
}, { passive: false });
resize();

// ---------------------------------------------------------------- 啟動

fetch(dataUrl)
  .then(r => { if (!r.ok) throw new Error(`資料載入失敗 ${r.status}`); return r.json() as Promise<GameBlock>; })
  .then(data => {
    block = data;
    landmarks = data.landmarks ?? [];
    const grid = wallGridOf(data, true);
    collides = makeCollider(grid);
    insideBuilding = makeInsideTest(data);

    bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const b of data.buildings) {
      for (const p of b.footprint) {
        bounds.minX = Math.min(bounds.minX, p[0]); bounds.maxX = Math.max(bounds.maxX, p[0]);
        bounds.minY = Math.min(bounds.minY, p[1]); bounds.maxY = Math.max(bounds.maxY, p[1]);
      }
    }

    const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
    zombieCount = Math.min(MAX_ZOMBIES, Math.max(80, Math.round(80 * Math.sqrt(area / REF_AREA))));
    containerCount = Math.min(48, Math.max(12, Math.round(12 * area / REF_AREA)));

    // Walls and roofs are separate so doorways can exist without a roof hole.
    scene.add(new THREE.Mesh(
      cityWalls(data.buildings),
      new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 1, side: THREE.DoubleSide }),
    ));
    scene.add(new THREE.Mesh(
      roofGeometry(data.buildings),
      new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 1, side: THREE.DoubleSide }),
    ));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(
        bounds.maxX - bounds.minX + 320,
        bounds.maxY - bounds.minY + 320,
      ),
      new THREE.MeshStandardMaterial({ color: 0x4a5254, roughness: 1 }),
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

    muzzle = new THREE.PointLight(0xffd6a0, 9, 16, 2);
    muzzle.visible = false;
    scene.add(muzzle);

    px = data.spawn[0];
    pz = data.spawn[1];
    buildZombies();
    buildMenu();

    if (params.has('debug')) {
      (window as unknown as { __modu: unknown }).__modu = {
        state: () => ({
          phase, hp, battery, stamina, timeLeft, kills,
          zombies: zombies.length, awake: zombies.filter(z => z.state === 'chase').length,
          dead: zombies.filter(z => z.state === 'dead').length,
          inventory: { ...inventory }, ammo, hasPistol,
          spawn: [px, pz], facing,
        }),
        start: (id = ROSTER[0].id) => {
          const found = ROSTER.find(r => r.id === id) ?? ROSTER[0];
          el.overlay.classList.remove('on');
          start(found);
        },
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
        swing: () => startSwing(),
        hurt: (n = 30) => { hp = Math.max(0, hp - n); if (hp <= 0) lose(); },
        give: (id: ItemId, n = 1) => { inventory[id] += n; if (id === 'pistol') hasPistol = true; updateBag(); },
      };
    }

    if (params.has('play')) {
      el.overlay.classList.remove('on');
      start(ROSTER[0]);
    }

    animate();
  })
  .catch(err => {
    el.hint.textContent = `無法載入場景：${String(err)}`;
    console.error(err);
  });
