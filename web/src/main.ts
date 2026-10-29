import * as THREE from 'three';
import { createFacadeDetails } from './facades';
import { addStreetDetails } from './streets';
import { UniformGrid, type Box } from './spatial';
import { BAY_M, FLOOR_M, WINDOW_BASE_M, windowBandMaterial } from './windows';
import './style.css';

type Point = [number, number];
type Building = { id: string; footprint: Point[]; holes: Point[][]; height_m: number; door_edge: number };
type Road = { id: string; centerline: Point[]; width_m: number; type: string; name: string };
type Block = { buildings: Building[]; roads: Road[]; spawn: Point; entrance: Point; entrance_building: string };
type Wall = { a: Point; b: Point };
type BuildingRender = {
  building: Building;
  roof: THREE.Object3D;
  wallMaterial: THREE.MeshStandardMaterial;
  bands: THREE.Object3D | null;
  facade: THREE.Object3D;
};

const status = document.querySelector<HTMLDivElement>('#status')!;
const viewport = document.querySelector<HTMLDivElement>('#viewport')!;
// ?data=block_1000m.json swaps the scene without touching code; ?debug shows the HUD.
const params = new URLSearchParams(location.search);
// Bare names resolve under ./data/, so ?data=block_1000m.json works as written.
const rawData = params.get('data');
const dataUrl = rawData ? (rawData.includes('/') ? rawData : `./data/${rawData}`) : './data/block.json';
const debug = params.has('debug');
const loadStart = performance.now();
let loadMs = 0;
let fps = 0;
let hudEl: HTMLDivElement | undefined;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaebbb8);
scene.fog = new THREE.Fog(0xaebbb8, 120, 330);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewport.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-30, 30, 22, -22, 0.1, 2400);
const ambient = new THREE.HemisphereLight(0xe3e8e2, 0x6f766b, 2.05);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffe8c7, 2);
sun.position.set(-50, 100, 40);
scene.add(sun);

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9d8e, roughness: 1 });
const materials = {
  road: new THREE.MeshStandardMaterial({ color: 0x51585a, roughness: 1, side: THREE.DoubleSide }),
  edge: new THREE.MeshBasicMaterial({ color: 0x9b9d91, side: THREE.DoubleSide }),
  roof: new THREE.MeshStandardMaterial({ color: 0x8a6e60, roughness: 1, side: THREE.DoubleSide }),
};

const walls: Wall[] = [];
const renderBuildings: BuildingRender[] = [];
// Broad-phase indexes: one for collision segments, one for building footprints.
// Player queries are then local instead of scanning the whole block each frame.
const wallGrid = new UniformGrid<Wall>(8);
const buildingGrid = new UniformGrid<Building>(32);

const point = (p: Point, y = 0) => new THREE.Vector3(p[0], y, -p[1]);
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function wallPiece(a: Point, b: Point, y0: number, y1: number, group: THREE.Group, material: THREE.Material, solid = true) {
  if (dist(a, b) < 0.01) return;
  const aa = point(a, y0), bb = point(b, y0), cc = point(b, y1), dd = point(a, y1);
  const vertices = (group.userData.vertices ??= []) as number[];
  vertices.push(
    ...aa.toArray(), ...bb.toArray(), ...cc.toArray(), ...aa.toArray(), ...cc.toArray(), ...dd.toArray(),
  );
  group.userData.material = material;
  if (solid) walls.push({ a, b });
}

function finishGroup(group: THREE.Group) {
  const vertices = group.userData.vertices as number[] | undefined;
  if (!vertices?.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, group.userData.material as THREE.Material));
  delete group.userData.vertices;
}

function makeRoad(road: Road) {
  for (let i = 0; i < road.centerline.length - 1; i++) {
    const a = point(road.centerline[i], 0.015), b = point(road.centerline[i + 1], 0.015);
    const direction = b.clone().sub(a); const length = direction.length();
    if (length < 0.01) continue;
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(road.width_m, length), materials.road);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.rotation.z = Math.atan2(-direction.x, -direction.z);
    roadMesh.position.copy(a.clone().add(b).multiplyScalar(.5));
    scene.add(roadMesh);
    for (const sign of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(.12, length), materials.edge);
      edge.rotation.copy(roadMesh.rotation);
      edge.position.copy(roadMesh.position).addScaledVector(side, sign * road.width_m / 2);
      edge.position.y = .026;
      scene.add(edge);
    }
  }
}

function polygonShape(points: Point[], holes: Point[][]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach((p, i) => i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1]));
  shape.closePath();
  for (const ring of holes) {
    const hole = new THREE.Path();
    ring.forEach((p, i) => i ? hole.lineTo(p[0], p[1]) : hole.moveTo(p[0], p[1]));
    hole.closePath(); shape.holes.push(hole);
  }
  return shape;
}

