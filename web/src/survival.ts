import { installStagedCharacterMenu } from './staged-character-menu';
import { gameSettings, t as tr, installGameSettings } from './game-settings';
import { createGameAudio } from './game-audio';
import { planRoomTools, claimRoomTool, type RoomTool } from './room-tools';
import { buildMeleeTool, isMeleeTool, TOOL_COMBAT } from './melee-tools';
import { planRoomExtras, claimRoomExtra, type RoomExtra } from './room-extras';
import { createFacadeSignage } from './facade-signage';
import { planDensityBuildings, densityEnabledForLayout } from './density-plan';
import { planInteriorRooms, roomFurnitureCollision, createInteriorRoomGeometry, type InteriorRoom } from './interior-rooms';
import { createSurvivorSystems, migrateSurvivorSystems, equipHand, carriedWeight, loadEffects, injureBody, stepBody, treatBody } from './survivor-systems';
import { installSurvivorPanel } from './survivor-panel';
import { WEAPONS, WEAPON_IDS, createLegacyArsenal, grantWeapon, grantAmmo, equipWeapon, consumeRound, type Arsenal, type WeaponId } from './arsenal';
import { buildFirearm } from './weapon-visuals';
import { planEncounters } from './encounters';
import { decideEncounterBehavior } from './encounter-behavior';
import { findLocalPath, type LocalWaypoint } from './navigation';
import { createHelperState, exchangeWithHelper, aidHelper, receiveHelperCare } from './helper';
import { createCityVisibility } from './city-visibility';
import { createLilongInterior, createShelterFloor, shelterInspectionPoints } from './shanghai-details';
import { roadGeometries, nearbyRoadName, type StreetRoad } from './road-geometry';
import { viewHeight, roomViewHeight } from './view';
import { daylightProfile } from './daylight';
import { createStreetDetails, applyPavementGrain } from './street-details';
let streetDetails: ReturnType<typeof createStreetDetails>|null=null;
import { emptyInventory, replenishCaches, applyCacheLoot, loadSnapshot, saveSnapshot, transferItem, restAtShelter, dayPhase, type Snapshot } from './campaign';
import { selectShelter, type Shelter } from './shelter';
import { installTouchControls, setTouchControlLabels, setTouchControlsSuspended, requestUnarmedToggle } from './touch-controls';
import { sweepMove, segmentClear } from './combat';
import { MELEE_PROFILES, meleePose, shovePose, sweptMeleeAngle, angleInSweep, type MeleeHand } from './melee-motion';
import { applyMeleePose, applyShovePose, resetRigJoints, applyLocomotionJoints, applyThrowJoints } from './rig-motion';
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
  makeCollider, makeInsideTest,
  sampleOpenSpot, wallGridOf, roofGeometry,
  type Block, type Building,
} from './world';
import { ROSTER, buildRig, buildWeapon, type CharSpec, type Rig } from './characters';

// ---------------------------------------------------------------- 參數

const NIGHT_SECONDS = 480;
let outbreak = createOutbreak();
let mode: 'sandbox' | 'quick' = 'sandbox';
let elapsed = 0;
let inShelter = false;
let shelterLamp: THREE.PointLight | null = null;
let roomFocus:ReadonlyArray<readonly [number,number]>=[];
let shelter: Shelter | null = null;
let facadeSignage:ReturnType<typeof createFacadeSignage>|null=null;
let cityVisibility:ReturnType<typeof createCityVisibility>|null=null;
let visibilityTimer=0;
let stash = emptyInventory();
let restCount = 0;
let saveTimer = 0;
let saveWarning = '';
let savedGame: Snapshot | null = null;
let shelterPanel: HTMLElement;
let helperPanel:HTMLElement;
let helperOpen=false;
let helperState=createHelperState();
let helperActor:THREE.Mesh|null=null;
let sneaking = false;
let paused = false;
let bagOpen = false;
let stagedMenu:ReturnType<typeof installStagedCharacterMenu>|null=null;
let survivorPanel: ReturnType<typeof installSurvivorPanel> | null = null;
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
  ammo: { label: '9毫米補給包', hint: '9毫米手槍彈 +6' },
  pistol: { label: '手槍', hint: '背包裝備後左鍵開槍' },
};
const LOOT_TABLE: [ItemId, number][] = [
  ['water', 28], ['food', 24], ['battery', 22], ['medkit', 10], ['ammo', 10], ['pistol', 6],
];

type Landmark = { x: number; y: number; label: string; cn: string };
type Shop = { x: number; y: number; label: string };
type GameBlock = Block & { landmarks?: Landmark[]; shops?: Shop[]; roads?:StreetRoad[] };

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
// Candidate writes are isolated: old production cannot erase the new extension.
const legacySaveKey = `shanghai-survivors:v1:${dataUrl}`;
const saveKey = `shanghai-survivors:systems-v1:${dataUrl}`;
function loadCandidateSave(): Snapshot | null {
  try { return localStorage.getItem(saveKey) === null ? loadSnapshot(localStorage,legacySaveKey,dataUrl) : loadSnapshot(localStorage,saveKey,dataUrl); } catch { return null; }
}

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
let offhandWeapon: THREE.Group | null = null;
let shootHand: MeleeHand = 'right';
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
  weapon.position.set(0, -spec.height * 0.27 + spec.height * 0.29 * 0.52, 0.03);
  weapon.rotation.x = Math.PI;
  rig.elbowR.add(weapon);

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
  hitReact?:number;hitSide?:number;
  path: LocalWaypoint[]; pathTimer: number; retreat: number; patrolX:number; patrolZ:number; lastX:number; lastZ:number; returning:boolean;
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
      if (faction.id === 'military') { const rifle=buildFirearm(i%12===1?'qbz95-1':'qbz191');rifle.rotation.x=-Math.PI/2;rifle.position.set(.28,.85,.2);built.mesh.add(rifle); }
    }
    zombies.push({
      ...built, faction, warning: 0, x: 0, z: 0, hx: 0, hz: 0, state: 'sleep',
      think: Math.random() * 0.35, attackCd: 0, lose: 0, phase: Math.random() * 6.28,
      walk: 0, wx: 0, wz: 0, hp: 100, flashT: 0,
      path: [], pathTimer: 0, retreat: 0, patrolX:0, patrolZ:0,lastX:0,lastZ:0,returning:false,
    });
  }
}

// ---------------------------------------------------------------- 世界

let block: GameBlock;
let collides: (x: number, z: number, r?: number) => boolean;
let baseWallCollision: typeof collides;
let interiorRooms: InteriorRoom[]=[];
let plannedInteriorRooms: InteriorRoom[]=[];
let worldLayout: Snapshot['worldLayout'];
let densityBuildings: Building[]=[];
let densityVisibility: ReturnType<typeof createCityVisibility>|null=null;
const densityGroup=new THREE.Group();
let densityCollision:typeof collides=()=>false;
let densityInside:(x:number,z:number)=>boolean=()=>false;
let baseInsideBuilding:(x:number,z:number)=>boolean;
const interiorGroups=new Map<string,THREE.Group>();
function configureWorldLayout(layout: Snapshot['worldLayout']) {
  worldLayout=layout;
  densityGroup.visible=densityEnabledForLayout(layout);
  interiorRooms=plannedInteriorRooms.slice(0,layout==='menghua-infill-v1'?9:3);
  const active=new Set(interiorRooms.map(r=>r.id));
  for(const [id,group] of interiorGroups)group.visible=active.has(id);
  for(const c of containers)if(c.roomId)c.roomEnabled=!c.expandedRoom||layout==='menghua-infill-v1';
}
const roomInsideTests=new Map<string,(x:number,z:number)=>boolean>();
function activeInterior(){return interiorRooms.find(r=>roomInsideTests.get(r.id)?.(px,pz));}
let insideBuilding: (x: number, z: number) => boolean;
let landmarks: Landmark[] = [];
let bounds = { minX: 0, maxX: 250, minY: 0, maxY: 250 };
let px = 0, pz = 0, py = 0, vy = 0, facing = 0;
let grounded = true;

type Container = { x: number; z: number; mesh: THREE.Mesh; looted: boolean; cacheKind?: 'water'|'food'|'ammo'; cacheDay?: number; roomId?: string; roomItem?: 'water'|'food'|'battery'|'ammo'|'medkit'; roomLabel?: string; roomExtra?:RoomExtra; roomTool?:RoomTool; roomPosition?: [number,number]; expandedRoom?:boolean; roomEnabled?:boolean };
const roomExtraMaterials={ammo:new THREE.MeshStandardMaterial({color:0x7d8965,roughness:1}),medkit:new THREE.MeshStandardMaterial({color:0xd5cbb8,roughness:1}),food:new THREE.MeshStandardMaterial({color:0xa68a57,roughness:1})};
const CACHE_RULES = {water:{name:'藍色互助水箱',seconds:2.5,noise:30,color:0x45cce3},food:{name:'綠色食物交接箱',seconds:3.5,noise:45,color:0x84c75a},ammo:{name:'紅色封鎖物資箱',seconds:5,noise:70,color:0xe65d4d}};
const cacheMaterials=Object.fromEntries(Object.entries(CACHE_RULES).map(([id,r])=>[id,new THREE.MeshStandardMaterial({color:r.color,emissive:r.color,emissiveIntensity:.8})])) as Record<'water'|'food'|'ammo',THREE.MeshStandardMaterial>;
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
let arsenal:Arsenal=createLegacyArsenal(false,0)!;
let survivorSystems=createSurvivorSystems(arsenal)!;
function syncArsenal(){hasPistol=arsenal.owned.length>0;pistolEquipped=arsenal.equipped!==null;ammo=arsenal.equipped?arsenal.rounds[WEAPONS[arsenal.equipped].calibre]:arsenal.rounds['9mm'];}
function updateWeaponVisual(preserveStance=false){
  if(!preserveStance)unarmedStance=false;
  window.dispatchEvent(new CustomEvent('survivor-unarmed-state',{detail:{enabled:unarmedStance}}));
  if(!rig)return;
  for(const old of [weapon,offhandWeapon])if(old){old.removeFromParent();old.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});}
  const attach=(id:WeaponId|'pipe'|'cleaver'|'wrench',hand:MeleeHand)=>{
    const model=id==='pipe'?buildWeapon('pipe'):isMeleeTool(id)?buildMeleeTool(id):buildFirearm(id);
    if(id==='pipe'||isMeleeTool(id))model.rotation.x=Math.PI;
    model.position.set(0,-spec.height*.27+spec.height*.29*.52,.03);
    (hand==='right'?rig!.elbowR:rig!.elbowL).add(model);return model;
  };
  if(unarmedStance){weapon=null;offhandWeapon=null;return;}
  weapon=attach(survivorSystems.hands.primary,'right');
  offhandWeapon=survivorSystems.hands.secondary?attach(survivorSystems.hands.secondary,'left'):null;
}

