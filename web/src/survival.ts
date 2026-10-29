import { viewHeight } from './view';
import { emptyInventory, loadSnapshot, saveSnapshot, transferItem, restAtShelter, dayPhase, type Snapshot } from './campaign';
import { selectShelter, type Shelter } from './shelter';
import { installTouchControls } from './touch-controls';
import { sweepMove, segmentClear } from './combat';
import { profileFor, type FactionProfile } from './factions';
import { createOutbreak, stepOutbreak, applySupply, canEvacuate } from './outbreak';
/**
 * 上海倖存者：老西門夜間生存
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
let outbreak = createOutbreak();
let mode: 'sandbox' | 'quick' = 'sandbox';
let elapsed = 0;
let inShelter = false;
let shelter: Shelter | null = null;
let shelterRoof: THREE.Mesh | null = null;
let stash = emptyInventory();
let restCount = 0;
let saveTimer = 0;
let saveWarning = '';
let savedGame: Snapshot | null = null;
let shelterPanel: HTMLElement;
let sneaking = false;
let paused = false;
let bagOpen = false;
let attackHeld = false;
let touchActionHeld = false;
let pistolEquipped = false;
let mouseAimActive = false;
const inputAim = new THREE.Vector2();
const aimRay = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
const aimHit = new THREE.Vector3();
let evacRing: THREE.Mesh | null = null;
const mission = document.querySelector<HTMLElement>('#mission')!;
const radio = document.querySelector<HTMLElement>('#radio')!;
const needs = document.querySelector<HTMLElement>('#needs')!;
const BROADCASTS = [
  [0, '02:00｜社區互助台：不明病毒爆發，感染者會追逐聲光。先搜集三處補給，再回綠圈接應點。'],
  [120, '02:45｜街區消息：供水已中斷。保留飲水與罐頭，C 潛行避開感染者。'],
  [270, '03:41｜社區互助台：接應隊正在清理通道。保持距離，暴露壓力太高時先脫離追逐。'],
  [420, '04:37｜接應窗口開啟：帶回搜刮紀錄，回綠圈按 E 撤離。05:00 後通道關閉。'],
] as const;
const MAX_ZOMBIES = 240;
const REF_AREA = 250 * 250;
const WALK_SPEED = 3.3;
const RUN_SPEED = 5.9;
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
  water: { label: '水', hint: '水分 +40、體力 +35' },
  food: { label: '罐頭', hint: '飽足 +35、HP +14' },
  medkit: { label: '醫療包', hint: 'HP +45' },
  battery: { label: '電池', hint: '電量 +40' },
  ammo: { label: '彈藥', hint: '手槍 +6' },
  pistol: { label: '手槍', hint: '背包裝備後左鍵開槍' },
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
  side: q<HTMLElement>('#side'),
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
const saveKey = `shanghai-survivors:v1:${dataUrl}`;

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
let viewZoom = 1;

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
  faction: FactionProfile; warning: number;
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
    const faction = profileFor(i);
    (built.mesh.material as THREE.MeshStandardMaterial).color.setHex(faction.color);
    if (faction.id !== 'infected') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(.6,.16,.4), new THREE.MeshStandardMaterial({color:faction.color}));
      cap.position.set(0,1.78,0); built.mesh.add(cap);
      if (faction.id === 'military') { const rifle = new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.8),new THREE.MeshStandardMaterial({color:0x20252a})); rifle.position.set(.28,.85,.2); built.mesh.add(rifle); }
    }
    zombies.push({
      ...built, faction, warning: 0, x: 0, z: 0, hx: 0, hz: 0, state: 'sleep',
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
  return segmentClear(ax, az, bx, bz, collides);
}

// ---------------------------------------------------------------- 輸入

const keys = new Set<string>();
const ATTACK_KEYS = ['KeyJ', 'KeyK', 'KeyG'];
addEventListener('keydown', e => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (phase !== 'play') return;
  if(inShelter) { if(e.code==='Escape')leaveShelter(); return; }
  if (e.code === 'Escape') { if (bagOpen) toggleBag(false); else paused = !paused; keys.clear(); attackHeld = false; touchActionHeld = false; return; }
  if (e.code === 'Tab' || e.code === 'KeyI') { toggleBag(!bagOpen); return; }
  if (paused || bagOpen || inShelter) return;
  keys.add(e.code);
  if (e.code === 'KeyE') contextualInteract();
  if (e.code === 'KeyC') sneaking = !sneaking;
  if (e.code === 'KeyF') {
    lightOn = !lightOn && battery > 0;
    if (torch) torch.visible = lightOn;
    if (halo) halo.visible = lightOn;
  }
  if (e.code === 'Space' && grounded) { vy = 4.9; grounded = false; }
  if (e.code === 'KeyJ') startSwing();
  if (e.code === 'KeyK') startThrow();
  if (e.code === 'KeyQ') shove();
});
addEventListener('keyup', e => keys.delete(e.code));
function releaseGameplayInput() {
  keys.clear(); attackHeld = false; touchActionHeld = false;
  if (action === 'loot') { action = 'none'; lootProgress = 0; setRing(0); }
}
addEventListener('blur', releaseGameplayInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseGameplayInput(); });
function toggleBag(open: boolean) {
  bagOpen = open;
  keys.clear(); attackHeld=false;touchActionHeld=false;
  el.side.classList.toggle('bag-open', open);
  el.side.setAttribute('aria-label', open ? '背包，點選物品使用；Esc關閉' : '背包');
}
function contextualInteract(): boolean {
  if (phase !== 'play' || paused || bagOpen || inShelter) return false;
  if (mode === 'sandbox' && shelter && Math.hypot(px-shelter.outside[0],pz-shelter.outside[1]) < 2.5 && canSee(px,pz,...shelter.outside)) { enterShelter(); return true; }
  if (lootTarget) return true;
  if (Math.hypot(px - block.spawn[0], pz - block.spawn[1]) > 5) return false;
  if (mode === 'quick' && NIGHT_SECONDS - timeLeft >= 420) {
    if (canEvacuate(outbreak, NIGHT_SECONDS - timeLeft, looted, Math.hypot(px-block.spawn[0],pz-block.spawn[1]))) win();
    else flashHint('接應需搜刮3處、暴露低於85且窗口未關閉。');
  } else if (inventory.food > 0) { inventory.food--; inventory.water++; updateBag(); persistCampaign(); flashHint('互助者：罐頭換飲水，保重。'); }
  else flashHint('互助者：帶一份罐頭來換水。最後一分鐘在這裡接應。');
  return true;
}
function shove() {
  if (stamina < 10 || action !== 'none') return;
  stamina -= 10;
  for (const z of zombies) {
    const dx = z.x-px, dz = z.z-pz, d=Math.hypot(dx,dz);
    if (z.state === 'dead' || d > 2 || d < .01 || !canSee(px,pz,z.x,z.z)) continue;
    const nx=z.x+dx/d*.7, nz=z.z+dz/d*.7;
    if (!collides(nx,nz,.34)) {z.x=nx; z.z=nz;}
    z.attackCd=Math.max(z.attackCd,1.5);
  }
  makeNoise(px,pz,8);
}
function aimNearest() {
  let nearest: Zombie | undefined; let distance=25;
  for (const z of zombies) { const d=Math.hypot(z.x-px,z.z-pz); if(z.state !== 'dead' && d<distance && canSee(px,pz,z.x,z.z)) {nearest=z;distance=d;} }
  if (nearest) facing=Math.atan2(nearest.x-px,-(nearest.z-pz));
}
canvas.addEventListener('pointermove',e=>{
  if (e.pointerType !== 'mouse' || phase !== 'play' || paused || bagOpen) return;
  mouseAimActive = true;
  inputAim.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
  aimRay.setFromCamera(inputAim,camera);
  if (aimRay.ray.intersectPlane(groundPlane,aimHit)) facing=Math.atan2(aimHit.x-px,aimHit.z+pz);
});
canvas.addEventListener('pointerdown',e=>{ if(e.pointerType === 'mouse' && e.button===0 && phase==='play' && !paused && !bagOpen) attackHeld=true; });
addEventListener('pointerup',()=>{attackHeld=false;});
addEventListener('pointercancel',()=>{attackHeld=false;touchActionHeld=false;keys.delete('KeyE');});
addEventListener('survivor-action',e=>{
  const start=(e as CustomEvent).detail.phase==='start';
  if (!start) {touchActionHeld=false;keys.delete('KeyE');return;}
  if (phase !== 'play' || paused || bagOpen) return;
  if (contextualInteract()) keys.add('KeyE');
  else {touchActionHeld=true;aimNearest();}
});
installTouchControls();

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
    if (dot < 0.45 || !canSee(px, pz, zb.x, zb.z)) continue;
    damageZombie(zb, 45, dx / d, dz / d, 1.6);
  }
}

function throwBrick() {
  const f = forwardXZ();
  const mesh = new THREE.Mesh(brickGeo, brickMat);
  scene.add(mesh);
  projectiles.push({
    // Sweep from the player's clear position; an offset could spawn beyond a wall.
    mesh, x: px, z: pz, y: py + 1.35,
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
    if (perp > 0.85 || !canSee(px,pz,zb.x,zb.z)) continue;
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
  const pushed = sweepMove(zb.x, zb.z, nx * knock * 0.4, nz * knock * 0.4, 0.34, collides);
  zb.x = pushed.x;
  zb.z = pushed.z;
}

function useItem(id: ItemId) {
  if (phase !== 'play' || paused || inventory[id] <= 0) return;
  inventory[id] -= 1;
  if (id === 'water' || id === 'food' || id === 'medkit') applySupply(outbreak, id);
  if (id === 'water') { stamina = Math.min(100, stamina + 35); flashHint('喝水補充水分，體力回復。'); }
  if (id === 'food') { hp = Math.min(100, hp + 14); flashHint('吃了罐頭，補充飽足，HP +14。'); }
  if (id === 'medkit') { hp = Math.min(100, hp + 45); flashHint('處置傷口，暴露壓力降低，HP +45（虛構機制）。'); }
  if (id === 'battery') { battery = Math.min(100, battery + BATTERY_PICKUP); flashHint(`換了電池，電量 ${Math.round(battery)}%。`); }
  if (id === 'ammo') { ammo += 6; flashHint('彈藥 +6。'); }
  if (id === 'pistol') { hasPistol = true; ammo += 6; flashHint('撿到手槍。背包裝備後左鍵開槍，很吵。'); }
  updateBag();persistCampaign();
}

let hintTimer = 0;
function flashHint(text: string) {
  el.hint.textContent = text;
  hintTimer = 2.4;
}
const HINT_DEFAULT = 'WASD 移動 · Shift 跑 · C 潛行 · 左鍵攻擊 · Q 推開 · E 互動 · Tab 背包 · F 燈 · Esc 暫停';

// ---------------------------------------------------------------- 更新

function updatePlayer(dt: number) {
  const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const fwd = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const moving = right !== 0 || fwd !== 0;
  const wantRun = !sneaking && moving && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && stamina > 1 && action === 'none';
  const speed = (wantRun ? RUN_SPEED : sneaking ? WALK_SPEED * 0.5 : WALK_SPEED) * (outbreak.hydration < 20 ? 0.75 : 1);

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
    if (!mouseAimActive && !touchActionHeld) facing = Math.atan2(dx, -dz);
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
    (zb.mesh.material as THREE.MeshStandardMaterial).color.setHex(zb.flashT > 0 ? 0xa33a2a : zb.faction.color);

    const dx = px - zb.x, dz = pz - zb.z;
    const dist = Math.hypot(dx, dz);

    if (zb.state === 'sleep') {
      zb.think -= dt;
      if (zb.think <= 0) {
        zb.think = 0.35;
        const sense = (lightOn ? SENSE_LIGHT : SENSE_DARK) * (sneaking ? 0.6 : 1) * (mode==='sandbox' && zb.faction.id==='infected' && dayPhase(elapsed).daylight<.25 ? 1.35 : 1);
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

      if (dist > zb.faction.range * 0.8) {
        const step = zb.faction.speed * dt;
        const nx = zb.x + (dx / dist) * step;
        const nz = zb.z + (dz / dist) * step;
        if (!collides(nx, zb.z, 0.34)) zb.x = nx;
        if (!collides(zb.x, nz, 0.34)) zb.z = nz;
        zb.walk += step * 4;
      }
      zb.attackCd = Math.max(0, zb.attackCd - dt);
      const inRange = dist < zb.faction.range && canSee(zb.x, zb.z, px, pz);
      if (inRange && zb.attackCd <= 0) {
        if (zb.warning === 0 && zb.faction.id !== 'infected') flashHint(`${zb.faction.label}警告：離開警戒範圍！找牆遮擋。`);
        zb.warning += dt;
      } else zb.warning = 0;
      if (inRange && zb.attackCd <= 0 && zb.warning >= zb.faction.warningSeconds && invuln <= 0) {
        zb.attackCd = zb.faction.cooldown;
        zb.warning = 0;
        hp = Math.max(0, hp - zb.faction.damage);
        if (zb.faction.id === 'raider' && inventory.water > 0) { inventory.water--; updateBag(); flashHint('掠奪者搶走了一瓶水！'); }
        if (zb.faction.id === 'police') stamina = Math.max(0, stamina - 25);
        if (zb.faction.id === 'military') makeNoise(zb.x, zb.z, 45);
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
    let target: Zombie | null = null;
    const oldY = p.y;
    const swept = sweepMove(p.x, p.z, p.vx * dt, p.vz * dt, 0.12, (x, z, radius) => {
      if (collides(x, z, radius)) return true;
      const travelled = Math.hypot(x - p.x, z - p.z);
      const total = Math.hypot(p.vx * dt, p.vz * dt);
      const height = oldY + p.vy * dt * (total > 0 ? travelled / total : 0);
      if (height >= 2 || height < 0) return false;
      for (const zb of zombies) {
        if (zb.state !== 'dead' && Math.hypot(zb.x - x, zb.z - z) < 0.6) { target = zb; return true; }
      }
      return false;
    });
    p.x = swept.x;
    p.z = swept.z;
    p.y += p.vy * dt;
    p.mesh.position.set(p.x, p.y, -p.z);
    p.mesh.rotation.x += dt * 9;
    p.mesh.rotation.z += dt * 7;

    let hit = swept.blocked;
    if (target) damageZombie(target, 60, p.vx * 0.05, p.vz * 0.05, 1.2);
    if (swept.blocked) makeNoise(p.x, p.z, 12);
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
    if (d < best && canSee(px, pz, c.x, c.z)) { best = d; nearest = c; }
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
      el.prompt.classList.remove('on');persistCampaign();
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
  const elapsed = mode === 'quick' ? NIGHT_SECONDS - timeLeft : campaignElapsed();
  const distance = Math.hypot(px - block.spawn[0], pz - block.spawn[1]);
  const touchButton = document.querySelector<HTMLElement>('#survivor-touch-action');
  if(touchButton) touchButton.textContent = mode==='sandbox' && shelter && Math.hypot(px-shelter.outside[0],pz-shelter.outside[1])<2.5 ? '家' : lootTarget ? '搜' : distance <= 5 ? (mode==='quick' && elapsed >= 420 ? '撤' : '換') : '打';
  needs.textContent = `水分 ${Math.round(outbreak.hydration)} · 飽足 ${Math.round(outbreak.satiety)} · 暴露 ${Math.round(outbreak.exposure)}${sneaking ? ' · 潛行' : ''}`;
  mission.textContent = bagOpen ? '背包已開啟（暫停）｜點物品使用，Tab / Esc 返回' : paused ? '已暫停｜Esc 繼續' : `接應點 ${Math.round(distance)}m · 搜刮 ${Math.min(looted, 3)}/3 · ${elapsed >= 480 ? '窗口已關閉' : elapsed >= 420 ? '窗口開啟，回綠圈按 E' : `接應倒數 ${Math.ceil(420 - elapsed)} 秒`} · 暴露須低於85`;
  if(mode==='sandbox') {
    const day=dayPhase(elapsed);
    mission.textContent = inShelter ? '安全屋｜存放物資、休息或返回街區' : bagOpen ? '背包（暫停）｜點擊使用／裝備' : paused ? '已暫停｜Esc 繼續' : `第 ${day.day} 天 · 安全屋 ${shelter ? Math.round(Math.hypot(px-shelter.outside[0],pz-shelter.outside[1])) : '?'}m · 已搜 ${looted}/${containers.length} · 回家存放補給`;
    radio.textContent = saveWarning || (inShelter ? '休息花費庫存1水＋1罐頭，時間推進2分鐘。物資有限，不會重生。' : day.daylight<.25 ? '夜間感染者更敏銳。慢行、關燈；帶回一水一食便能在家休息。' : '互助台：藍色門標是你的安全屋。物資與已搜地點自動保存。');
  } else radio.textContent = [...BROADCASTS].reverse().find(([at]) => elapsed >= at)?.[1] ?? '';
  if (evacRing) (evacRing.material as THREE.MeshBasicMaterial).color.setHex(elapsed >= 420 && elapsed < 480 ? 0x9fffc2 : 0x397959);
  const t = mode==='sandbox' ? (dayPhase(elapsed).hour-2)/3 : 1 - Math.max(0, timeLeft) / NIGHT_SECONDS;
  const minutes = 120 + t * 180;
  const hh = Math.floor(minutes / 60);
  const mm = Math.floor(minutes % 60);
  el.clock.textContent = `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2, '0')}`;
  el.nightFill.style.width = `${Math.min(100, t * 100)}%`;
  el.phase.textContent = mode==='sandbox' ? `day ${dayPhase(elapsed).day}` : t > 0.82 ? 'dawn' : 'night';

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
  ['water', '礦泉水', '使用'], ['food', '罐頭', '使用'], ['medkit', '醫療包', '使用'],
  ['battery', '電池', '使用'], ['ammo', '彈藥', '裝填'], ['pistol', '手槍', '裝備'],
];

function updateBag() {
  el.bag.innerHTML = '';
  for (const [id, label, key] of BAG_ROWS) {
    if (id === 'pistol' && !hasPistol) continue;
    if (id === 'ammo' && !hasPistol) continue;
    const count = id === 'pistol' ? 1 : id === 'ammo' ? inventory.ammo : inventory[id as ItemId];
    const row = document.createElement('button');
    row.type = 'button';
    row.setAttribute('aria-label', `${label}，${id === 'pistol' ? '切換裝備' : '點擊使用'}`);
    row.onclick = () => { if (id === 'pistol') { pistolEquipped = !pistolEquipped; flashHint(pistolEquipped ? '已裝備手槍，左鍵攻擊' : '已裝備鐵管，左鍵攻擊'); } else if (id !== 'kill') useItem(id); };
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
  persistCampaign();
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
    zb.attackCd = 0; zb.warning = 0; zb.lose = 0;
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

function start(chosen: CharSpec, resume: Snapshot | null = null) {
  if(mode==='sandbox'&&!resume&&savedGame?.status==='alive'&&!confirm('開始新沙盒會覆寫這個瀏覽器的舊進度。確定開始新遊戲？')) {el.overlay.classList.add('on');return;}
  if(!resume)savedGame=null;
  elapsed=0; inShelter=false; stash=emptyInventory(); restCount=0; saveTimer=0; saveWarning='';
  shelterPanel.hidden=true; if(shelterRoof)shelterRoof.visible=true;
  spec = chosen;
  document.querySelector<HTMLElement>('#campaign-mode')?.setAttribute('hidden','');
  hp = 100; stamina = 100; battery = 100;
  outbreak = createOutbreak(); sneaking = false; paused = false; attackHeld=false;touchActionHeld=false;pistolEquipped=false;mouseAimActive=false;toggleBag(false);keys.clear();
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
  if(resume) restoreCampaign(resume);
  updateHud();
  updateBag();
  el.hint.textContent = HINT_DEFAULT;
  el.overlay.classList.remove('on');
  setRing(0);
  el.prompt.classList.remove('on');
  phase = 'play';
  if(mode==='sandbox')updateDaylight();
  if(inShelter) showShelter();
  persistCampaign();
}

function showOverlay(title: string, body: string, button: string, stats?: [string, string][]) {
  document.querySelector<HTMLElement>('#campaign-mode')?.setAttribute('hidden','');
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
  const secs = Math.floor(mode==='sandbox'?elapsed:NIGHT_SECONDS-timeLeft);
  showOverlay('抵達安全接應點', `<b>${spec.name}</b>（${spec.job}）帶回街區補給情報，登上接應車。病毒危機尚未結束。`, '再守一夜', [
    ['存活', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
    ['擊殺', String(kills)],
    ['搜刮', String(looted)],
    ['剩餘 HP', String(Math.round(hp))],
  ]);
}

function lose(reason = '沒能走出這條弄堂。') {
  phase = 'lose';
  persistCampaign();
  const secs = Math.floor(mode==='sandbox'?elapsed:NIGHT_SECONDS-timeLeft);
  showOverlay('你死了', `<b>${spec.name}</b>${reason}`, '再試一次', [
    ['撐了', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
    ['擊殺', String(kills)],
    ['搜刮', String(looted)],
    ['進度', `${Math.round((secs / NIGHT_SECONDS) * 100)}%`],
  ]);
}

// ---------------------------------------------------------------- 選單

function buildMenu() {
  installCampaignUI();
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

// Campaign persistence owns one atomic snapshot: loot depletion and inventory never save separately.
function campaignElapsed() { return elapsed; }
function snapshotCampaign(): Snapshot {
  return { version:1,mapId:dataUrl,characterId:spec.id,elapsed,hp:phase==='lose'?0:hp,stamina,battery,outbreak:{...outbreak},inventory:{...inventory},stash:{...stash},ammo,hasPistol,pistolEquipped,position:[px,pz],shelterId:shelter?.id??'',inShelter,looted,kills,restCount,status:phase==='lose'?'dead':'alive',
    containers:containers.map(c=>({x:c.x,z:c.z,looted:c.looted})),
    enemies:zombies.map(z=>({x:z.x,z:z.z,hp:Math.max(0,z.hp),state:z.state,faction:z.faction.id})) };
}
function persistCampaign() {
  if(mode!=='sandbox'||!shelter||(phase!=='play'&&phase!=='lose'))return;
  try { if(!saveSnapshot(localStorage,saveKey,snapshotCampaign()))saveWarning='存檔失敗：儲存空間不足或被封鎖，請勿關閉本頁。'; else saveWarning=''; }
  catch {saveWarning='存檔失敗：瀏覽器封鎖儲存，請勿關閉本頁。';}
}
function restoreCampaign(s:Snapshot) {
  elapsed=s.elapsed;timeLeft=NIGHT_SECONDS-elapsed;hp=s.hp;stamina=s.stamina;battery=s.battery;
  outbreak={...s.outbreak};Object.assign(inventory,s.inventory);stash={...s.stash};ammo=s.ammo;hasPistol=s.hasPistol;pistolEquipped=s.pistolEquipped;
  [px,pz]=s.position;inShelter=s.inShelter;looted=s.looted;kills=s.kills;restCount=s.restCount;
  s.containers.forEach((c,i)=>{Object.assign(containers[i],c);containers[i].mesh.position.set(c.x,.26,-c.z);containers[i].mesh.material=c.looted?containerUsed:containerMat;});
  s.enemies.forEach((z,i)=>{Object.assign(zombies[i],z,{faction:profileFor(i),hx:z.x,hz:z.z,wx:z.x,wz:z.z});zombies[i].mesh.visible=z.state!=='dead';zombies[i].mesh.position.set(z.x,0,-z.z);});
  if(inShelter&&shelter)[px,pz]=shelter.inside;
  if(playerRoot)playerRoot.position.set(px,0,-pz);syncEyes();updateDaylight();
}
function updateDaylight() {
  const light=dayPhase(elapsed).daylight;
  hemi.intensity=1.1+light*1.5;moon.intensity=.4+light*1.4;
  const color=new THREE.Color(0x0a1017).lerp(new THREE.Color(0x829da3),light);
  scene.background=color;if(scene.fog instanceof THREE.Fog)scene.fog.color.copy(color);
}
function clearControlState(){keys.clear();attackHeld=false;touchActionHeld=false;action='none';lootTarget=null;lootProgress=0;setRing(0);el.prompt.classList.remove('on');}
function enterShelter() {
  if(!shelter||mode!=='sandbox')return;
  const chasing=zombies.some(z=>z.state!=='dead'&&Math.hypot(z.x-px,z.z-pz)<6&&canSee(px,pz,z.x,z.z));
  if(chasing){flashHint('敵人太近，先甩開追逐才能開安全屋門。');return;}
  inShelter=true;[px,pz]=shelter.inside;py=0;vy=0;grounded=true;clearControlState();toggleBag(false);
  if(playerRoot)playerRoot.position.set(px,0,-pz);showShelter();persistCampaign();
}
function leaveShelter() {
  if(!shelter)return;
  inShelter=false;paused=false;[px,pz]=shelter.outside;if(playerRoot)playerRoot.position.set(px,0,-pz);
  shelterPanel.hidden=true;if(shelterRoof)shelterRoof.visible=true;
  document.querySelector<HTMLElement>('#survivor-touch-controls')?.removeAttribute('hidden');
  clearControlState();invuln=1.5;persistCampaign();flashHint('離開安全屋。先找水與罐頭，別把所有物資帶出去。');
}
function showShelter() {
  shelterPanel.hidden=false;if(shelterRoof)shelterRoof.visible=false;
  const touch=document.querySelector<HTMLElement>('#survivor-touch-controls');if(touch)touch.hidden=true;
  shelterPanel.replaceChildren();
  const title=document.createElement('h2');title.textContent='弄堂安全屋';shelterPanel.append(title);
  const info=document.createElement('p');info.textContent='門已關好。物品可逐個存取；休息消耗庫存一水一罐頭，推進2分鐘。';shelterPanel.append(info);
  const controls=document.createElement('div');controls.className='shelter-stock';
  for(const id of Object.keys(ITEMS) as ItemId[]) {
    if(id==='pistol')continue; // The equipped weapon stays on the survivor; supplies are transferable.
    const row=document.createElement('div');const label=document.createElement('span');label.textContent=`${ITEMS[id].label}：隨身 ${inventory[id]} ／庫存 ${stash[id]}`;
    const put=document.createElement('button');put.textContent='存1';put.disabled=inventory[id]<1;
    const take=document.createElement('button');take.textContent='取1';take.disabled=stash[id]<1;
    put.onclick=()=>{if(transferItem(inventory,stash,id)){persistCampaign();updateBag();showShelter();}};
    take.onclick=()=>{if(transferItem(stash,inventory,id)){persistCampaign();updateBag();showShelter();}};
    row.append(label,put,take);controls.append(row);
  }
  shelterPanel.append(controls);
  const rest=document.createElement('button');rest.textContent='休息：庫存 1水＋1罐頭';rest.disabled=stash.water<1||stash.food<1;
  rest.onclick=()=>{const state={hp,stamina,outbreak,inventory,stash,elapsed,restCount};if(restAtShelter(state)){hp=state.hp;stamina=state.stamina;elapsed=state.elapsed;restCount=state.restCount;updateDaylight();persistCampaign();showShelter();flashHint('休息完成，補充體力與水分；街區時間已前進。');}};
  const exit=document.createElement('button');exit.textContent='返回街區';exit.onclick=leaveShelter;
  shelterPanel.append(rest,exit);
  const status=document.createElement('p');status.textContent=`HP ${Math.round(hp)} · 水分 ${Math.round(outbreak.hydration)} · 飽足 ${Math.round(outbreak.satiety)} · 第${dayPhase(elapsed).day}天 ${saveWarning}`;shelterPanel.append(status);
}
function installCampaignUI() {
  const style=document.createElement('style');style.textContent=`#campaign-mode[hidden]{display:none}#campaign-mode{margin:12px 0;display:flex;gap:8px;flex-wrap:wrap}#campaign-mode button,#shelter-panel button{min-height:44px;padding:8px 12px;border:1px solid #93b6ad;background:#203631;color:#f4ecda;border-radius:6px;font:inherit;cursor:pointer}#campaign-mode button:disabled,#shelter-panel button:disabled{opacity:.4;cursor:default}#shelter-panel{position:fixed;z-index:60;right:3vw;top:10vh;width:min(430px,88vw);max-height:78vh;overflow:auto;background:#142422f5;color:#f4ecda;border:1px solid #70b4ac;padding:16px;border-radius:10px;font:14px system-ui}#shelter-panel[hidden]{display:none}.shelter-stock>div{display:flex;align-items:center;gap:7px;margin:7px 0}.shelter-stock span{flex:1}#shelter-panel>button{margin:10px 8px 0 0}#campaign-mode .selected{background:#486354}`;document.head.append(style);
  shelterPanel=document.createElement('section');shelterPanel.id='shelter-panel';shelterPanel.hidden=true;shelterPanel.setAttribute('aria-label','安全屋物資與休息');document.body.append(shelterPanel);
  new MutationObserver(()=>{const touch=document.querySelector<HTMLElement>('#survivor-touch-controls');if(touch)touch.hidden=!shelterPanel.hidden||el.overlay.classList.contains('on');}).observe(shelterPanel,{attributes:true,attributeFilter:['hidden']});
  const modes=document.createElement('div');modes.id='campaign-mode';
  const sand=document.createElement('button');sand.textContent='生存沙盒（持久存檔）';sand.className='selected';sand.disabled=!shelter;
  const quick=document.createElement('button');quick.textContent='8分鐘快速撤離（獨立）';
  sand.onclick=()=>{mode='sandbox';sand.className='selected';quick.className='';};quick.onclick=()=>{mode='quick';quick.className='selected';sand.className='';};
  if(!shelter){mode='quick';quick.className='selected';sand.textContent='此地圖未找到安全門口';}
  modes.append(sand,quick);
  const valid=savedGame&&savedGame.status==='alive'&&savedGame.hp>0&&savedGame.shelterId===shelter?.id&&savedGame.containers.length===containers.length&&savedGame.enemies.length===zombies.length&&ROSTER.some(c=>c.id===savedGame!.characterId);
  if(valid){const resume=document.createElement('button');resume.textContent=`繼續第${dayPhase(savedGame!.elapsed).day}天存檔`;resume.onclick=()=>{let current:Snapshot|null=null;try{current=loadSnapshot(localStorage,saveKey,dataUrl);}catch{}if(!current||current.status!=='alive'||current.hp<=0){resume.disabled=true;resume.textContent='存檔已失效';return;}mode='sandbox';modes.hidden=true;start(ROSTER.find(c=>c.id===current!.characterId)??ROSTER[0],current);};modes.append(resume);}
  const note=document.createElement('p');note.textContent=savedGame?.status==='dead'?'上一位倖存者已死亡；新沙盒會重設世界與庫存。':valid?'選角後開始新沙盒會覆寫此瀏覽器的舊進度；快速挑戰不影響存檔。':'沙盒：找藍色門標，按E／手機「家」進入。先帶一水一罐頭回家。';
  el.roster.before(modes,note);
  el.overlay.querySelector('.sub')!.textContent='上海病毒爆發。選角色後探索街區、搜刮並返回自己的安全屋；或選擇獨立八分鐘撤離挑戰。';
}
addEventListener('pagehide',persistCampaign);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='play'){persistCampaign();clearControlState();paused=true;}});

// ---------------------------------------------------------------- 主循環

function frame(dt: number) {
  if (phase === 'play' && !paused && !bagOpen && !inShelter) {
    if(mode==='quick')timeLeft -= dt;
    else { elapsed += dt; timeLeft = NIGHT_SECONDS - elapsed; updateDaylight(); }
    const nearbyThreat = zombies.some(z => z.faction.id === 'infected' && z.state !== 'dead' && Math.hypot(z.x - px, z.z - pz) < 4 && canSee(z.x, z.z, px, pz));
    stepOutbreak(outbreak, dt, { running: !sneaking && stamina > 1 && action === 'none' && ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].some(k => keys.has(k)) && (keys.has('ShiftLeft') || keys.has('ShiftRight')), nearbyThreat });
    if (outbreak.hydration <= 0 || outbreak.satiety <= 0) hp = Math.max(0, hp - dt * 1.5);
    if (hp <= 0) { lose('在耗盡補給後倒下。'); return; }
    if (attackHeld || touchActionHeld) { if (touchActionHeld) aimNearest(); if (pistolEquipped && hasPistol) fire(); else if (action === 'none') startSwing(); }
    if (mouseAimActive) { aimRay.setFromCamera(inputAim,camera); if(aimRay.ray.intersectPlane(groundPlane,aimHit)) facing=Math.atan2(aimHit.x-px,aimHit.z+pz); }
    updatePlayer(dt);
    updateZombies(dt);
    if (phase !== 'play') return;
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
    saveTimer += dt; if(saveTimer>=3) {saveTimer=0;persistCampaign();}
    if (mode==='quick' && phase === 'play' && timeLeft <= 0) lose('錯過接應窗口，街區通道已封閉。');
  }

  if (paused || bagOpen || inShelter) updateHud();
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
  const viewSize = viewHeight(a,matchMedia('(any-pointer:coarse)').matches,viewZoom);
  camera.left = -viewSize * a / 2;
  camera.right = viewSize * a / 2;
  camera.top = viewSize / 2;
  camera.bottom = -viewSize / 2;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('wheel', e => {
  e.preventDefault();
  viewZoom = THREE.MathUtils.clamp(viewZoom * (e.deltaY < 0 ? 1.1 : .9), .5, 2.2);
  resize();
}, { passive: false });
resize();

// ---------------------------------------------------------------- 啟動

fetch(dataUrl)
  .then(r => { if (!r.ok) throw new Error(`資料載入失敗 ${r.status}`); return r.json() as Promise<GameBlock>; })
  .then(data => {
    block = data;
    landmarks = data.landmarks ?? [];
    const grid = wallGridOf(data, false);
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
    shelter = selectShelter(data.buildings, data.spawn, collides, insideBuilding);
    scene.add(new THREE.Mesh(
      roofGeometry(data.buildings.filter(b=>b.id!==shelter?.id)),
      new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 1, side: THREE.DoubleSide }),
    ));

    if(shelter) {
      shelterRoof = new THREE.Mesh(roofGeometry(data.buildings.filter(b=>b.id===shelter?.id)),new THREE.MeshStandardMaterial({color:0x9c968a,side:THREE.DoubleSide})); scene.add(shelterRoof);
      const marker=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.4,.25),new THREE.MeshStandardMaterial({color:0x49c8d8,emissive:0x166c7a,emissiveIntensity:.8}));
      marker.position.set(shelter.outside[0],1.2,-shelter.outside[1]); marker.scale.set(.4,1,.4);scene.add(marker);
      const floor=new THREE.Mesh(new THREE.CircleGeometry(2,24),new THREE.MeshStandardMaterial({color:0x9f956d,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.set(shelter.inside[0],.03,-shelter.inside[1]);scene.add(floor);
      for(const [dx,dz,color] of [[.7,0,0x976731],[-.7,0,0x536d67]]){const prop=new THREE.Mesh(new THREE.BoxGeometry(.5,.45,1),new THREE.MeshStandardMaterial({color}));prop.position.set(shelter.inside[0]+dx,.25,-shelter.inside[1]+dz);scene.add(prop);}
    }
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

    evacRing = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 64), new THREE.MeshBasicMaterial({ color: 0x397959, side: THREE.DoubleSide }));
    evacRing.rotation.x = -Math.PI / 2;
    evacRing.position.set(data.spawn[0], 0.06, -data.spawn[1]);
    scene.add(evacRing);
    const helper = new THREE.Mesh(new THREE.CapsuleGeometry(.3,1,4,8), new THREE.MeshStandardMaterial({color:0xe4c47a}));
    helper.position.set(data.spawn[0]+1.4,.8,-data.spawn[1]); scene.add(helper);
    px = data.spawn[0];
    pz = data.spawn[1];
    buildZombies();
    try {savedGame=loadSnapshot(localStorage,saveKey,dataUrl);}catch {saveWarning='瀏覽器封鎖儲存；本局無法持久存檔。';}
    buildMenu();

    if (params.has('debug')) {
      (window as unknown as { __modu: unknown }).__modu = {
        state: () => ({
          phase, hp, battery, stamina, timeLeft, kills, paused, bagOpen, sneaking, looted, outbreak: { ...outbreak },
          zombies: zombies.length, awake: zombies.filter(z => z.state === 'chase').length,
          dead: zombies.filter(z => z.state === 'dead').length,
          factions: Object.fromEntries(['infected','military','police','raider'].map(id => [id,zombies.filter(z => z.faction.id === id).length])),
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
        outbreakTest: (elapsed: number, searched: number, exposure = 0) => { timeLeft = NIGHT_SECONDS - elapsed; looted = searched; outbreak.exposure = exposure; px = block.spawn[0]; pz = block.spawn[1]; updateHud(); },
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