/** One glazed band per wall: a single quad with repeating UVs, no window geometry. */
function makeBands(ring: Point[], height: number, positions: number[], uvs: number[]) {
  const top = height;
  if (top <= WINDOW_BASE_M + 1.2) return;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const length = dist(a, b);
    if (length < 1.2) continue;
    const u = length / BAY_M;
    const v = (top - WINDOW_BASE_M) / FLOOR_M;
    const aa = point(a, WINDOW_BASE_M), bb = point(b, WINDOW_BASE_M);
    const cc = point(b, top), dd = point(a, top);
    positions.push(
      ...aa.toArray(), ...bb.toArray(), ...cc.toArray(),
      ...aa.toArray(), ...cc.toArray(), ...dd.toArray(),
    );
    uvs.push(0, 0, u, 0, u, v, 0, 0, u, v, 0, v);
  }
}

function makeBuilding(b: Building, index: number, block: Block) {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: [0xc8bfb0, 0xc4beb1, 0xbdbbb1, 0xc8c1b4][index % 4],
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const bandPositions: number[] = [];
  const bandUvs: number[] = [];
  const ring = b.footprint;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length];
    const length = dist(a, c); if (length < .1) continue;
    if (i === b.door_edge && length > 2.1) {
      const dx = (c[0] - a[0]) / length, dy = (c[1] - a[1]) / length;
      const mid: Point = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const left: Point = [mid[0] - dx, mid[1] - dy], right: Point = [mid[0] + dx, mid[1] + dy];
      wallPiece(a, left, 0, b.height_m, group, wallMaterial);
      wallPiece(right, c, 0, b.height_m, group, wallMaterial);
      wallPiece(left, right, 2.5, b.height_m, group, wallMaterial, false);
    } else wallPiece(a, c, 0, b.height_m, group, wallMaterial);
  }
  for (const hole of b.holes) for (let i = 0; i < hole.length; i++) wallPiece(hole[i], hole[(i + 1) % hole.length], 0, b.height_m, group, wallMaterial);
  finishGroup(group);

  // Bands follow the same rings but are never added to the collision set.
  makeBands(ring, b.height_m, bandPositions, bandUvs);
  for (const hole of b.holes) makeBands(hole, b.height_m, bandPositions, bandUvs);
  let bands: THREE.Mesh | null = null;
  if (bandPositions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bandPositions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bandUvs, 2));
    geometry.computeVertexNormals();
    bands = new THREE.Mesh(geometry, windowBandMaterial());
    scene.add(bands);
  }

  const roof = new THREE.Mesh(new THREE.ShapeGeometry(polygonShape(ring, b.holes)), materials.roof);
  roof.rotation.x = -Math.PI / 2; roof.position.y = b.height_m;
  const facade = createFacadeDetails(b, block.buildings, block.roads);
  scene.add(group, roof, facade);
  renderBuildings.push({ building: b, roof, wallMaterial, bands, facade });
}

function contains(p: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function insideBuilding(p: Point, b: Building) { return contains(p, b.footprint) && !b.holes.some(h => contains(p, h)); }
function occludesPlayer(p: Point, b: Building) {
  const rx = 40, ry = -40;
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  for (let i = 0; i < b.footprint.length; i++) {
    const a = b.footprint[i], c = b.footprint[(i + 1) % b.footprint.length];
    const sx = c[0] - a[0], sy = c[1] - a[1], denom = cross(rx, ry, sx, sy);
    if (Math.abs(denom) < 1e-8) continue;
    const qx = a[0] - p[0], qy = a[1] - p[1];
    const t = cross(qx, qy, sx, sy) / denom, u = cross(qx, qy, rx, ry) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1 && 1 + t * 56 < b.height_m) return true;
  }
  return false;
}
function closestDistance(p: Point, w: Wall) {
  const x = w.b[0] - w.a[0], y = w.b[1] - w.a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * x + (p[1] - w.a[1]) * y) / (x * x + y * y)));
  return Math.hypot(p[0] - w.a[0] - t * x, p[1] - w.a[1] - t * y);
}
function blocked(p: Point) {
  const hits = wallGrid.query({ minX: p[0] - .35, maxX: p[0] + .35, minY: p[1] - .35, maxY: p[1] + .35 });
  for (const w of hits) if (closestDistance(p, w) < .35) return true;
  return false;
}