let runNoiseTimer = 0, lootNoiseTimer = 0;
let lootTarget: Container | null = null;
let lootProgress = 0;
let walkPhase = 0;
let action: 'none' | 'swing' | 'shove' | 'throw' | 'shoot' | 'loot' = 'none';
let actionT = 0, actionDur = 0, actionFired = false;
let swingCount = 0;
let swingHand: MeleeHand = 'right';
let swingTool:'pipe'|'cleaver'|'wrench'|'unarmed'='pipe';
// Session-only posture: never changes hand ownership, ammunition or saved equipment.
let unarmedStance=false;
let shoveFacing=0;
function setUnarmedStance(enabled:boolean){
  if(phase!=='play'||paused||bagOpen||inShelter||helperOpen||action!=='none')return;
  unarmedStance=enabled; bufferedHand=null; comboWindow=0; updateWeaponVisual(true);
  flashHint(enabled?'徒手：左鍵/J 右拳，R 左拳，Q 推開撤步':'已恢復原有持械');
}
window.addEventListener('survivor-unarmed',e=>setUnarmedStance((e as CustomEvent).detail?.enabled??!unarmedStance));
const announceMelee=()=>window.dispatchEvent(new CustomEvent('survivor-melee-capabilities',{detail:{unarmed:true,shove:true}}));
window.addEventListener('survivor-melee-query',announceMelee);queueMicrotask(announceMelee);
window.addEventListener('survivor-shove',()=>{if(phase==='play'&&!paused&&!bagOpen&&!inShelter&&!helperOpen)shove();});
function currentSwingProfile(){return swingTool==='unarmed'?{kind:'unarmed' as const,damage:16,reach:1.05,knockback:.45}:swingTool==='pipe'?{kind:'blunt' as const,damage:45,reach:1.8,knockback:1.6}:TOOL_COMBAT[swingTool];}
let swingStroke = 0, comboWindow = 0, impactPause = 0;
let bufferedHand: MeleeHand | null = null;
// A single committed swing may overlap several frames and several enemies.
const swingHits = new Set<Zombie>();
let muzzle: THREE.PointLight | null = null;
let muzzleT = 0;
const inventory: Record<ItemId, number> = { water: 1, food: 1, medkit: 0, battery: 0, ammo: 0, pistol: 0 };

// ---------------------------------------------------------------- 音源

function makeNoise(x: number, z: number, radius: number) {
  for (const zb of zombies) {
    if (zb.state === 'chase' || zb.state === 'dead') continue;
    if (Math.hypot(zb.x - x, zb.z - z) < radius) wake(zb,x,z);
  }
}
function wake(zb: Zombie, targetX=px, targetZ=pz) {
  if (zb.state === 'dead' || zb.retreat>0 || zb.returning) return;
  zb.state = 'chase';
  zb.pathTimer=0;zb.lastX=targetX;zb.lastZ=targetZ;
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
  if(settingsMenu.isOpen()||phase!=='play')return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (phase !== 'play') return;
  if(helperOpen){if(e.code==='Escape')closeHelper();return;}
  if(inShelter) { if(e.code==='Escape')leaveShelter(); return; }
  if (e.code === 'Escape') { if (bagOpen) toggleBag(false); else settingsMenu.open(); return; }
  if (e.code === 'Tab' || e.code === 'KeyI') { toggleBag(!bagOpen); return; }
  if (paused || bagOpen || inShelter) return;
  keys.add(e.code);
  if (e.code === 'KeyE') contextualInteract();
  if (e.code === 'KeyX') requestUnarmedToggle();
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
  if (e.code === 'KeyR') dispatchHandAttack('secondary');
});
addEventListener('keyup', e => keys.delete(e.code));
function releaseGameplayInput() {
  keys.clear(); attackHeld = false; touchActionHeld = false;
  bufferedHand = null; comboWindow = 0; impactPause = 0;
  if (action === 'loot') { action = 'none'; lootProgress = 0; setRing(0); }
  else if (action !== 'none') { action = 'none'; actionT = 0; actionFired = false; swingHits.clear(); }
}
addEventListener('blur', releaseGameplayInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseGameplayInput(); });
function toggleBag(open: boolean) {
  bagOpen = open;
  releaseGameplayInput();
  el.side.classList.remove('bag-open');
  survivorPanel?.[open ? 'open' : 'close']();
  el.side.setAttribute('aria-label', open ? '背包，點選物品使用；Esc關閉' : '背包');
}
function contextualInteract(): boolean {
  if (phase !== 'play' || paused || bagOpen || inShelter || helperOpen) return false;
  if (mode === 'sandbox' && shelter && Math.hypot(px-shelter.outside[0],pz-shelter.outside[1]) < 2.5 && canSee(px,pz,...shelter.outside)) { enterShelter(); return true; }
  if (lootTarget) return true;
  if (Math.hypot(px - block.spawn[0], pz - block.spawn[1]) > 5) return false;
  if(mode==='sandbox'){openHelper();return true;}
  if (mode === 'quick' && NIGHT_SECONDS - timeLeft >= 420) {
    if (canEvacuate(outbreak, NIGHT_SECONDS - timeLeft, looted, Math.hypot(px-block.spawn[0],pz-block.spawn[1]))) win();
    else flashHint('接應需搜刮3處、暴露低於85且窗口未關閉。');
  } else if (inventory.food > 0) { inventory.food--; inventory.water++; updateBag(); persistCampaign(); flashHint('互助者：罐頭換飲水，保重。'); }
  else flashHint('互助者：帶一份罐頭來換水。最後一分鐘在這裡接應。');
  return true;
}
function shove() {
  if (stamina < 10 || action !== 'none') return;
  stamina -= 10;action='shove';actionT=0;actionDur=.46;actionFired=false;
  shoveFacing=facing;bufferedHand=null;comboWindow=0;
}
function applyShoveImpact() {
  for (const z of zombies) {
    const dx=z.x-px,dz=z.z-pz,d=Math.hypot(dx,dz);
    if(z.state==='dead'||d>2||d<.01||!angleInSweep(Math.atan2(dx,-dz)-shoveFacing,-.8,.8,.1)||!canSee(px,pz,z.x,z.z))continue;
    const moved=sweepMove(z.x,z.z,dx/d*.7,dz/d*.7,.34,collides);
    z.x=moved.x;z.z=moved.z;z.attackCd=Math.max(z.attackCd,1.5);z.warning=0;
    z.hitReact=.24;z.hitSide=Math.sin(Math.atan2(dx,-dz)-z.mesh.rotation.y);
  }
  makeNoise(px,pz,8);
}
function aimNearest() {
  let nearest: Zombie | undefined; let distance=25;
  for (const z of zombies) { const d=Math.hypot(z.x-px,z.z-pz); if(z.state !== 'dead' && d<distance && canSee(px,pz,z.x,z.z)) {nearest=z;distance=d;} }
  if (nearest) facing=Math.atan2(nearest.x-px,-(nearest.z-pz));
}
canvas.addEventListener('pointermove',e=>{
  if (e.pointerType !== 'mouse' || phase !== 'play' || paused || bagOpen || helperOpen || action !== 'none') return;
  mouseAimActive = true;
  inputAim.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
  aimRay.setFromCamera(inputAim,camera);
  if (aimRay.ray.intersectPlane(groundPlane,aimHit)) facing=Math.atan2(aimHit.x-px,aimHit.z+pz);
});
canvas.addEventListener('pointerdown',e=>{ if(e.pointerType === 'mouse' && e.button===0 && phase==='play' && !paused && !bagOpen && !helperOpen) { attackHeld=true; dispatchHandAttack('primary'); } });
addEventListener('pointerup',e=>{if(e.pointerType==='mouse' && e.button===0) attackHeld=false;});
addEventListener('pointercancel',releaseGameplayInput);
addEventListener('survivor-action',e=>{
  const start=(e as CustomEvent).detail.phase==='start';
  if (!start) {touchActionHeld=false;keys.delete('KeyE');return;}
  if (phase !== 'play' || paused || bagOpen || helperOpen) return;
  if (contextualInteract()) keys.add('KeyE');
  else {touchActionHeld=true;aimNearest();dispatchHandAttack('primary');}
});
installTouchControls();
const gameAudio=createGameAudio();
const settingsMenu=installGameSettings({
  canOpen:()=>(phase==='play'&&!helperOpen&&!inShelter)||phase==='menu',
  open:()=>{setTouchControlsSuspended(true);toggleBag(false);paused=true;clearControlState();releaseGameplayInput();gameAudio.setActive(false);},
  resume:()=>{clearControlState();releaseGameplayInput();setTouchControlsSuspended(false);paused=false;},
  saveReturn:()=>{persistCampaign();if(mode==='sandbox'&&saveWarning)return false;clearControlState();location.reload();return true;},
  audioPreview:()=>gameAudio.play('preview'),
});
let audioLastSwing=0,audioLastLoot=0,audioStepTimer=0;
function refreshInterfaceLanguage(){
  document.documentElement.lang=gameSettings.language;
  setTouchControlLabels({unarmed:tr('徒手','徒手','Fists'),shove:tr('推開','推开','Shove'),controls:tr('觸控操作','触控操作','Touch controls'),movement:tr('移動搖桿，推到底奔跑','移动摇杆，推到底奔跑','Move joystick; push fully to run'),movementHint:tr('移動 · 推到底奔跑','移动 · 推到底奔跑','Move · push fully to run'),action:tr('互動','互动','Use'),actionAria:tr('情境互動，按住持續','情境互动，按住持续','Context action; hold to continue'),secondary:tr('副手','副手','Offhand'),secondaryAria:tr('副手攻擊','副手攻击','Offhand attack'),crouch:tr('蹲','蹲','Sneak'),crouchAria:tr('切換潛行','切换潜行','Toggle sneaking'),menuAria:tr('暫停選單','暂停菜单','Pause menu'),bag:tr('背包','背包','Bag')});
  const sta=document.querySelector('#bar-sta .k'),bat=document.querySelector('#bar-bat .k');
  if(sta)sta.textContent=tr('體力','体力','STA');if(bat)bat.textContent=tr('電量','电量','PWR');
  el.hint.textContent=tr('WASD 移動 · Shift 跑 · C 潛行 · 左鍵攻擊 · E 互動 · Tab 背包 · Esc 選單','WASD 移动 · Shift 跑 · C 潜行 · 左键攻击 · E 互动 · Tab 背包 · Esc 菜单','WASD move · Shift run · C sneak · Click attack · E interact · Tab bag · Esc menu');
  settingsMenu.refresh();
}
refreshInterfaceLanguage();window.addEventListener('shanghai-language-change',refreshInterfaceLanguage);



// ---------------------------------------------------------------- 動作

function dispatchHandAttack(slot:'primary'|'secondary') {
  if(phase!=='play'||paused||bagOpen||inShelter||helperOpen)return;
  const item=unarmedStance?null:survivorSystems.hands[slot],hand=slot==='primary'?'right':'left';
  if(action!=='none' && !(action==='swing' && (item===null||item==='pipe'||isMeleeTool(item)) && actionT/actionDur>=.62))return;
  if(item===null||item==='pipe'||isMeleeTool(item))startSwing(hand);else if(item)fire(item,hand);
}

function startSwing(hand: MeleeHand = 'right') {
  const heldItem=unarmedStance?null:survivorSystems.hands[hand==='left'?'secondary':'primary'];
  if(heldItem!==null&&heldItem!=='pipe'&&!isMeleeTool(heldItem))return;
  // A rifle occupies both hands; an empty support slot is not a free attacking hand.
  if(!unarmedStance&&hand==='left'&&arsenal.equipped&&WEAPONS[arsenal.equipped].category==='rifle')return;
  const profile = MELEE_PROFILES[heldItem===null?'unarmed':heldItem==='pipe'?'blunt':TOOL_COMBAT[heldItem].kind];
  // One explicit late press is buffered; never accumulate an unbounded queue.
  if (action === 'swing' && actionT / actionDur >= 0.62 && (heldItem===null||heldItem==='pipe'||isMeleeTool(heldItem))) { bufferedHand = hand; return; }
  if (action !== 'none' || stamina < profile.stamina) return;
  action = 'swing'; actionT = 0; actionDur = profile.duration; actionFired = false;
  swingStroke = comboWindow > 0 && swingHand === hand ? 1 - swingStroke : 0;
  comboWindow = 0; bufferedHand = null;
  swingHand = hand; swingTool=heldItem??'unarmed';
  swingCount++;
  swingHits.clear();
  stamina = Math.max(0, stamina - profile.stamina);
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

function meleeHit(from: number, to: number) {
  for (const zb of zombies) {
    if (zb.state === 'dead' || swingHits.has(zb)) continue;
    const dx = zb.x - px, dz = zb.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > currentSwingProfile().reach || d < 0.01) continue;
    const bearing = Math.atan2(dx, -dz) - facing;
    const tolerance = Math.asin(Math.min(1, 0.34 / d));
    if (!angleInSweep(bearing, from, to, tolerance) || !canSee(px, pz, zb.x, zb.z)) continue;
    swingHits.add(zb);
    damageZombie(zb, currentSwingProfile().damage, dx / d, dz / d, currentSwingProfile().knockback);
    zb.attackCd = Math.max(zb.attackCd, 0.5);
    camShake = Math.max(camShake, 0.22);
    impactPause = Math.max(impactPause, 0.035);
    zb.warning = 0;
    zb.hitReact=.24;zb.hitSide=Math.sin(Math.atan2(dx,-dz)-zb.mesh.rotation.y);
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

function fire(id: WeaponId | null = arsenal.equipped, hand: MeleeHand = 'right') {
  if (!id || !arsenal.owned.includes(id) || action !== 'none') return;
  const gun=WEAPONS[id];
  if(!consumeRound({...arsenal,equipped:id}))return;syncArsenal();
  shootHand=hand;
  action = 'shoot'; actionT = 0; actionDur = gun.cooldown; actionFired = true;
  muzzleT = 0.07;
  camShake = Math.max(camShake, 0.7);
  makeNoise(px, pz, HEAR_GUN);
  const f = forwardXZ();
  if (muzzle) {
    muzzle.position.set(px + f.x * 0.8, py + 1.35, -(pz + f.z * 0.8));
    muzzle.visible = true;
  }
  let best: Zombie | null = null;
  let bestD = gun.range;
  for (const zb of zombies) {
    if (zb.state === 'dead') continue;
    const dx = zb.x - px, dz = zb.z - pz;
    const along = dx * f.x + dz * f.z;
    if (along < 0.5 || along > bestD) continue;
    const perp = Math.abs(dx * f.z - dz * f.x);
    if (perp > 0.85 || !canSee(px,pz,zb.x,zb.z)) continue;
    best = zb; bestD = along;
  }
  if (best) damageZombie(best, gun.damage, f.x, f.z, gun.category==='rifle'?2.5:1.8);
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
  wake(zb,zb.x-nx,zb.z-nz); // React toward the impact direction, not an unseen player.
  const pushed = sweepMove(zb.x, zb.z, nx * knock * 0.4, nz * knock * 0.4, 0.34, collides);
  zb.x = pushed.x;
  zb.z = pushed.z;
}

function useItem(id: ItemId) {
  if (phase !== 'play' || paused || helperOpen || inventory[id] <= 0 || id==='pistol') return;
  if(id==='ammo'&&!grantAmmo(arsenal,'9mm',6)){flashHint('9毫米彈藥已滿，補給包保留。');return;}
  inventory[id] -= 1;
  if (id === 'water' || id === 'food' || id === 'medkit') applySupply(outbreak, id);
  if (id === 'water') { stamina = Math.min(100, stamina + 35); flashHint('喝水補充水分，體力回復。'); }
  if (id === 'food') { hp = Math.min(100, hp + 14); flashHint('吃了罐頭，補充飽足，HP +14。'); }
  if (id === 'medkit') { treatBody(survivorSystems.condition,'medkit'); hp = Math.min(100, hp + 45); flashHint('處置傷口，暴露壓力降低，HP +45（虛構機制）。'); }
  if (id === 'battery') { battery = Math.min(100, battery + BATTERY_PICKUP); flashHint(`換了電池，電量 ${Math.round(battery)}%。`); }
  if (id === 'ammo') { syncArsenal();flashHint('9毫米手槍彈 +6（不可用於步槍）。'); }
  updateBag();persistCampaign();
}

let hintTimer = 0;
function flashHint(text: string) {
  el.hint.textContent = text;
  hintTimer = 2.4;
}
const HINT_DEFAULT = 'WASD 移動 · Shift 跑 · C 潛行 · 左鍵攻擊 · Q 推開撤步 · X 徒手/持械 · E 互動 · R 副手 · Tab 背包 · F 燈 · Esc 暫停';

// ---------------------------------------------------------------- 更新

function updatePlayer(dt: number) {
  const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const fwd = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const moving = right !== 0 || fwd !== 0;
  const wantRun = !sneaking && moving && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && stamina > 1 && action === 'none';
  const speed = (wantRun ? RUN_SPEED : sneaking ? WALK_SPEED * 0.5 : WALK_SPEED) * (outbreak.hydration < 20 ? 0.75 : 1) * loadEffects(carriedWeight(inventory,arsenal,survivorSystems)).speedMultiplier;

  let movedSpeed = 0;
  // Committed facing is retained, but a short controlled combat step prevents
  // each swing from turning the whole body into a stationary statue.
  if (moving && (action === 'none' || action === 'swing')) {
    const stepSpeed = speed * (action === 'swing' ? .38 : 1);
    const len = Math.hypot(right + fwd, right - fwd);
    const dx = (right - fwd) / len;
    const dz = (right + fwd) / len;
    const oldX = px, oldZ = pz;
    const moveCollider=(x:number,z:number,r:number)=>x<bounds.minX-8||x>bounds.maxX+8||z<bounds.minY-8||z>bounds.maxY+8||collides(x,z,r);
    // Keep axis sliding but sweep every segment, including a low-FPS combat step.
    px=sweepMove(px,pz,dx*stepSpeed*dt,0,.36,moveCollider).x;
    pz=sweepMove(px,pz,0,dz*stepSpeed*dt,.36,moveCollider).z;
    // Model faces +Z, and world z is -data y.
    if (action === 'none' && !mouseAimActive && !touchActionHeld) facing = Math.atan2(dx, -dz);
    movedSpeed = dt > 0 ? Math.hypot(px - oldX, pz - oldZ) / dt : 0;
    walkPhase += dt * movedSpeed * 2.5;
  }

  stamina = wantRun
    ? Math.max(0, stamina - 22 * dt * loadEffects(carriedWeight(inventory,arsenal,survivorSystems)).staminaMultiplier)
    : (action === 'swing'||action==='shove') ? stamina : Math.min(100, stamina + 14 * dt);

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
  if(playerRoot)playerRoot.position.set(px,py,-pz);
}

let visualMove = 0, breathPhase = 0;
function animateRig(dt: number, speed: number) {
  if (!rig) return;
  const { legL, legR, armL, armR, torso } = rig;
  comboWindow = Math.max(0, comboWindow - dt);
  resetRigJoints(rig);
  const targetMove = Math.min(1, speed / RUN_SPEED);
  visualMove += (targetMove - visualMove) * (1 - Math.exp(-14 * dt));
  breathPhase += dt * 1.8;
  const moving = visualMove > .008;
  const amp = visualMove;
  const gaitWeight = Math.min(1, visualMove / .18);

  const swingAmt = moving ? Math.sin(walkPhase) * (0.42 + amp * 0.55) * gaitWeight : 0;
  legL.rotation.x = swingAmt;
  legR.rotation.x = -swingAmt;
  armL.rotation.x = moving ? -swingAmt * 0.75 : -0.12;
  armR.rotation.x = moving ? swingAmt * 0.55 : -0.12;
  armL.rotation.z = -0.05;
  armR.rotation.z = 0.05;
  torso.rotation.set(.12 * amp + Math.sin(breathPhase) * .012,
    Math.sin(walkPhase) * .065 * gaitWeight, Math.sin(walkPhase) * .025 * gaitWeight);
  rig.body.position.y = Math.cos(walkPhase * 2) * .018 * gaitWeight;
  rig.body.position.x = Math.sin(walkPhase) * .012 * gaitWeight;

  if(!unarmedStance&&arsenal.equipped){armR.rotation.set(-Math.PI/2,0,0);armL.rotation.x=WEAPONS[arsenal.equipped].category==='rifle'?-1.1:-.2;}
  if(!unarmedStance&&survivorSystems.hands.secondary==='qsz92-9')armL.rotation.set(-Math.PI/2,0,0);
  if (!grounded) {
    legL.rotation.x = -0.55; legR.rotation.x = 0.35;
    armL.rotation.x = -0.8; armR.rotation.x = -0.6;
    torso.rotation.x = 0.12;
  }
  applyLocomotionJoints(rig, walkPhase, moving, grounded);
  if (grounded) {
    rig.kneeL.rotation.x *= gaitWeight; rig.kneeR.rotation.x *= gaitWeight;
    rig.elbowL.rotation.x *= gaitWeight; rig.elbowR.rotation.x *= gaitWeight;
  }
  if (!unarmedStance&&arsenal.equipped) rig.elbowR.rotation.x = 0;
  if(!unarmedStance&&survivorSystems.hands.secondary==='qsz92-9')rig.elbowL.rotation.x=0;

  if (action !== 'none') {
    const previousT = actionT;
    const held = action === 'swing' ? Math.min(dt, impactPause) : 0;
    impactPause = Math.max(0, impactPause - dt);
    actionT += dt - held;
    const t = Math.min(1, actionT / actionDur);
    if (action === 'swing') {
      applyMeleePose(rig, meleePose(currentSwingProfile().kind, t, swingHand, swingStroke), swingHand);
      const swept = sweptMeleeAngle(currentSwingProfile().kind, previousT / actionDur, t, swingHand, swingStroke);
      if (swept) meleeHit(swept.from, swept.to);
    } else if(action==='shove'){
      applyShovePose(rig,shovePose(t));
      if(!actionFired&&t>=.22){actionFired=true;applyShoveImpact();}
      const retreat=(q:number)=>Math.max(0,Math.min(1,(q-.35)/.65));
      const distance=.45*(retreat(t)-retreat(previousT/actionDur));
      if(distance>0){const moved=sweepMove(px,pz,-Math.sin(shoveFacing)*distance,Math.cos(shoveFacing)*distance,.36,(x,z,r)=>x<bounds.minX-8||x>bounds.maxX+8||z<bounds.minY-8||z>bounds.maxY+8||collides(x,z,r));px=moved.x;pz=moved.z;}
    } else if(action==='shoot'){
      (shootHand==='right'?armR:armL).rotation.set(-Math.PI/2-.09*Math.sin(t*Math.PI),0,0);
      torso.rotation.y=0;torso.rotation.x=0;
    } else if (action === 'throw') {
      const k = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
      armR.rotation.x = -1.6 * k;
      armR.rotation.z = -0.3 * k;
      torso.rotation.y = 0.35 * k;
      applyThrowJoints(rig, t);
      if (actionFired) { armR.rotation.x = -0.9; }
      if (!actionFired && t >= 0.45) { actionFired = true; throwBrick(); }
    } else if (action === 'loot') {
      torso.rotation.x = 0.55;
      armR.rotation.x = 1.15;
      armL.rotation.x = 1.0;
      legL.rotation.x = -0.25; legR.rotation.x = 0.2;
    }
    if (actionT >= actionDur) {
      if (action === 'swing') comboWindow = 0.32;
      const nextHand = bufferedHand; bufferedHand = null;
      action = 'none'; actionT = 0; actionFired = false;
      torso.rotation.y = 0;
      if (nextHand) startSwing(nextHand);
    }
  }
}

// At most two bounded searches per frame; movement always sweeps real collision.
let navigationBudget = 0;
function steerEnemy(zb:Zombie, tx:number, tz:number, speed:number, dt:number) {
  if(zb.pathTimer<=0 && navigationBudget>0){
    navigationBudget--;
    zb.path=findLocalPath(zb.x,zb.z,tx,tz,collides,350);
    zb.pathTimer=1.1+(zb.phase%0.5);
  }
  while(zb.path.length && Math.hypot(zb.path[0].x-zb.x,zb.path[0].z-zb.z)<.25)zb.path.shift();
  const target=zb.path[0];
  if(!target)return;
  const dx=target.x-zb.x,dz=target.z-zb.z,d=Math.hypot(dx,dz);
  if(d<.001)return;
  const step=Math.min(speed*dt,d);
  const moved=sweepMove(zb.x,zb.z,dx/d*step,dz/d*step,.34,collides);
  zb.walk+=Math.hypot(moved.x-zb.x,moved.z-zb.z)*4;
  if(Math.hypot(moved.x-zb.x,moved.z-zb.z)>.001)zb.mesh.rotation.y=Math.atan2(moved.x-zb.x,-(moved.z-zb.z));
  zb.x=moved.x;zb.z=moved.z;
  if(moved.blocked){zb.path=[];zb.pathTimer=0;}
}
function updateZombies(dt: number) {
  navigationBudget=2;
  for (const zb of zombies) {
    if (zb.state === 'dead') continue;
    zb.pathTimer=Math.max(0,zb.pathTimer-dt);
    zb.retreat=Math.max(0,zb.retreat-dt);
    zb.flashT = Math.max(0, zb.flashT - dt);
    // Contact-only transient recoil. No RNG or save fields; the footprint remains collidable.
    zb.hitReact=Math.max(0,(zb.hitReact??0)-dt);
    const recoil=Math.sin(Math.PI*zb.hitReact/.24);
    zb.mesh.rotation.x=-Math.sin(Math.PI*zb.flashT/.12)*.22-recoil*.2;
    zb.mesh.rotation.z=recoil*(zb.hitSide??0)*.16;
    (zb.mesh.material as THREE.MeshStandardMaterial).color.setHex(zb.flashT > 0 ? 0xa33a2a : zb.faction.color);

    zb.chest.rotation.x=.1;
    if(zb.hitReact>0){zb.mesh.position.set(zb.x,0,-zb.z);zb.chest.rotation.x=-recoil*.28;continue;}
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
      const visible=dist<=44 && canSee(zb.x,zb.z,px,pz);
      if(visible){zb.lastX=px;zb.lastZ=pz;zb.mesh.rotation.y=Math.atan2(dx,-dz);}
      const decision=decideEncounterBehavior({faction:zb.faction.id,distance:dist,
        homeDistance:Math.hypot(zb.x-zb.hx,zb.z-zb.hz),visible,
        lostSeconds:zb.lose,carryingStolenItem:zb.retreat>0,dt});
      zb.lose=decision.lostSeconds;
      if(decision.action!=='chase'){
        zb.state='wander';zb.returning=true;zb.wx=zb.hx;zb.wz=zb.hz;zb.path=[];zb.pathTimer=0;
        zb.retreat=Math.max(zb.retreat,4);zb.warning=0;
        continue;
      }

      if (!visible || dist > zb.faction.range * 0.8) {
        steerEnemy(zb,zb.lastX,zb.lastZ,zb.faction.speed,dt);
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
        injureBody(survivorSystems.condition,zb.faction.damage);
        if (zb.faction.id === 'raider' && inventory.water > 0) { inventory.water--;zb.retreat=12; updateBag(); flashHint('掠奪者搶走了一瓶水，正向據點撤退！'); }
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
        if(Math.hypot(zb.x-zb.hx,zb.z-zb.hz)<1)zb.returning=false;
        if(zb.faction.id==='military'||zb.faction.id==='police') {
          const atHome=Math.hypot(zb.x-zb.hx,zb.z-zb.hz)<1;
          zb.wx=atHome?zb.patrolX:zb.hx;zb.wz=atHome?zb.patrolZ:zb.hz;
        } else { zb.wx=zb.hx;zb.wz=zb.hz; }
        zb.pathTimer=0;
      } else {
        if(dist<80)steerEnemy(zb,zb.wx,zb.wz,zb.faction.id==='infected'?ZOMBIE_WANDER:zb.faction.speed*.7,dt);
      }
      if (zb.retreat<=0 && dist < (lightOn?SENSE_LIGHT:SENSE_DARK)*(sneaking?.6:1) && canSee(zb.x, zb.z, px, pz)) wake(zb);
    }

    zb.mesh.position.set(zb.x, 0, -zb.z);
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
    if (c.looted || c.roomEnabled===false) continue;
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
  const rule=lootTarget.cacheKind?CACHE_RULES[lootTarget.cacheKind]:null;
  el.promptText.textContent=lootTarget.roomId?`${lootTarget.roomLabel}｜按住 E 搜刮一次`:rule?`${rule.name}｜按住${rule.seconds}秒，聲響${rule.noise}m`:'按住 E 搜刮';
  const holding = keys.has('KeyE');
  if (holding) {
    if (action !== 'loot') { action = 'loot'; actionT = 0; actionDur = 1e9; }
    lootProgress += dt / (rule?.seconds??LOOT_SECONDS);
    lootNoiseTimer -= dt;
    if (lootNoiseTimer <= 0) { lootNoiseTimer = 0.7; makeNoise(px, pz, rule?.noise??HEAR_LOOT); }
    setRing(lootProgress);

    if (lootProgress >= 1) {
      if(lootTarget.roomTool){
        if(!claimRoomTool(survivorSystems,arsenal,lootTarget.roomTool,lootTarget.looted)){flashHint('這件工具已擁有，留在原處。');lootProgress=0;return;}
        lootTarget.looted=true;flashHint(`取得${TOOL_COMBAT[lootTarget.roomTool.tool].name}，在背包選擇主手或副手裝備。`);
      } else if(lootTarget.roomExtra){
        const claimed=Object.fromEntries(containers.filter(c=>c.roomId&&c.roomEnabled!==false).map(c=>[c.roomId!,c.looted]));
        const result=claimRoomExtra(claimed,inventory,lootTarget.roomExtra);
        if(result!=='claimed'){flashHint(result==='full'?'背包已滿，物資保留。':'這處物資無法領取。');lootProgress=0;return;}
        lootTarget.looted=true;flashHint(`${lootTarget.roomLabel}：取得${ITEMS[lootTarget.roomExtra.item].label}，可在背包使用。`);
      } else if(lootTarget.roomId&&lootTarget.roomItem){
        const item=lootTarget.roomItem;if(inventory[item]>=999){flashHint('背包已滿，物資保留。');lootProgress=0;return;}
        inventory[item]+=1;lootTarget.looted=true;flashHint(`${lootTarget.roomLabel}：找到${ITEMS[item].label}。這處物資已取走。`);
      } else if(lootTarget.cacheKind) {
        const kind=lootTarget.cacheKind;
        if(!applyCacheLoot(inventory,lootTarget)){flashHint('背包數量已滿，未領走補給。');lootProgress=0;return;}
        flashHint(`${CACHE_RULES[kind].name}：取得${kind==='ammo'?'1盒彈藥':'2份'+ITEMS[kind].label}。此點今天已領完。`);
      } else {
        const item=rollLoot();
        if(item==='pistol'){
          const id=WEAPON_IDS[Math.floor(Math.random()*WEAPON_IDS.length)];
          if(!grantWeapon(arsenal,id)){flashHint('彈藥容量已滿，箱子保留。');lootProgress=0;return;}
          syncArsenal();flashHint(`找到 ${WEAPONS[id].name} 與同口徑6發；背包選擇裝備。`);
        } else if(item==='ammo'){
          const calibre=Math.random()<.5?'9mm':'5.8-rifle';
          if(!grantAmmo(arsenal,calibre,6)){flashHint('此口徑彈藥容量已滿，箱子保留。');lootProgress=0;return;}
          syncArsenal();flashHint(`找到 ${calibre==='9mm'?'9毫米手槍':'5.8毫米步槍'}彈6發；口徑不通用。`);
        } else {inventory[item]+=1;flashHint(`撿到 ${ITEMS[item].label}（${ITEMS[item].hint}）`);}
        lootTarget.looted=true;
      }
      paintContainer(lootTarget);
      looted += 1;
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
  const room=activeInterior();if(room){el.place.textContent=`${room.label} · 可步行探索 / 按住 E 搜刮`;el.place.classList.add('on');return;}
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
    const street=nearbyRoadName(block.roads??[],px,pz);
    el.place.textContent=street?`${street} · OSM街道`:'';
    el.place.classList.toggle('on',!!street);
  }
}

function updateHud() {
  const elapsed = mode === 'quick' ? NIGHT_SECONDS - timeLeft : campaignElapsed();
  const distance = Math.hypot(px - block.spawn[0], pz - block.spawn[1]);
  const touchButton = document.querySelector<HTMLElement>('#survivor-touch-action');
  const secondaryButton=document.querySelector<HTMLButtonElement>('#survivor-touch-secondary');
  if(secondaryButton){secondaryButton.hidden=!unarmedStance&&!survivorSystems.hands.secondary&&!!arsenal.equipped&&WEAPONS[arsenal.equipped].category==='rifle';secondaryButton.disabled=paused||bagOpen||inShelter||helperOpen;}
  if(touchButton) touchButton.textContent = mode==='sandbox' && shelter && Math.hypot(px-shelter.outside[0],pz-shelter.outside[1])<2.5 ? tr('家','家','Home') : lootTarget ? tr('搜','搜','Loot') : distance <= 5 ? (mode==='quick' && elapsed >= 420 ? tr('撤','撤','Evac') : mode==='sandbox'?tr('談','谈','Talk'):tr('換','换','Trade')) : tr('打','打','Hit');
  needs.textContent = `${tr('水分','水分','Water')} ${Math.round(outbreak.hydration)} · ${tr('飽足','饱足','Food')} ${Math.round(outbreak.satiety)} · ${tr('暴露','暴露','Exposure')} ${Math.round(outbreak.exposure)}${sneaking ? tr(' · 潛行',' · 潜行',' · Sneaking') : ''}`;
  mission.textContent = bagOpen ? '背包已開啟（暫停）｜點物品使用，Tab / Esc 返回' : paused ? tr('已暫停｜Esc 選單','已暂停｜Esc 菜单','Paused | Esc menu') : `接應點 ${Math.round(distance)}m · 搜刮 ${Math.min(looted, 3)}/3 · ${elapsed >= 480 ? '窗口已關閉' : elapsed >= 420 ? '窗口開啟，回綠圈按 E' : `接應倒數 ${Math.ceil(420 - elapsed)} 秒`} · 暴露須低於85`;
  if(mode==='sandbox') {
    const day=dayPhase(elapsed);
    mission.textContent = helperOpen ? '阿梅・互助站｜對話暫停，Esc 或按鈕離開' : inShelter ? '安全屋｜存放物資、休息或返回街區' : bagOpen ? '背包（暫停）｜點擊使用／裝備' : paused ? tr('已暫停｜Esc 選單','已暂停｜Esc 菜单','Paused | Esc menu') : `第 ${day.day} 天 · 安全屋 ${shelter ? Math.round(Math.hypot(px-shelter.outside[0],pz-shelter.outside[1])) : '?'}m · 已搜 ${looted}次 · ${nearestSupplyHint()}`;
    radio.textContent = saveWarning || (inShelter ? '休息花費庫存1水＋1罐頭，時間推進2分鐘。物資有限，不會重生。' : day.daylight<.25 ? '夜間感染者更敏銳。慢行、關燈；帶回一水一食便能在家休息。' : '互助台：藍門回家；水／食／封鎖物資箱每日交接一次，普通搜刮點不重生。紅箱聲響最遠。');
  } else radio.textContent = [...BROADCASTS].reverse().find(([at]) => elapsed >= at)?.[1] ?? '';
  radio.classList.toggle('critical', Boolean(saveWarning));
  if (evacRing) (evacRing.material as THREE.MeshBasicMaterial).color.setHex(elapsed >= 420 && elapsed < 480 ? 0x9fffc2 : 0x397959);
  const t = mode==='sandbox' ? (dayPhase(elapsed).hour-2)/3 : 1 - Math.max(0, timeLeft) / NIGHT_SECONDS;
  const minutes = 120 + t * 180;
  const hh = Math.floor(minutes / 60);
  const mm = Math.floor(minutes % 60);
  el.clock.textContent = `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2, '0')}`;
  el.nightFill.style.width = `${mode==='sandbox'?dayPhase(elapsed).hour/24*100:Math.min(100,t*100)}%`;
  el.phase.textContent = mode==='sandbox' ? `${daylightProfile(dayPhase(elapsed).hour).stage} · 第${dayPhase(elapsed).day}天` : t > 0.82 ? 'dawn' : 'night';

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
  if(survivorSystems.condition.bleeding>0)list.push([`流血 ${Math.ceil(survivorSystems.condition.bleeding)}`,'bad']);
  if(loadEffects(carriedWeight(inventory,arsenal,survivorSystems)).overloaded)list.push(['負重過高','warn']);
  if (hp < 30) list.push(['重傷', 'bad']);
  else if (hp < 65) list.push(['受傷', 'warn']);
  if (stamina < 22) list.push(['疲憊', 'warn']);
  if (battery <= 0) list.push(['全黑', 'bad']);
  else if (battery < 20) list.push(['快沒電', 'warn']);
  if (lightOn) list.push(['顯眼', '']);
  if(arsenal.equipped)list.push([`${WEAPONS[arsenal.equipped].name} · ${ammo}發`,ammo?'':'bad']);
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
  ['battery', '電池', '使用'], ['ammo', '9毫米補給包', '取出6發'],
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
    row.disabled=helperOpen;
    row.onclick = () => { if(helperOpen)return; if (id === 'pistol') selection(arsenal.equipped ? null : arsenal.owned[0] ?? null); else if (id !== 'kill') useItem(id); };
    row.className = `row ${count > 0 ? 'has' : 'empty'}`;
    row.innerHTML =
      `<span class="dot" style="background:${ITEM_COLOR[id as ItemId]}"></span>` +
      `<span class="nm">${label}</span>` +
      `<span class="ct">${count > 0 ? `×${count}` : '—'}</span>` +
      `<span class="hk">${key}</span>`;
    el.bag.appendChild(row);
  }
  const selection=(id:WeaponId|'cleaver'|'wrench'|null)=>{if(helperOpen)return;if(!equipHand(survivorSystems,arsenal,'primary',id??'pipe'))return;syncArsenal();updateWeaponVisual();updateBag();flashHint(`已裝備 ${id===null?'鐵管':isMeleeTool(id)?TOOL_COMBAT[id].name:WEAPONS[id].name}`);};
  for(const id of [null,...(survivorSystems.ownedTools??[]),...arsenal.owned]){
    const button=document.createElement('button');button.type='button';button.className='row has';button.disabled=helperOpen;
    const selected=survivorSystems.hands.primary===(id??'pipe');button.setAttribute('aria-pressed',String(selected));
    const name=id===null?'鐵管／近戰':isMeleeTool(id)?TOOL_COMBAT[id].name:WEAPONS[id].name,count=id&&!isMeleeTool(id)?`${arsenal.rounds[WEAPONS[id].calibre]}發`:'';
    button.innerHTML=`<span class="dot" style="background:${selected?'#c9a15a':'#9aa0a6'}"></span><span class="nm">${name}</span><span class="ct">${count}</span><span class="hk">${selected?'使用中':'裝備'}</span>`;
    button.onclick=()=>selection(id);el.bag.append(button);
  }
  const rounds=document.createElement('p');rounds.textContent=`9毫米手槍彈 ${arsenal.rounds['9mm']} · 5.8毫米步槍彈 ${arsenal.rounds['5.8-rifle']}（不通用）`;el.bag.append(rounds);
  if(bagOpen)survivorPanel?.render();
  el.kill.textContent = `擊殺 ${kills}`;
  el.loot.textContent = `搜刮 ${looted}`;
  persistCampaign();
}

// ---------------------------------------------------------------- 流程

survivorPanel=installSurvivorPanel({
  getState:()=>({
    supplies:BAG_ROWS.filter(([id])=>id!=='kill').map(([id,label,action])=>({id,label,count:inventory[id as ItemId],action,category:id==='water'||id==='food'?'飲食':id==='medkit'?'醫療':'裝備補給'})),
    weapons:[{id:'pipe',label:'鐵管',twoHanded:false},...(survivorSystems.ownedTools??[]).map(id=>({id,label:TOOL_COMBAT[id].name,twoHanded:false})),...arsenal.owned.map(id=>({id,label:WEAPONS[id].name,twoHanded:WEAPONS[id].category==='rifle'}))],
    primary:survivorSystems.hands.primary,secondary:survivorSystems.hands.secondary,
    weight:carriedWeight(inventory,arsenal,survivorSystems)??0,capacity:12,hp,stamina,hydration:outbreak.hydration,satiety:outbreak.satiety,
    bleeding:survivorSystems.condition.bleeding,pain:survivorSystems.condition.pain,
  }),
  close:()=>toggleBag(false),
  use:(id:string)=>{useItem(id as ItemId);survivorPanel?.render();},
  equip:(hand:'primary'|'secondary',id:string|null)=>{
    if(!equipHand(survivorSystems,arsenal,hand,id as WeaponId|'pipe'|'cleaver'|'wrench'|null)){flashHint('雙手裝備限制：同一物件不能放兩手；步槍需要雙手。');return;}
    syncArsenal();updateWeaponVisual();updateBag();persistCampaign();survivorPanel?.render();
  },
});

function resetWorld() {
  unarmedStance=false;
  px = block.spawn[0];
  pz = block.spawn[1];
  py = 0; vy = 0; grounded = true;
  facing = Math.PI;
  const plan=planEncounters({count:zombies.length,spawn:{x:px,z:pz},bounds,roads:block.roads??[],collides,insideBuilding});
  if(plan.placements.some(p=>!p))throw new Error('街區缺少安全敵人布點，無法開始；既有存檔未改動。');
  zombies.forEach((zb,i)=>{
    const spot=plan.placements[i]!;
    zb.x=zb.hx=spot.x;zb.z=zb.hz=spot.z;
    zb.patrolX=spot.patrol?.x??spot.x;zb.patrolZ=spot.patrol?.z??spot.z;
    zb.state=zb.faction.id==='military'||zb.faction.id==='police'?'wander':'sleep';
    zb.hitReact=0;zb.hitSide=0;zb.mesh.rotation.x=0;zb.mesh.rotation.z=0;
    zb.think=Math.random()*.35;zb.attackCd=0;zb.warning=0;zb.lose=0;
    zb.path=[];zb.pathTimer=0;zb.retreat=0;zb.returning=false;zb.lastX=zb.x;zb.lastZ=zb.z;
    zb.wx=zb.patrolX;zb.wz=zb.patrolZ;zb.hp=100;
    zb.mesh.visible=true;zb.mesh.position.set(zb.x,0,-zb.z);
  });
  for (let i = 0; i < MAX_ZOMBIES * 2; i++) eyeMesh.setColorAt(i, eyeColor.setHex(0x3f5a44));
  syncEyes();

  for (const c of containers) {
    const spot = c.roomPosition?{x:c.roomPosition[0],z:c.roomPosition[1]}:placeContainer();
    delete c.cacheKind;delete c.cacheDay;
    c.x = spot.x; c.z = spot.z; c.looted = false;
    c.mesh.position.set(c.x, 0.26, -c.z);
    c.mesh.scale.set(1,1,1);
    c.mesh.material = c.roomExtra?roomExtraMaterials[c.roomExtra.item]:containerMat;
    c.mesh.visible = c.roomEnabled!==false;
    if(c.roomTool)c.mesh.children.forEach(child=>child.visible=true);
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
  if(mode==='sandbox'&&!resume&&savedGame?.status==='alive'&&!confirm(tr('開始新沙盒會覆寫目前瀏覽器的上海沙盒存檔。確定開始？','开始新沙盒会覆盖当前浏览器的上海沙盒存档。确定开始？','A new sandbox will replace this browser’s Shanghai sandbox save. Start now?'))) {el.overlay.classList.add('on');return;}
  stagedMenu?.dispose();stagedMenu=null;
  document.querySelector('#title-settings-button')?.remove();
  if(!resume)savedGame=null;
  elapsed=0; inShelter=false; shelterPanel.classList.remove('room-view');document.body.classList.remove('inspecting-shelter');resize(); helperOpen=false;helperPanel.hidden=true;helperState=createHelperState(); stash=emptyInventory(); restCount=0; saveTimer=0; saveWarning='';
  shelterPanel.hidden=true;
  spec = chosen;
  document.querySelector<HTMLElement>('#campaign-mode')?.setAttribute('hidden','');
  hp = 100; stamina = 100; battery = 100;
  outbreak = createOutbreak(); sneaking = false; paused = false; attackHeld=false;touchActionHeld=false;pistolEquipped=false;mouseAimActive=false;toggleBag(false);keys.clear();
  lightOn = true; invuln = 0; timeLeft = NIGHT_SECONDS;
  kills = 0;arsenal=createLegacyArsenal(false,0)!;survivorSystems=createSurvivorSystems(arsenal)!;syncArsenal();
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
  configureWorldLayout(resume?resume.worldLayout:'menghua-infill-v1');
  resetWorld();
  if(resume) restoreCampaign(resume);
  updateWeaponVisual();
  if(mode==='sandbox')installSupplySites();
  updateHelperAppearance();
  updateHud();
  updateBag();
  refreshInterfaceLanguage();
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
  installHelperUI();
  el.roster.style.display = '';
  el.pick.style.display = '';
  el.roster.innerHTML = '';
  for (const c of ROSTER) {
    const card = document.createElement('button');card.type='button';card.setAttribute('aria-pressed','false');
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
      el.roster.querySelectorAll('.who').forEach(w => {w.classList.remove('sel');w.setAttribute('aria-pressed','false');});
      card.classList.add('sel');card.setAttribute('aria-pressed','true');
      el.pick.className = '';
      el.pick.innerHTML = `<b>${c.name}</b>·${c.job}·${c.sex === 'f' ? '女' : '男'}——${c.blurb}`;
      el.ovBtn.disabled = false;
      spec = c;
    };
    el.roster.appendChild(card);
  }
  el.ovBtn.disabled = true;
  el.ovBtn.onclick = () => { el.overlay.classList.remove('on'); start(spec); };
  const titleSettings=document.createElement('button');titleSettings.id='title-settings-button';titleSettings.type='button';
  titleSettings.style.cssText='min-height:44px;padding:8px 14px;margin:8px 0;border:1px solid #678777;border-radius:7px;background:#233630;color:#eceddb;font:inherit;cursor:pointer';
  const labelTitleSettings=()=>titleSettings.textContent=tr('⚙ 設定 · 音量／語言','⚙ 设置 · 音量／语言','⚙ Settings · audio / language');labelTitleSettings();
  titleSettings.onclick=()=>settingsMenu.openTitle();
  window.addEventListener('shanghai-language-change',labelTitleSettings);
  el.overlay.querySelector('.menu-edition')!.after(titleSettings);
  stagedMenu=installStagedCharacterMenu({roster:el.roster,pick:el.pick,next:el.ovBtn,modes:document.querySelector<HTMLElement>('#campaign-mode')!,note:document.querySelector<HTMLElement>('#campaign-note')!,resume:document.querySelector<HTMLButtonElement>('#campaign-resume')??undefined,characterIds:ROSTER.map(c=>c.id),hasSave:()=>{try{return localStorage.getItem(saveKey)!==null;}catch{return true;}},isSandbox:()=>mode==='sandbox',translate:tr});
}

// Campaign persistence owns one atomic snapshot: loot depletion and inventory never save separately.
function campaignElapsed() { return elapsed; }
function snapshotCampaign(): Snapshot {
  return { version:1,encounterVersion:1,...(worldLayout?{worldLayout}:{}),mapId:dataUrl,characterId:spec.id,elapsed,hp:phase==='lose'?0:hp,stamina,battery,outbreak:{...outbreak},inventory:{...inventory},stash:{...stash},helper:{...helperState},arsenal:structuredClone(arsenal),survivorSystems:structuredClone(survivorSystems),ammo,hasPistol,pistolEquipped,position:[px,pz],shelterId:shelter?.id??'',inShelter,looted,kills,restCount,status:phase==='lose'?'dead':'alive',
    interiorLoot:Object.fromEntries(containers.filter(c=>c.roomId&&c.roomEnabled!==false).map(c=>[c.roomId!,c.looted])),
    containers:containers.filter(c=>!c.roomId).map(c=>({x:c.x,z:c.z,looted:c.looted,...(c.cacheKind?{cacheKind:c.cacheKind,cacheDay:c.cacheDay}:{})})),
    enemies:zombies.map(z=>({x:z.x,z:z.z,hp:Math.max(0,z.hp),state:z.state,faction:z.faction.id,home:[z.hx,z.hz],patrol:[z.patrolX,z.patrolZ],lastKnown:[z.lastX,z.lastZ],returning:z.returning,retreat:z.retreat})) };
}
function persistCampaign() {
  if(mode!=='sandbox'||!shelter||(phase!=='play'&&phase!=='lose'))return;
  try { if(!saveSnapshot(localStorage,saveKey,snapshotCampaign()))saveWarning='存檔失敗：儲存空間不足或被封鎖，請勿關閉本頁。'; else saveWarning=''; }
  catch {saveWarning='存檔失敗：瀏覽器封鎖儲存，請勿關閉本頁。';}
}
function isCompatibleSave(s:Snapshot|null):s is Snapshot {
  if(!s||s.status!=='alive'||s.hp<=0||s.shelterId!==shelter?.id||s.containers.length!==containers.filter(c=>!c.roomId).length||s.enemies.length!==zombies.length||!ROSTER.some(c=>c.id===s.characterId))return false;
  const onMap=(x:number,z:number)=>x>=bounds.minX-10&&x<=bounds.maxX+10&&z>=bounds.minY-10&&z<=bounds.maxY+10;
  return s.containers.every(c=>onMap(c.x,c.z)&&!baseWallCollision(c.x,c.z,.25))&&s.enemies.every((e,i)=>onMap(e.x,e.z)&&e.faction===profileFor(i).id);
}
function restoreCampaign(s:Snapshot) {
  unarmedStance=false;
  elapsed=s.elapsed;timeLeft=NIGHT_SECONDS-elapsed;hp=s.hp;stamina=s.stamina;battery=s.battery;
  helperState=s.helper?{...s.helper}:createHelperState();
  outbreak={...s.outbreak};Object.assign(inventory,s.inventory);stash={...s.stash};ammo=s.ammo;hasPistol=s.hasPistol;pistolEquipped=s.pistolEquipped;
  arsenal=s.arsenal?structuredClone(s.arsenal):createLegacyArsenal(s.hasPistol,s.ammo)!;
  if(!s.arsenal&&s.pistolEquipped)equipWeapon(arsenal,'qsz92-9');syncArsenal();
  survivorSystems=migrateSurvivorSystems(s.survivorSystems,arsenal)!;
  [px,pz]=s.position;
  if(shelter&&(px<bounds.minX-8||px>bounds.maxX+8||pz<bounds.minY-8||pz>bounds.maxY+8||collides(px,pz,.36))){[px,pz]=shelter.outside;saveWarning='舊存檔位置在街區外或牆內，已移回安全屋門口；物資與進度保留。';}
  inShelter=s.inShelter;looted=s.looted;kills=s.kills;restCount=s.restCount;
  s.containers.forEach((c,i)=>{delete containers[i].cacheKind;delete containers[i].cacheDay;Object.assign(containers[i],c);paintContainer(containers[i]);});
  containers.filter(c=>c.roomId).forEach(c=>{c.looted=s.interiorLoot?.[c.roomId!]===true;paintContainer(c);});
  s.enemies.forEach((z,i)=>{
    const enemy=zombies[i],home=z.home??[z.x,z.z],patrol=z.patrol??home;
    enemy.mesh.rotation.x=0;enemy.mesh.rotation.z=0;
    Object.assign(enemy,z,{hitReact:0,hitSide:0,faction:profileFor(i),hx:home[0],hz:home[1],patrolX:patrol[0],patrolZ:patrol[1],
      wx:patrol[0],wz:patrol[1],lastX:z.lastKnown?.[0]??z.x,lastZ:z.lastKnown?.[1]??z.z,path:[],pathTimer:0,returning:z.returning??false,retreat:z.retreat??0});
    if(z.state==='chase'&&!z.lastKnown){enemy.state='wander';enemy.returning=true;}
    if(enemy.returning){enemy.wx=enemy.hx;enemy.wz=enemy.hz;}
    // Legacy positions, HP and deaths are preserved; no teleport or respawn on upgrade.
    enemy.mesh.visible=z.state!=='dead';enemy.mesh.position.set(z.x,0,-z.z);
  });
  if(inShelter&&shelter)[px,pz]=shelter.inside;
  if(playerRoot)playerRoot.position.set(px,0,-pz);syncEyes();updateDaylight();
}
function paintContainer(c:Container) {
  c.mesh.visible=c.roomEnabled!==false;
  if(c.roomTool)c.mesh.children.forEach(child=>child.visible=!c.looted);
  c.mesh.position.set(c.x,c.cacheKind ? .55 : .26,-c.z);
  c.mesh.scale.set(1,c.cacheKind?1.6:1,1);
  c.mesh.material=c.looted?containerUsed:c.cacheKind?cacheMaterials[c.cacheKind]:c.roomExtra?roomExtraMaterials[c.roomExtra.item]:containerMat;
}
function installSupplySites() {
  // Migrate old v1 in place: retain every box's looted flag; never refill during upgrade.
  if(!containers.some(c=>c.cacheKind)) {
    const ordered=containers.filter(c=>!c.roomId).sort((a,b)=>Math.hypot(a.x-block.spawn[0],a.z-block.spawn[1])-Math.hypot(b.x-block.spawn[0],b.z-block.spawn[1]));
    (['water','food','ammo'] as const).forEach((kind,i)=>{const c=ordered[i];if(c){c.cacheKind=kind;c.cacheDay=dayPhase(elapsed).day;}});
  }
  containers.forEach(paintContainer);
}
function refreshSupplySites() {
  if(mode!=='sandbox')return;
  if(replenishCaches(containers,elapsed)>0){containers.forEach(paintContainer);persistCampaign();flashHint('新的一天：三處交接箱已補給。普通搜刮點仍然耗盡。');}
}
function nearestSupplyHint() {
  const c=containers.filter(c=>c.cacheKind&&!c.looted).sort((a,b)=>Math.hypot(a.x-px,a.z-pz)-Math.hypot(b.x-px,b.z-pz))[0];
  if(!c)return '今日交接箱已領完，返回安全屋整理';
  const right=(c.x-px)+(c.z-pz),up=(c.z-pz)-(c.x-px);
  const dir=(Math.abs(up)>3?(up>0?'上':'下'):'')+(Math.abs(right)>3?(right>0?'右':'左'):'');
  return `${ITEMS[c.cacheKind!].label}交接 ${Math.round(Math.hypot(c.x-px,c.z-pz))}m ${dir}`;
}
function updateHelperAppearance() {
  if(helperActor)(helperActor.material as THREE.MeshStandardMaterial).color.setHex(helperState.helped?0x8dbd9d:0xe4c47a);
}
function openHelper() {
  if(mode!=='sandbox'||inShelter||helperOpen)return;
  if(zombies.some(z=>z.state!=='dead'&&Math.hypot(z.x-px,z.z-pz)<6&&canSee(px,pz,z.x,z.z))){flashHint('阿梅：後面有人追來，先甩開再談！');return;}
  clearControlState();toggleBag(false);helperOpen=true;updateBag();showHelper();
}
function closeHelper() {
  helperOpen=false;helperPanel.hidden=true;paused=false;clearControlState();updateBag();persistCampaign();
}
function showHelper() {
  helperPanel.hidden=false;helperPanel.replaceChildren();
  const day=dayPhase(elapsed).day;
  const title=document.createElement('h2');title.textContent='阿梅・弄堂互助者';
  const story=document.createElement('p');story.textContent=helperState.helped?'你上次留下的醫療包，我記著。傷口好多了；今天有需要，我可以幫你簡單包紮。':'互助點不能斷人。我手上的傷還沒處理，醫療包很缺；你也需要它保命，自己決定。';
  const resources=document.createElement('p');resources.textContent=`你有：罐頭 ${inventory.food} ／水 ${inventory.water} ／醫療包 ${inventory.medkit}。今天還可換水 ${2-(helperState.exchangeDay===day?helperState.exchanges:0)} 次。`;
  helperPanel.append(title,story,resources);
  function choice(label:string,disabled:boolean,fn:()=>boolean,message:string){const button=document.createElement('button');button.textContent=label;button.disabled=disabled;button.onclick=()=>{if(!helperOpen||phase!=='play')return;if(fn()){persistCampaign();updateBag();updateHelperAppearance();showHelper();flashHint(message);}else flashHint('物資或今日配額不足，沒有扣除任何物品。');};helperPanel.append(button);}
  choice('交換：1罐頭 → 1水',inventory.food<1||(helperState.exchangeDay===day&&helperState.exchanges>=2),()=>exchangeWithHelper(helperState,inventory,day),'阿梅：這瓶水收好。一天最多兩次，還有人需要。');
  choice(helperState.helped?'已幫助阿梅（記憶已保存）':'幫助她：交1醫療包，收2水謝禮',helperState.helped||inventory.medkit<1,()=>aidHelper(helperState,inventory),'阿梅記住了你的幫助，以後每天可找她照護一次。');
  choice('接受照護：HP +15（每日一次）',!helperState.helped||helperState.healDay===day||hp>=100,()=>{const player={hp,exposure:outbreak.exposure};if(!receiveHelperCare(helperState,player,day))return false;hp=player.hp;outbreak.exposure=player.exposure;return true;},'阿梅：今天先處理到這裡，別逞強。');
  const exit=document.createElement('button');exit.textContent='離開互助站';exit.onclick=closeHelper;helperPanel.append(exit);
  const note=document.createElement('p');note.id='campaign-note';note.textContent=saveWarning||'虛構遊戲照護效果，不代表現實醫療。所有交換／幫助／每日配額與進度一起保存。';helperPanel.append(note);
}
function installHelperUI() {
  const style=document.createElement('style');style.textContent='#helper-panel{position:fixed;z-index:65;right:3vw;top:10vh;width:min(430px,88vw);max-height:78vh;overflow:auto;background:#142422f5;color:#f4ecda;border:1px solid #c8b779;padding:16px;border-radius:10px;font:14px system-ui}#helper-panel[hidden]{display:none}#helper-panel p{line-height:1.6}#helper-panel button{display:block;width:100%;min-height:44px;margin:10px 0;padding:9px;border:1px solid #93b6ad;background:#203631;color:#f4ecda;border-radius:6px;font:inherit;cursor:pointer}#helper-panel button:disabled{opacity:.4;cursor:default}';document.head.append(style);
  helperPanel=document.createElement('section');helperPanel.id='helper-panel';helperPanel.hidden=true;helperPanel.setAttribute('aria-label','阿梅互助站對話');document.body.append(helperPanel);
  new MutationObserver(()=>{const touch=document.querySelector<HTMLElement>('#survivor-touch-controls');if(touch)touch.hidden=helperOpen||inShelter||el.overlay.classList.contains('on');}).observe(helperPanel,{attributes:true,attributeFilter:['hidden']});
}
function updateDaylight() {
  const profile=daylightProfile(dayPhase(elapsed).hour);
  streetDetails?.setNight(profile.lamps);
  document.documentElement.style.setProperty('--day-vignette',String(profile.vignette));
  hemi.color.setHex(profile.hemiSky);hemi.groundColor.setHex(profile.ground);hemi.intensity=profile.hemiIntensity;
  moon.color.setHex(profile.key);moon.intensity=profile.keyIntensity;
  // Keep a camera-facing key so narrow lanes remain legible on mobile at night.
  renderer.toneMappingExposure=profile.exposure;
  if(scene.background instanceof THREE.Color)scene.background.setHex(profile.sky);
  if(scene.fog instanceof THREE.Fog){scene.fog.color.setHex(profile.sky);scene.fog.near=profile.fogNear;scene.fog.far=profile.fogFar;}
}

function clearControlState(){bufferedHand=null;comboWindow=0;impactPause=0;keys.clear();attackHeld=false;touchActionHeld=false;action='none';lootTarget=null;lootProgress=0;setRing(0);el.prompt.classList.remove('on');}
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
  shelterPanel.hidden=true;shelterPanel.classList.remove('room-view');document.body.classList.remove('inspecting-shelter');refreshShelterView();
  document.querySelector<HTMLElement>('#survivor-touch-controls')?.removeAttribute('hidden');
  clearControlState();invuln=1.5;persistCampaign();flashHint('離開安全屋。先找水與罐頭，別把所有物資帶出去。');
}
function showShelter() {
  shelterPanel.hidden=false;
  const touch=document.querySelector<HTMLElement>('#survivor-touch-controls');if(touch)touch.hidden=true;
  shelterPanel.replaceChildren();
  const title=document.createElement('h2');title.textContent='弄堂安全屋';shelterPanel.append(title);
  const roomView=document.createElement('button');roomView.className='room-view-toggle';
  const syncRoomView=()=>{const viewing=shelterPanel.classList.contains('room-view');roomView.textContent=viewing?'開啟物資面板':'看看屋內';roomView.setAttribute('aria-pressed',String(viewing));document.body.classList.toggle('inspecting-shelter',viewing&&inShelter);refreshShelterView();};
  roomView.onclick=()=>{shelterPanel.classList.toggle('room-view');syncRoomView();};syncRoomView();shelterPanel.append(roomView);
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
  rest.onclick=()=>{const state={hp,stamina,outbreak,inventory,stash,elapsed,restCount};if(restAtShelter(state)){treatBody(survivorSystems.condition,'rest');hp=state.hp;stamina=state.stamina;elapsed=state.elapsed;restCount=state.restCount;updateDaylight();refreshSupplySites();persistCampaign();showShelter();flashHint('休息完成，補充體力與水分；街區時間已前進。');}};
  const exit=document.createElement('button');exit.className='shelter-exit';exit.textContent='返回街區';exit.onclick=leaveShelter;
  shelterPanel.append(rest,exit);
  const status=document.createElement('p');status.textContent=`HP ${Math.round(hp)} · 水分 ${Math.round(outbreak.hydration)} · 飽足 ${Math.round(outbreak.satiety)} · 第${dayPhase(elapsed).day}天 ${saveWarning}`;shelterPanel.append(status);
}
function installCampaignUI() {
  const style=document.createElement('style');style.textContent=`#campaign-mode[hidden]{display:none}#campaign-mode{margin:12px 0;display:flex;gap:8px;flex-wrap:wrap}#campaign-mode button,#shelter-panel button{min-height:44px;padding:8px 12px;border:1px solid #93b6ad;background:#203631;color:#f4ecda;border-radius:6px;font:inherit;cursor:pointer}#campaign-mode button:disabled,#shelter-panel button:disabled{opacity:.4;cursor:default}#shelter-panel{position:fixed;z-index:60;right:3vw;top:10vh;width:min(430px,88vw);max-height:78vh;overflow:auto;background:#142422f5;color:#f4ecda;border:1px solid #70b4ac;padding:16px;border-radius:10px;font:14px system-ui}#shelter-panel[hidden]{display:none}#shelter-panel.room-view{top:auto;bottom:max(16px,env(safe-area-inset-bottom));width:auto;max-width:88vw;padding:8px 14px}#shelter-panel.room-view>:not(.room-view-toggle):not(.shelter-exit){display:none}body.inspecting-shelter #hud,body.inspecting-shelter #side,body.inspecting-shelter #dispatch,body.inspecting-shelter #hint{visibility:hidden}body.inspecting-shelter #vignette{opacity:.2}.shelter-stock>div{display:flex;align-items:center;gap:7px;margin:7px 0}.shelter-stock span{flex:1}#shelter-panel>button{margin:10px 8px 0 0}#campaign-mode .selected{background:#486354}`;document.head.append(style);
  shelterPanel=document.createElement('section');shelterPanel.id='shelter-panel';shelterPanel.hidden=true;shelterPanel.setAttribute('aria-label','安全屋物資與休息');document.body.append(shelterPanel);
  new MutationObserver(()=>{const touch=document.querySelector<HTMLElement>('#survivor-touch-controls');if(touch)touch.hidden=!shelterPanel.hidden||helperOpen||el.overlay.classList.contains('on');}).observe(shelterPanel,{attributes:true,attributeFilter:['hidden']});
  const modes=document.createElement('div');modes.id='campaign-mode';
  const sand=document.createElement('button');sand.textContent='生存沙盒（持久存檔）';sand.className='selected';sand.disabled=!shelter;
  const quick=document.createElement('button');quick.textContent='8分鐘快速撤離（獨立）';
  sand.setAttribute('aria-pressed','true');quick.setAttribute('aria-pressed','false');
  sand.onclick=()=>{mode='sandbox';sand.className='selected';quick.className='';sand.setAttribute('aria-pressed','true');quick.setAttribute('aria-pressed','false');};quick.onclick=()=>{mode='quick';quick.className='selected';sand.className='';quick.setAttribute('aria-pressed','true');sand.setAttribute('aria-pressed','false');};
  if(!shelter){mode='quick';quick.className='selected';sand.textContent='此地圖未找到安全門口';}
  modes.append(sand,quick);
  const refreshModes=()=>{sand.textContent=shelter?tr('生存沙盒（持久存檔）','生存沙盒（持久存档）','Sandbox · persistent save'):tr('此地圖未找到安全門口','此地图未找到安全门口','Sandbox unavailable on this map');quick.textContent=tr('8分鐘快速撤離（獨立）','8分钟快速撤离（独立）','8-minute evacuation · separate');const resume=document.querySelector('#campaign-resume');if(resume)resume.textContent=tr('繼續已有存檔','继续已有存档','Continue saved game');const title=el.overlay.querySelector('h1');if(title)title.textContent=tr('上海倖存者','上海幸存者','Shanghai Survivors');};
  window.addEventListener('shanghai-language-change',refreshModes);refreshModes();
  const valid=isCompatibleSave(savedGame);
  if(valid){const resume=document.createElement('button');resume.id='campaign-resume';resume.textContent=tr(`繼續第${dayPhase(savedGame!.elapsed).day}天存檔`,`继续第${dayPhase(savedGame!.elapsed).day}天存档`,`Continue · Day ${dayPhase(savedGame!.elapsed).day}`);resume.onclick=()=>{let current:Snapshot|null=null;try{current=loadCandidateSave();}catch{}if(!isCompatibleSave(current)){resume.disabled=true;resume.textContent='存檔已失效';return;}mode='sandbox';modes.hidden=true;start(ROSTER.find(c=>c.id===current!.characterId)??ROSTER[0],current);};modes.append(resume);}
  const note=document.createElement('p');note.id='campaign-note';note.textContent=savedGame?.status==='dead'?'上一位倖存者已死亡；新沙盒會重設世界與庫存。':valid?'候選版獨立存檔；新沙盒只覆寫候選進度，舊正式版與快速挑戰互不影響。':'沙盒：找藍色門標，按E／手機「家」進入。先帶一水一罐頭回家。';
  note.textContent=tr('沙盒自動保存；快速挑戰不影響沙盒存檔。舊檔保留原布局。','沙盒自动保存；快速挑战不影响沙盒存档。旧档保留原布局。','Sandbox autosaves. Quick challenges keep your sandbox save. Older saves retain their original layout.');
  el.roster.before(modes,note);
  el.overlay.querySelector('.sub')!.textContent='上海病毒爆發。選角色後探索街區、搜刮並返回自己的安全屋；或選擇獨立八分鐘撤離挑戰。';
}
addEventListener('pagehide',persistCampaign);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='play'){persistCampaign();clearControlState();paused=true;}});