function boxOf(points: Point[], pad = 0): Box {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}
const wallBox = (w: Wall): Box => ({
  minX: Math.min(w.a[0], w.b[0]) - .5, maxX: Math.max(w.a[0], w.b[0]) + .5,
  minY: Math.min(w.a[1], w.b[1]) - .5, maxY: Math.max(w.a[1], w.b[1]) + .5,
});
function uniqueById(list: Building[]): Building[] {
  const seen = new Set<string>();
  const out: Building[] = [];
  for (const b of list) if (!seen.has(b.id)) { seen.add(b.id); out.push(b); }
  return out;
}
function enclosedBuildings(p: Point): Building[] {
  return uniqueById(buildingGrid.query({ minX: p[0], maxX: p[0], minY: p[1], maxY: p[1] }))
    .filter(b => insideBuilding(p, b));
}
function occludingBuildings(p: Point): Building[] {
  const reach = 58;
  return uniqueById(buildingGrid.query({ minX: p[0] - reach, maxX: p[0] + reach, minY: p[1] - reach, maxY: p[1] + reach }))
    .filter(b => occludesPlayer(p, b));
}

const actor = new THREE.Group();
function boxPart(width: number, height: number, depth: number, x: number, y: number, color: number) {
  const part = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  part.position.set(x, y, 0); actor.add(part); return part;
}
boxPart(.55, .7, .28, 0, 1.15, 0x435b56);
boxPart(.34, .37, .32, 0, 1.7, 0xe5d5ba);
const leg1 = boxPart(.18, .6, .2, -.18, .48, 0x343c3d);
const leg2 = boxPart(.18, .6, .2, .18, .48, 0x343c3d);
boxPart(.17, .56, .19, -.36, 1.12, 0x526963);
boxPart(.17, .56, .19, .36, 1.12, 0x526963);
scene.add(actor);
const marker = new THREE.Mesh(new THREE.RingGeometry(.48, .61, 24), new THREE.MeshBasicMaterial({ color: 0xe7c878, side: THREE.DoubleSide }));
marker.rotation.x = -Math.PI / 2; marker.position.y = .04; actor.add(marker);
const light = new THREE.SpotLight(0xffe3ab, 25, 18, .46, .45); light.position.set(0, 1.4, 0); light.target.position.set(0, .8, -8); light.visible = false; actor.add(light, light.target);

let block: Block;
let bounds: Box = { minX: 0, maxX: 250, minY: 0, maxY: 250 };
let pos: Point = [0, 0], jumpY = 0, jumpVelocity = 0, viewSize = 44, moved = false, time = 0;
const clampToBlock = (p: Point): Point => [
  THREE.MathUtils.clamp(p[0], bounds.minX + 2, bounds.maxX - 2),
  THREE.MathUtils.clamp(p[1], bounds.minY + 2, bounds.maxY - 2),
];
const keys = new Set<string>();
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyF' && !e.repeat) light.visible = !light.visible;
  if (e.code === 'Space' && jumpY === 0) jumpVelocity = 5;
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.querySelectorAll<HTMLButtonElement>('.touch-controls button').forEach(button => {
  const code = button.dataset.key!;
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); keys.add(code); });
  button.addEventListener('pointerup', () => keys.delete(code));
  button.addEventListener('pointercancel', () => keys.delete(code));
  button.addEventListener('lostpointercapture', () => keys.delete(code));
});
renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); viewSize = THREE.MathUtils.clamp(viewSize * (e.deltaY < 0 ? .9 : 1.1), 12, 260); resize(); }, { passive: false });
function resize() {
  const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h);
  const aspect = w / h; camera.left = -viewSize * aspect / 2; camera.right = viewSize * aspect / 2;
  camera.top = viewSize / 2; camera.bottom = -viewSize / 2; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function frame(delta: number) {
  if (!block) return;
  const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const x = (right - forward) / Math.SQRT2, z = (-right - forward) / Math.SQRT2;
  const len = Math.hypot(x, z); moved = len > 0;
  if (moved) {
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6 : 3.4;
    const next = clampToBlock([pos[0] + x / len * speed * delta, pos[1] - z / len * speed * delta]);
    if (!blocked(next)) pos = next;
    else {
      if (!blocked([next[0], pos[1]])) pos[0] = next[0];
      if (!blocked([pos[0], next[1]])) pos[1] = next[1];
    }
    actor.rotation.y = Math.atan2(-x, -z); time += delta * 9;
    leg1.rotation.x = Math.sin(time) * .35; leg2.rotation.x = -leg1.rotation.x;
  } else { leg1.rotation.x = 0; leg2.rotation.x = 0; }
  if (jumpY > 0 || jumpVelocity > 0) { jumpVelocity -= 20 * delta; jumpY = Math.max(0, jumpY + jumpVelocity * delta); if (jumpY === 0) jumpVelocity = 0; }
  actor.position.set(pos[0], jumpY, -pos[1]);
  const target = new THREE.Vector3(pos[0], 1, -pos[1]);
  camera.position.copy(target).add(new THREE.Vector3(40, 56, 40)); camera.lookAt(target);

  const insideSet = new Set(enclosedBuildings(pos));
  const occluding = new Set(occludingBuildings(pos));
  for (const r of renderBuildings) {
    const inside = insideSet.has(r.building);
    const occludes = !inside && occluding.has(r.building);
    r.roof.visible = !inside && !occludes;
    // Reveal the player both inside a building and behind a foreground facade.
    const fade = inside || occludes;
    r.wallMaterial.transparent = fade; r.wallMaterial.opacity = fade ? .22 : 1;
    r.wallMaterial.depthWrite = !fade;
    if (r.bands) r.bands.visible = !fade;
    r.facade.visible = !fade;
  }
}