// ---------------------------------------------------------------- 主循環

function frame(dt: number) {
  settingsMenu.setPlaying(phase==='play');
  const audioActive=phase==='play'&&!paused&&!bagOpen&&!inShelter&&!helperOpen;
  gameAudio.setActive(audioActive);
  if(audioActive){
    if(swingCount>audioLastSwing)gameAudio.play('swing');
    else if(looted>audioLastLoot)gameAudio.play('loot');
    audioStepTimer+=dt;
    if(audioStepTimer>.42&&(keys.has('KeyW')||keys.has('KeyA')||keys.has('KeyS')||keys.has('KeyD'))){gameAudio.play('step');audioStepTimer=0;}
  }
  audioLastSwing=swingCount;audioLastLoot=looted;

  if (phase === 'play' && !paused && !bagOpen && !inShelter && !helperOpen) {
    if(mode==='quick')timeLeft -= dt;
    else { elapsed += dt; timeLeft = NIGHT_SECONDS - elapsed; updateDaylight(); refreshSupplySites(); }
    const nearbyThreat = zombies.some(z => z.faction.id === 'infected' && z.state !== 'dead' && Math.hypot(z.x - px, z.z - pz) < 4 && canSee(z.x, z.z, px, pz));
    stepOutbreak(outbreak, dt, { running: !sneaking && stamina > 1 && action === 'none' && ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].some(k => keys.has(k)) && (keys.has('ShiftLeft') || keys.has('ShiftRight')), nearbyThreat });
    hp=Math.max(0,hp-stepBody(survivorSystems.condition,dt));
    if (outbreak.hydration <= 0 || outbreak.satiety <= 0) hp = Math.max(0, hp - dt * 1.5);
    if (hp <= 0) { lose(survivorSystems.condition.bleeding>0?'因未處置的傷勢倒下。':'在耗盡補給後倒下。'); return; }
    if (attackHeld || touchActionHeld) { if (touchActionHeld && action==='none') aimNearest(); if(action==='none') dispatchHandAttack('primary'); }
    if (mouseAimActive && action !== 'swing') { aimRay.setFromCamera(inputAim,camera); if(aimRay.ray.intersectPlane(groundPlane,aimHit)) facing=Math.atan2(aimHit.x-px,aimHit.z+pz); }
    updatePlayer(dt);
    updateZombies(dt);
    if (phase !== 'play') return;
    updateProjectiles(dt);
    updateLoot(dt);
    updateHud();
    updatePlaceLabel();
    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) el.hint.textContent = tr(HINT_DEFAULT,'WASD 移动 · Shift 跑 · C 潜行 · 点击攻击 · E 互动 · R 副手 · Tab 背包 · Esc 菜单','WASD move · Shift run · C sneak · Click attack · E use · R offhand · Tab bag · Esc menu');
    }
    if (muzzleT > 0) {
      muzzleT -= dt;
      if (muzzle && muzzleT <= 0) muzzle.visible = false;
    }
    saveTimer += dt; if(saveTimer>=3) {saveTimer=0;persistCampaign();}
    if (mode==='quick' && phase === 'play' && timeLeft <= 0) lose('錯過接應窗口，街區通道已封閉。');
  }

  if (paused || bagOpen || inShelter || helperOpen) updateHud();
  if(shelterLamp)shelterLamp.visible=inShelter;
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
  visibilityTimer-=dt;if(visibilityTimer<=0){visibilityTimer=.1;cityVisibility?.update(px,pz,inShelter&&shelterPanel.classList.contains('room-view')?roomFocus:activeInterior()?.focus);facadeSignage?.update(cityVisibility?.fadedIds()??[]);if(densityGroup.visible)densityVisibility?.update(px,pz);}
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  frame(dt);
  renderer.render(scene, camera);
}