const clock = new THREE.Clock();
let frames = 0, elapsed = 0;
function updateHud() {
  if (!hudEl) return;
  const info = renderer.info.render;
  hudEl.textContent =
    `fps ${fps.toFixed(0)} · calls ${info.calls} · tris ${info.triangles}\n` +
    `load ${loadMs.toFixed(0)} ms · buildings ${renderBuildings.length} · roads ${block?.roads.length ?? 0}`;
}
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  frame(delta);
  renderer.render(scene, camera);
  if (!loadMs) {
    loadMs = performance.now() - loadStart;
    if (debug) {
      hudEl = document.createElement('div');
      hudEl.className = 'debug-hud';
      document.querySelector('#app')!.appendChild(hudEl);
      updateHud();
    }
  }
  frames++; elapsed += delta;
  if (elapsed >= 0.5) { fps = frames / elapsed; frames = 0; elapsed = 0; updateHud(); }
}

fetch(dataUrl).then(r => { if (!r.ok) throw new Error(`資料載入失敗 ${r.status}`); return r.json() as Promise<Block>; }).then(data => {
  block = data; pos = [...block.spawn];
  bounds = boxOf(data.buildings.flatMap(b => b.footprint));

  // Ground is sized from the data, not a fixed plane: footprints can extend
  // past a hard-coded square, which would leave edge buildings floating.
  const pad = 80;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const depth = bounds.maxY - bounds.minY + pad * 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bounds.minX + bounds.maxX) / 2, -0.02, -(bounds.minY + bounds.maxY) / 2);
  scene.add(ground);

  data.roads.forEach(makeRoad);
  data.buildings.forEach((b, i) => makeBuilding(b, i, data));
  for (const b of data.buildings) buildingGrid.insert(boxOf(b.footprint), b);
  for (const w of walls) wallGrid.insert(wallBox(w), w);

  const streetDetails = addStreetDetails(scene, data.roads, data.buildings, data.spawn, data.entrance);
  const sign = document.createElement('div'); sign.textContent = '入口示意'; sign.className = 'entrance-label'; document.querySelector('#app')!.appendChild(sign);
  const updateSign = () => {
    const p = point(block.entrance, 3).project(camera);
    sign.style.left = `${(p.x + 1) * innerWidth / 2}px`;
    sign.style.top = `${(-p.y + 1) * innerHeight / 2}px`;
    requestAnimationFrame(updateSign);
  };
  updateSign();
  status.textContent = '建築高度為模型推估、暫按米解讀；道路寬度、入口及街景細節為示意。部分道路與建築重疊。';
  if (debug) {
    (window as unknown as { __shanghai: unknown }).__shanghai = {
      state: () => ({ url: dataUrl, loadMs, fps,
        position: [...pos], spawn: block.spawn, entrance: block.entrance, entranceBuilding: block.entrance_building,
        inside: renderBuildings.filter(r => insideBuilding(pos, r.building)).map(r => r.building.id),
        hiddenRoofs: renderBuildings.filter(r => !r.roof.visible).map(r => r.building.id),
        hiddenFacades: renderBuildings.filter(r => !r.facade.visible).map(r => r.building.id),
        occluding: occludingBuildings(pos).map(r => r.id),
        camera: camera.position.toArray(), roadCount: block.roads.length, buildingCount: block.buildings.length,
        bounds, viewSize,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        streetDetails: streetDetails.counts,
        facadeCount: renderBuildings.filter(r => r.facade.children.length > 0).length }),
      moveTo: (p: Point) => { pos = [...p]; frame(0); },
      blocked: (p: Point) => blocked(p),
    };
  }
  animate();
}).catch(err => { status.textContent = `無法載入場景：${String(err)}`; console.error(err); });