/** Commit room zoom and occlusion in one UI transaction. A slow GPU may render
 * fewer than two frames in 300 ms; the simulation visibility timer is not a UI gate. */
function refreshShelterView() {
  resize();
  cityVisibility?.update(px,pz,inShelter&&shelterPanel.classList.contains('room-view')?roomFocus:activeInterior()?.focus);facadeSignage?.update(cityVisibility?.fadedIds()??[]);if(densityGroup.visible)densityVisibility?.update(px,pz);
  visibilityTimer=.1;
  const target=new THREE.Vector3(px,1,-pz);
  camera.position.copy(target).add(new THREE.Vector3(40,56,40));camera.lookAt(target);
  if(shelterLamp)shelterLamp.visible=inShelter;
  renderer.render(scene,camera);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const a = innerWidth / innerHeight;
  const inspecting=inShelter&&shelterPanel?.classList.contains('room-view');
  const viewSize = inspecting?roomViewHeight(a):viewHeight(a,matchMedia('(any-pointer:coarse)').matches,viewZoom);
  camera.left = -viewSize * a / 2;
  camera.right = viewSize * a / 2;
  camera.top = viewSize / 2;
  camera.bottom = -viewSize / 2;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('wheel', e => {
  e.preventDefault();
  if(inShelter&&shelterPanel.classList.contains('room-view'))return;
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
    collides = baseWallCollision = makeCollider(grid);
    baseInsideBuilding = makeInsideTest(data);
    insideBuilding=(x,z)=>baseInsideBuilding(x,z)||(densityEnabledForLayout(worldLayout)&&densityInside(x,z));

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

    // Preserve every source vertex; fade only buildings intersecting the camera ray.
    shelter = selectShelter(data.buildings, data.spawn, collides, insideBuilding);
    cityVisibility=createCityVisibility(data.buildings,true);scene.add(cityVisibility.group);facadeSignage=createFacadeSignage(data.buildings);scene.add(facadeSignage.group);
    if(shelter) {
      const marker=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.4,.25),new THREE.MeshStandardMaterial({color:0x49c8d8,emissive:0x166c7a,emissiveIntensity:.8}));
      marker.position.set(shelter.outside[0],1.2,-shelter.outside[1]); marker.scale.set(.4,1,.4);scene.add(marker);
      const shelterBuilding=data.buildings.find(b=>b.id===shelter!.id);
      if(shelterBuilding){scene.add(createLilongInterior(shelterBuilding,shelter),createShelterFloor(shelterBuilding));roomFocus=shelterInspectionPoints(shelterBuilding,shelter);}
      shelterLamp=new THREE.PointLight(0xffd6aa,5,8,2);shelterLamp.position.set(shelter.inside[0],2.8,-shelter.inside[1]);shelterLamp.visible=false;scene.add(shelterLamp);
    }
    densityBuildings=planDensityBuildings({buildings:data.buildings,roads:data.roads??[],spawn:data.spawn}).buildings;
    const densityBlock={buildings:densityBuildings,spawn:data.spawn};
    densityCollision=makeCollider(wallGridOf(densityBlock,false));densityInside=makeInsideTest(densityBlock);
    densityVisibility=createCityVisibility(densityBuildings,true);densityGroup.add(densityVisibility.group);
    const densityFloor=roofGeometry(densityBuildings),floorPositions=densityFloor.getAttribute('position');
    for(let i=0;i<floorPositions.count;i++)floorPositions.setY(i,.035);floorPositions.needsUpdate=true;densityFloor.computeVertexNormals();
    densityGroup.add(new THREE.Mesh(densityFloor,new THREE.MeshStandardMaterial({color:0x898b86,roughness:1,side:THREE.DoubleSide})));
    densityGroup.visible=false;scene.add(densityGroup);
    plannedInteriorRooms=planInteriorRooms(data,shelter?[shelter.id]:[],9);
    for(const room of plannedInteriorRooms){const b=data.buildings.find(b=>b.id===room.buildingId)!;const roomGroup=createInteriorRoomGeometry(room,b);scene.add(roomGroup);interiorGroups.set(room.id,roomGroup);roomInsideTests.set(room.id,makeInsideTest({buildings:[b],spawn:room.entrance.inside}));}
    collides=(x,z,r=.35)=>baseWallCollision(x,z,r)||(densityEnabledForLayout(worldLayout)&&densityCollision(x,z,r))||interiorRooms.some(room=>roomFurnitureCollision(room,x,z,r));
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
    // Render the already bundled real OSM network; preserve CMAB/OSM positions.
    streetDetails=createStreetDetails(data.roads??[],data.buildings,bounds);scene.add(streetDetails.group);
    const streets=roadGeometries(data.roads??[]);
    scene.add(new THREE.Mesh(streets.surface,applyPavementGrain(new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),.07)));
    // Segment-wide outlines cross adjacent road ribbons at junctions and look like
    // fictional white road markings. Actual raised kerbs are already in streetDetails.
    streets.edges.dispose();


    for (let i = 0; i < containerCount; i++) {
      const mesh = new THREE.Mesh(containerGeo, containerMat);
      mesh.position.set(0, 0.26, 0);
      scene.add(mesh);
      containers.push({ x: 0, z: 0, mesh, looted: false });
    }

    for(const [roomIndex,room] of plannedInteriorRooms.entries())for(const loot of room.loot){const mesh=new THREE.Mesh(containerGeo,containerMat);scene.add(mesh);containers.push({x:loot.position[0],z:loot.position[1],mesh,looted:false,roomId:loot.id,roomItem:loot.item,roomLabel:room.label,roomPosition:[...loot.position],expandedRoom:roomIndex>=3,roomEnabled:roomIndex<3});}
    for(const extra of planRoomExtras(plannedInteriorRooms)){
      const roomIndex=plannedInteriorRooms.findIndex(r=>r.buildingId===extra.buildingId),room=plannedInteriorRooms[roomIndex];
      const mesh=new THREE.Mesh(containerGeo,containerMat);scene.add(mesh);
      containers.push({x:extra.position[0],z:extra.position[1],mesh,looted:false,roomId:extra.id,roomItem:extra.item,roomExtra:extra,roomLabel:`${room.label}｜${ITEMS[extra.item].label}`,roomPosition:[...extra.position],expandedRoom:roomIndex>=3,roomEnabled:roomIndex<3});
    }
    for(const tool of planRoomTools(plannedInteriorRooms)){
      const roomIndex=plannedInteriorRooms.findIndex(r=>r.buildingId===tool.buildingId);
      const model=buildMeleeTool(tool.tool);const mesh=new THREE.Mesh(containerGeo,containerMat);mesh.add(model);model.position.y=.2;scene.add(mesh);
      containers.push({x:tool.position[0],z:tool.position[1],mesh,looted:false,roomId:tool.id,roomTool:tool,roomLabel:TOOL_COMBAT[tool.tool].name,roomPosition:[...tool.position],expandedRoom:roomIndex>=3,roomEnabled:roomIndex<3});
    }
    muzzle = new THREE.PointLight(0xffd6a0, 9, 16, 2);
    muzzle.visible = false;
    scene.add(muzzle);

    evacRing = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 64), new THREE.MeshBasicMaterial({ color: 0x397959, side: THREE.DoubleSide }));
    evacRing.rotation.x = -Math.PI / 2;
    configureWorldLayout(undefined);
    evacRing.position.set(data.spawn[0], 0.06, -data.spawn[1]);
    scene.add(evacRing);
    helperActor = new THREE.Mesh(new THREE.CapsuleGeometry(.3,1,4,8), new THREE.MeshStandardMaterial({color:0xe4c47a}));
    helperActor.position.set(data.spawn[0]+1.4,.8,-data.spawn[1]); scene.add(helperActor);
    px = data.spawn[0];
    pz = data.spawn[1];
    buildZombies();
    try {savedGame=loadCandidateSave();}catch {saveWarning='瀏覽器封鎖儲存；本局無法持久存檔。';}
    buildMenu();

    if (params.has('debug')) {
      (window as unknown as { __modu: unknown }).__modu = {
        state: () => ({
          helper:{...helperState},helperOpen, fadedBuildings:cityVisibility?.fadedIds(), cityMeshes:cityVisibility?.stats(), facadeSigns:facadeSignage?.stats, roomExtras:containers.filter(c=>c.roomExtra&&c.roomEnabled!==false).map(c=>({id:c.roomId,item:c.roomItem,looted:c.looted,x:c.x,z:c.z})),
          phase, mode, input:{heldKeys:[...keys],settingsOpen:settingsMenu.isOpen()},preferences:{...gameSettings}, renderBudget:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}, worldLayout:worldLayout??'legacy', worldPositions:{containers:containers.filter(c=>!c.roomId).map(c=>({x:c.x,z:c.z})),enemies:zombies.map(z=>({x:z.x,z:z.z}))}, densityBuildings:densityEnabledForLayout(worldLayout)?densityBuildings:[], densityMeshes:densityGroup.visible?{...densityVisibility?.stats(),floorMeshes:1}:null, plannedInteriorRoomCount:plannedInteriorRooms.length, inShelter, shelter: shelter ? {...shelter,door:[...shelter.door],inside:[...shelter.inside],outside:[...shelter.outside]} : null, stash:{...stash}, restCount, dayNight:daylightProfile(dayPhase(elapsed).hour), streetDetails:streetDetails?.stats, streetPlacements:streetDetails?.placements, interiorRooms:interiorRooms.map(r=>({id:r.id,label:r.label,entrance:r.entrance,loot:r.loot,furniture:r.furniture})), activeInterior:activeInterior()?.id??null, roomView:shelterPanel.classList.contains('room-view'), cameraViewHeight:camera.top-camera.bottom, streetZoom:viewZoom, hp, battery, stamina, timeLeft, kills, paused, bagOpen, sneaking, looted, outbreak: { ...outbreak },
          zombies: zombies.length, awake: zombies.filter(z => z.state === 'chase').length,
          dead: zombies.filter(z => z.state === 'dead').length,
          factions: Object.fromEntries(['infected','military','police','raider'].map(id => [id,zombies.filter(z => z.faction.id === id).length])),
          inventory: { ...inventory }, arsenal:structuredClone(arsenal),survivorSystems:structuredClone(survivorSystems),weight:carriedWeight(inventory,arsenal,survivorSystems),ammo, hasPistol, equipped: arsenal.equipped,
          action, swingHand, shootHand, swingStroke, bufferedHand, impactPause, swingTool,unarmedStance,
          combatTargets: zombies.slice(0, 8).map(z=>({x:z.x,z:z.z,hp:z.hp,state:z.state})), actionProgress: actionDur ? actionT / actionDur : 0, attackHeld, touchActionHeld, swingCount,
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
        combatFixture: (distance=1.1) => {
          if(!Number.isFinite(distance)||distance<.6||distance>1.5)return false;
          releaseGameplayInput(); mouseAimActive = false;
          // Isolated debug sparring: remove unrelated threats, never mutate normal sessions.
          for(const other of zombies.slice(1)){other.state='dead';other.hp=0;other.mesh.visible=false;}
          for (let i=0;i<32;i++) { const a=i*Math.PI/16,x=px+Math.sin(a)*distance,z=pz-Math.cos(a)*distance; if(collides(x,z,.34)||!canSee(px,pz,x,z))continue; facing=a; const zb=zombies[0]; zb.x=x;zb.z=z;zb.hp=100;zb.state='chase';zb.think=60;zb.attackCd=60;zb.lose=0;zb.flashT=0;zb.hitReact=0;zb.hitSide=0;zb.mesh.visible=true;zb.mesh.rotation.set(0,a,0);return true; } return false;
        },
        swing: () => startSwing(),
        hurt: (n = 30) => { injureBody(survivorSystems.condition,n);hp = Math.max(0, hp - n); if (hp <= 0) lose(); },
        give: (id: ItemId, n = 1) => { inventory[id] += n; if (id === 'pistol'){grantWeapon(arsenal,'qsz92-9');syncArsenal();} updateBag(); },
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
