/** Old-town Shanghai row houses for the lane fabric (lane-fabric.ts): small grey-tile gable roofs with
 * ridge caps, fire-wall gables, tiger windows (老虎窗) and roof terraces (曬台); lime-plaster or grey/red
 * brick walls; wooden or aluminium windows with steel grille cages, AC units and bamboo laundry poles;
 * plank-shutter or roller-shutter shops with simplified-Chinese boards, stone-framed shikumen doors and
 * blue house-number plates. Every house is batched into a handful of meshes and fades with its own
 * row when it hides the player, like the CMAB city (city-visibility.ts). Original procedural art. */
import * as THREE from 'three';
import { buildingOccludesPlayer } from './occlusion.ts';
import { hash01, type LaneHouse } from './lane-fabric.ts';

type V3 = [number, number, number];
type UV = [number, number];
type Batch = { p: number[]; c: number[]; uv: number[] };
const batch = (): Batch => ({ p: [], c: [], uv: [] });
const tmp = new THREE.Color();
function tri(out: Batch, a: V3, b: V3, c: V3, color: number, uv?: [UV, UV, UV]) {
  tmp.setHex(color);
  for (const [i, v] of [a, b, c].entries()) {
    out.p.push(v[0], v[1], v[2]);
    out.c.push(tmp.r, tmp.g, tmp.b);
    if (uv) out.uv.push(uv[i][0], uv[i][1]);
  }
}
function quad(out: Batch, a: V3, b: V3, c: V3, d: V3, color: number, uv?: [UV, UV, UV, UV]) {
  tri(out, a, b, c, color, uv && [uv[0], uv[1], uv[2]]);
  tri(out, a, c, d, color, uv && [uv[0], uv[2], uv[3]]);
}
const shade = (color: number, k: number) => tmp.setHex(color).multiplyScalar(k).getHex();
const pick = <T>(list: readonly T[], h: number): T => list[Math.min(list.length - 1, Math.floor(h * list.length))];

const PITCH = Math.tan((26 * Math.PI) / 180);
const PLASTER = [0xcbc4b4, 0xbdb7a8, 0xb2ab9b, 0xc6baa1, 0xb9b2a5] as const; // lime plaster, aged
const BRICK = [0x7f817e, 0x77797a, 0x8b5c4a, 0x93644f] as const;
const ROOF = [0x4c4f51, 0x56595a, 0x434749, 0x5d5f5d, 0x4a4b49] as const;
const WOOD = [0x5b2f25, 0x34493a, 0x4b3a2b, 0x6a3b2a] as const;
const CLOTHES = [0xc0392b, 0x2e5fa8, 0xe8e6e0, 0xd98aa0, 0xd8b13a, 0x7b7f86, 0x3d7a5a, 0xf0ece4, 0x8e3b62] as const;
export const SHOP_SIGNS = [
  '烟纸店', '南货店', '理发店', '生煎馒头', '小馄饨', '粮油店', '五金交电', '修车铺', '修鞋配钥匙', '老虎灶',
  '酱油店', '水果店', '早点', '面馆', '裁缝店', '日用百货', '杂货铺', '熟食店', '茶叶店', '中药铺',
  '照相馆', '棋牌室', '钟表修理', '布店', '糕团店', '冷饮', '小吃', '报刊亭',
] as const;
const SIGN_BG = [0x9b2d24, 0x234e8c, 0x2e6b46, 0x5a3a24, 0xe9e4d6] as const;

// ---------------------------------------------------------------- textures (Node-safe)

const hasDom = typeof document !== 'undefined';
let tileTexture: THREE.Texture | null = null;
/** 小青瓦: rows of small grey tiles running down the slope; one repeat covers 1.6 m × 1.6 m. */
export function tiles() {
  if (tileTexture || !hasDom) return tileTexture;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#6a6d6e';
  g.fillRect(0, 0, 256, 256);
  const cols = 10, cw = 256 / cols, rows = 16, rh = 256 / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = c * cw, y = r * rh + (c % 2) * rh * 0.5;
      const v = 0.82 + 0.3 * Math.abs(Math.sin(c * 12.9898 + r * 78.233));
      const grad = g.createLinearGradient(0, y, 0, y + rh);
      grad.addColorStop(0, `rgba(${200 * v},${204 * v},${206 * v},1)`);
      grad.addColorStop(0.7, `rgba(${150 * v},${154 * v},${156 * v},1)`);
      grad.addColorStop(1, `rgba(${70 * v},${72 * v},${74 * v},1)`);
      g.fillStyle = grad;
      for (const dy of [0, -256, 256]) {
        g.beginPath();
        g.ellipse(x + cw / 2, y + rh / 2 + dy, cw * 0.47, rh * 0.62, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // the dark channel between tile rows
    g.fillStyle = 'rgba(30,32,33,.55)';
    g.fillRect(c * cw - 1, 0, 2, 256);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(70,90,50,.18)' : 'rgba(20,20,20,.12)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 1 + Math.random() * 3);
  }
  tileTexture = new THREE.CanvasTexture(cv);
  tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping;
  tileTexture.colorSpace = THREE.SRGBColorSpace;
  tileTexture.anisotropy = 4;
  return tileTexture;
}

/** One atlas for every board and plate: 8 × 32 cells of 128 × 32 px. */
export type SignAtlas = { texture: THREE.Texture | null; cell: (key: string) => [number, number, number, number] | null };
export function buildSignAtlas(roadNames: string[]): SignAtlas {
  const keys: Array<{ key: string; text: string; bg: string; fg: string; plate: boolean }> = [];
  SHOP_SIGNS.forEach((name, i) => {
    const bg = SIGN_BG[i % SIGN_BG.length];
    keys.push({ key: 'shop:' + name, text: name, bg: '#' + bg.toString(16).padStart(6, '0'), fg: bg === 0xe9e4d6 ? '#a1281e' : i % 3 === 0 ? '#f0d58a' : '#f4f1e8', plate: false });
  });
  for (let n = 1; n <= 160; n++) keys.push({ key: 'no:' + n, text: n + '号', bg: '#1f4f9a', fg: '#ffffff', plate: true });
  for (const name of [...new Set(roadNames)].slice(0, 256 - keys.length)) keys.push({ key: 'road:' + name, text: name, bg: '#1f4f9a', fg: '#ffffff', plate: true });
  const index = new Map(keys.map((k, i) => [k.key, i]));
  let texture: THREE.Texture | null = null;
  if (hasDom) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1024;
    const g = cv.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    keys.forEach((k, i) => {
      const x = (i % 8) * 128, y = Math.floor(i / 8) * 32;
      g.fillStyle = k.bg;
      g.fillRect(x + 1, y + 1, 126, 30);
      if (k.plate) {
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.lineWidth = 2;
        g.strokeRect(x + 4, y + 4, 120, 24);
      }
      g.fillStyle = k.fg;
      const size = Math.min(24, Math.floor(118 / Math.max(2, [...k.text].length)));
      g.font = `bold ${size}px "PingFang SC","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei","WenQuanYi Zen Hei",sans-serif`;
      g.fillText(k.text, x + 64, y + 17, 120);
    });
    texture = new THREE.CanvasTexture(cv);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }
  return {
    texture,
    cell: key => {
      const i = index.get(key);
      if (i === undefined) return null;
      const u0 = (i % 8) / 8, v1 = 1 - Math.floor(i / 8) / 32;
      return [u0 + 0.002, v1 - 1 / 32 + 0.002, u0 + 1 / 8 - 0.002, v1 - 0.002];
    },
  };
}

// ---------------------------------------------------------------- one row of houses

export type LaneHouseGeometry = { walls: Batch; roof: Batch; signs: Batch };
type Numbering = Map<string, number>;

export function laneHouseGeometry(house: LaneHouse, atlas: SignAtlas, numbering: Numbering): LaneHouseGeometry {
  const walls = batch(), roof = batch(), signs = batch();
  const fp = house.footprint, O = fp[0];
  const L = Math.hypot(fp[1][0] - O[0], fp[1][1] - O[1]);
  const u: [number, number] = [(fp[1][0] - O[0]) / L, (fp[1][1] - O[1]) / L];
  const dl = Math.hypot(fp[3][0] - O[0], fp[3][1] - O[1]);
  const n: [number, number] = [(fp[3][0] - O[0]) / dl, (fp[3][1] - O[1]) / dl];
  const D = house.lane.depth, kind = house.lane.kind;
  const P = (s: number, d: number, y: number): V3 => [O[0] + u[0] * s + n[0] * d, y, -(O[1] + u[1] * s + n[1] * d)];
  const H = (k: string) => hash01(house.id + ':' + k);
  /** axis-aligned box in the row frame */
  const box = (out: Batch, s0: number, s1: number, d0: number, d1: number, y0: number, y1: number, color: number, top = true) => {
    const c = [P(s0, d0, y0), P(s1, d0, y0), P(s1, d1, y0), P(s0, d1, y0)], t = c.map(v => [v[0], y1, v[2]] as V3);
    quad(out, c[0], c[1], t[1], t[0], color);
    quad(out, c[1], c[2], t[2], t[1], shade(color, 0.86));
    quad(out, c[2], c[3], t[3], t[2], color);
    quad(out, c[3], c[0], t[0], t[3], shade(color, 0.86));
    if (top) quad(out, t[0], t[1], t[2], t[3], shade(color, 1.08));
  };
  /** flat panel parallel to the front (d < 0) or back (d > D) wall */
  const panel = (out: Batch, s0: number, s1: number, y0: number, y1: number, d: number, color: number) =>
    quad(out, P(s0, d, y0), P(s1, d, y0), P(s1, d, y1), P(s0, d, y1), color);
  const signFace = (key: string, s0: number, s1: number, y0: number, y1: number, d: number) => {
    const cell = atlas.cell(key);
    if (!cell) return;
    const [ua, va, ub, vb] = cell;
    // the front faces −n; mirror u so text reads left-to-right from the street
    quad(signs, P(s1, d, y0), P(s0, d, y0), P(s0, d, y1), P(s1, d, y1), 0xffffff, [[ua, va], [ub, va], [ub, vb], [ua, vb]]);
  };
  const side = house.id.includes(':L:') ? 'L' : 'R';
  const rise = PITCH * (D / 2);
  const units = house.lane.units;
  const starts: number[] = [];
  units.reduce((s, w) => (starts.push(s), s + w), 0);
  const uniform = kind === 'lane' && H('uniform') < 0.6; // shikumen lanes: one builder, one height
  const eaves = units.map((_, k) => house.lane.floors[k] * 2.95 + 0.35 + (uniform ? 0 : (H('e' + k) - 0.5) * 0.4));
  const brickRow = H('brick') < (kind === 'lane' ? 0.55 : 0.35);
  const rowWall = brickRow ? pick(BRICK, H('wall')) : pick(PLASTER, H('wall'));

  units.forEach((w, k) => {
    const S = starts[k], E = eaves[k], f = house.lane.floors[k], shop = house.lane.shop[k];
    const hk = (t: string) => H(k + t);
    const wall = uniform ? rowWall : hk('brick') < 0.25 ? pick(BRICK, hk('bc')) : pick(PLASTER, hk('wc'));
    const plinth = shade(wall, 0.72);
    // ---- walls (front and back), weathering under the eaves and a cement plinth
    for (const d of [0, D]) {
      quad(walls, P(S, d, 0), P(S + w, d, 0), P(S + w, d, E), P(S, d, E), wall);
      const off = d === 0 ? -0.012 : D + 0.012;
      panel(walls, S, S + w, 0, 0.45, off, plinth);
      panel(walls, S, S + w, E - 0.32, E, off, shade(wall, 0.84));
      if (hk('streak' + d) < 0.5) panel(walls, S + w * (0.2 + 0.5 * hk('sx' + d)), S + w * (0.3 + 0.5 * hk('sx' + d)), E * 0.35, E - 0.32, off, shade(wall, 0.9));
    }
    // ---- step walls where neighbouring houses differ in height
    if (k > 0 && Math.abs(E - eaves[k - 1]) > 0.04) {
      const lo = Math.min(E, eaves[k - 1]), hi = Math.max(E, eaves[k - 1]);
      for (const [d0, d1] of [[0, D / 2], [D / 2, D]]) {
        const y = (d: number) => (d <= D / 2 ? d : D - d) * PITCH;
        quad(walls, P(S, d0, lo + y(d0)), P(S, d1, lo + y(d1)), P(S, d1, hi + y(d1)), P(S, d0, hi + y(d0)), wall);
      }
    }
    // ---- gable ends of the row, some as raised fire walls with a dark tile coping
    for (const end of [k === 0 ? 0 : -1, k === units.length - 1 ? S + w : -1]) {
      if (end < 0) continue;
      quad(walls, P(end, 0, 0), P(end, D, 0), P(end, D, E), P(end, 0, E), wall);
      const fire = H('fire' + end) < 0.45, up = fire ? 0.45 : 0.05;
      tri(walls, P(end, 0, E), P(end, D, E), P(end, D / 2, E + rise + up), wall);
      if (fire) {
        const out = end === 0 ? -0.12 : 0.12;
        for (const [d0, d1] of [[-0.15, D / 2], [D / 2, D + 0.15]]) {
          const y = (d: number) => E + up + Math.min(d + 0.15, D + 0.15 - d) * ((rise + 0.15) / (D / 2 + 0.15));
          quad(walls, P(end - out, d0, y(d0)), P(end - out, d1, y(d1)), P(end + out * 0.2, d1, y(d1) + 0.12), P(end + out * 0.2, d0, y(d0) + 0.12), 0x2f3233);
        }
      }
    }
    // ---- roof: two tiled slopes with eave overhang, ridge cap and fascia
    const ov = 0.38, sl = k === 0 ? -0.12 : 0, sr = k === units.length - 1 ? 0.12 : 0;
    const tone = hk('red') < 0.07 ? 0x8b5a46 : pick(ROOF, hk('roof'));
    const slope = Math.hypot(D / 2 + ov, rise + ov * PITCH);
    const uvA = (S + sl) / 1.6, uvB = (S + w + sr) / 1.6, uvS = slope / 1.6;
    quad(roof, P(S + sl, -ov, E - ov * PITCH), P(S + w + sr, -ov, E - ov * PITCH), P(S + w + sr, D / 2, E + rise), P(S + sl, D / 2, E + rise), tone,
      [[uvA, 0], [uvB, 0], [uvB, uvS], [uvA, uvS]]);
    quad(roof, P(S + sl, D + ov, E - ov * PITCH), P(S + w + sr, D + ov, E - ov * PITCH), P(S + w + sr, D / 2, E + rise), P(S + sl, D / 2, E + rise), tone,
      [[uvA, 0], [uvB, 0], [uvB, uvS], [uvA, uvS]]);
    box(walls, S + sl, S + w + sr, D / 2 - 0.1, D / 2 + 0.1, E + rise - 0.02, E + rise + 0.11, 0x2e3133);
    for (const d of [-ov, D + ov]) panel(walls, S + sl, S + w + sr, E - ov * PITCH - 0.1, E - ov * PITCH, d, 0x3a3d3e);
    if (hk('tin') < 0.05) {
      // a small corrugated iron patch over a leak: rusty or faded grey-blue
      const c = hk('tc') < 0.7 ? 0x7a5540 : 0x66737a, s0 = S + w * 0.35, s1 = S + w * 0.7, d0 = D * 0.6, d1 = D * 0.8;
      const y = (d: number) => E + rise - (d - D / 2) * PITCH + 0.05;
      quad(walls, P(s0, d0, y(d0)), P(s1, d0, y(d0)), P(s1, d1, y(d1)), P(s0, d1, y(d1)), c);
    }

    // ---- tiger window (老虎窗) on the front slope, or a roof terrace (曬台) on the back
    const dormer = D >= 7 && w >= 3.6 && hk('dormer') < (uniform ? 0.55 : 0.35);
    if (dormer) {
      // A box rising out of the front slope under a small level-ridged gable that runs back into the roof.
      const sc = S + w / 2, hw = 0.66, d0 = Math.max(1.1, D * 0.15), y0 = E + d0 * PITCH, h = 1.0;
      const ye = y0 + h - 0.04, yr = ye + 0.34, W2 = hw + 0.12;
      const de = (ye - E) / PITCH, dr = Math.min(D / 2 - 0.05, (yr - E) / PITCH), ext = 0.16;
      quad(walls, P(sc - hw, d0, y0 - 0.05), P(sc + hw, d0, y0 - 0.05), P(sc + hw, d0, ye), P(sc - hw, d0, ye), wall);
      tri(walls, P(sc - W2, d0 - 0.01, ye), P(sc + W2, d0 - 0.01, ye), P(sc, d0 - 0.01, yr), wall);
      for (const s of [sc - hw, sc + hw]) tri(walls, P(s, d0, y0 - 0.05), P(s, d0, ye), P(s, de, ye), shade(wall, 0.85));
      panel(walls, sc - 0.42, sc + 0.42, y0 + 0.16, y0 + 0.86, d0 - 0.02, pick(WOOD, hk('dw')));
      panel(walls, sc - 0.34, sc + 0.34, y0 + 0.23, y0 + 0.8, d0 - 0.03, 0x34424b);
      panel(walls, sc - 0.02, sc + 0.02, y0 + 0.23, y0 + 0.8, d0 - 0.035, pick(WOOD, hk('dw')));
      for (const sgn of [-1, 1]) {
        const len = (dr - d0 + ext) / 1.6, wid = W2 / 1.6;
        quad(roof, P(sc, d0 - ext, yr), P(sc, dr, yr), P(sc + sgn * W2, de, ye), P(sc + sgn * W2, d0 - ext, ye), tone,
          [[0, wid], [len, wid], [len, 0], [0, 0]]);
      }
      box(walls, sc - 0.06, sc + 0.06, d0 - ext, dr, yr - 0.02, yr + 0.08, 0x2e3133);
    } else if (hk('terrace') < 0.24) {
      const s0 = S + 0.25, s1 = S + w - 0.25, d0 = D / 2 + 0.25, d1 = D - 0.2, yt = E + rise * 0.35;
      box(walls, s0, s1, d0, d1, E - 0.2, yt, wall, false);
      quad(walls, P(s0, d0, yt), P(s1, d0, yt), P(s1, d1, yt), P(s0, d1, yt), 0xa6a49a);
      for (const [a0, b0] of [[s0, s1]]) {
        panel(walls, a0, b0, yt, yt + 0.95, d1, 0x60625f); // back railing as a low parapet
        for (const s of [a0, b0]) quad(walls, P(s, d0, yt), P(s, d1, yt), P(s, d1, yt + 0.95), P(s, d0, yt + 0.95), 0x60625f);
      }
      // two laundry lines with clothes
      for (const dd of [d0 + (d1 - d0) * 0.33, d0 + (d1 - d0) * 0.7]) {
        box(walls, s0 + 0.05, s1 - 0.05, dd - 0.015, dd + 0.015, yt + 1.6, yt + 1.63, 0x9a8f6a, false);
        for (let i = 0, s = s0 + 0.25; s < s1 - 0.5 && i < 4; i++, s += 0.55) {
          const c = pick(CLOTHES, hk('t' + dd + i));
          quad(walls, P(s, dd, yt + 1.6), P(s + 0.42, dd, yt + 1.6), P(s + 0.42, dd, yt + 1.0 + 0.2 * hk('tl' + i)), P(s, dd, yt + 1.0 + 0.2 * hk('tl' + i)), c);
        }
      }
    }
    if (hk('chimney') < 0.12) box(walls, S + w * 0.7, S + w * 0.7 + 0.4, D * 0.62, D * 0.62 + 0.4, E + rise * 0.8, E + rise + 0.6, 0x6e6b63);

    // ---- ground floor: shop or door
    const fd = -0.02;
    const number = (numbering.get(house.lane.road + side) ?? (side === 'L' ? 1 : 2));
    numbering.set(house.lane.road + side, number + 2);
    if (shop) {
      const o0 = S + 0.22, o1 = S + w - 0.22;
      panel(walls, o0, o1, 0.05, 2.7, fd, 0x221c17);
      if (hk('shutter') < 0.55) {
        // 排門板: wooden shutter boards, some taken down for business
        const open = hk('open') * 0.6;
        for (let s = o0, i = 0; s < o1 - 0.05; s += 0.28, i++) {
          if ((s - o0) / (o1 - o0) > 0.2 && (s - o0) / (o1 - o0) < 0.2 + open) continue;
          panel(walls, s + 0.01, Math.min(o1, s + 0.27), 0.05, 2.62, fd - 0.02, i % 2 ? 0x6e4b31 : 0x5d3f2a);
        }
      } else {
        const top = 2.7 - (hk('up') < 0.5 ? 2.6 : 1.3 * hk('half'));
        panel(walls, o0, o1, top, 2.7, fd - 0.02, 0x8f9391);
        for (let y = top + 0.12; y < 2.7; y += 0.16) panel(walls, o0, o1, y, y + 0.025, fd - 0.025, 0x6e7270);
      }
      // signboard
      const sign = pick(SHOP_SIGNS, hk('sign'));
      box(walls, o0 + 0.05, o1 - 0.05, -0.14, 0, 2.78, 3.4, 0x3b3330);
      signFace('shop:' + sign, o0 + 0.1, o1 - 0.1, 2.82, 3.36, -0.145);
      if (hk('awning') < 0.4) {
        const stripes = hk('aw') < 0.5 ? [0xb03a2e, 0xe8e2d6] : [0x2f5d9a, 0xe8e2d6];
        const segs = 6;
        for (let i = 0; i < segs; i++) {
          const a0 = o0 + ((o1 - o0) * i) / segs, a1 = o0 + ((o1 - o0) * (i + 1)) / segs;
          quad(walls, P(a0, 0, 2.74), P(a1, 0, 2.74), P(a1, -0.9, 2.42), P(a0, -0.9, 2.42), stripes[i % 2]);
        }
      }
      // a stool and a crate on the pavement
      if (hk('stool') < 0.35) box(walls, S + w * 0.5, S + w * 0.5 + 0.32, -0.75, -0.43, 0, 0.42, 0x8d6a44);
    } else {
      const shikumen = kind === 'lane' ? hk('gate') < 0.75 : hk('gate') < 0.25;
      const dc = S + w * (0.4 + 0.2 * hk('dpos'));
      if (shikumen) {
        // stone frame, black lacquered double door, bronze knockers and a carved lintel
        panel(walls, dc - 0.82, dc + 0.82, 0, 2.78, fd, 0xbab4a5);
        panel(walls, dc - 0.6, dc + 0.6, 0, 2.48, fd - 0.02, 0x1b1b1c);
        panel(walls, dc - 0.012, dc + 0.012, 0, 2.48, fd - 0.025, 0x3a3a3a);
        for (const s of [dc - 0.12, dc + 0.08]) panel(walls, s, s + 0.04, 1.3, 1.36, fd - 0.03, 0xb48c3e);
        box(walls, dc - 0.98, dc + 0.98, -0.18, 0, 2.78, 3.18, 0xb3ad9d);
        if (hk('ped') < 0.5) tri(walls, P(dc - 0.98, -0.18, 3.18), P(dc + 0.98, -0.18, 3.18), P(dc, -0.18, 3.62), 0xb3ad9d);
        else box(walls, dc - 0.7, dc + 0.7, -0.2, 0, 3.18, 3.5, 0xa9a393);
      } else {
        panel(walls, dc - 0.55, dc + 0.55, 0, 2.2, fd, 0x4a3324);
        panel(walls, dc - 0.45, dc + 0.45, 0, 2.1, fd - 0.02, pick([0x6b3f2a, 0x3b4f45, 0x5a2f26], hk('dcol')));
        quad(walls, P(dc - 0.75, 0, 2.45), P(dc + 0.75, 0, 2.45), P(dc + 0.75, -0.6, 2.25), P(dc - 0.75, -0.6, 2.25), 0x7c8a8a);
      }
      // blue house-number plate beside the door
      signFace('no:' + Math.min(160, number), dc + 0.95, dc + 1.27, 1.9, 2.06, fd - 0.04);
      // ground-floor window with a grille cage
      if (w >= 3.6) {
        const wc = dc < S + w / 2 ? S + w - 0.85 : S + 0.85;
        window(wc, 0.95, 1.0, 1.15, true);
      }
    }

    // ---- upper floors: windows, cages, AC units, laundry poles
    for (let fl = 1; fl < f; fl++) {
      const y0 = 0.35 + fl * 2.95 + 0.85;
      const pair = w >= 4.1;
      const centres = pair ? [S + w * 0.28, S + w * 0.72] : [S + w / 2 + (hk('wx' + fl) - 0.5) * 0.4];
      for (const [i, c] of centres.entries()) window(c, pair ? 0.95 : 1.15, y0, 1.3, hk('cage' + fl + i) < (fl === 1 ? 0.45 : 0.3));
      if (fl === f - 1 && hk('ac') < 0.38) {
        const s = centres[0] + (pair ? 0.75 : 0.95) * (hk('acs') < 0.5 ? -1 : 1);
        box(walls, s - 0.38, s + 0.38, -0.36, -0.04, y0 - 0.75, y0 - 0.2, 0xdedfdb);
        panel(walls, s - 0.28, s + 0.08, y0 - 0.68, y0 - 0.28, -0.365, 0x55595a);
      }
      if (hk('pole' + fl) < 0.38) {
        const s = centres[centres.length - 1] + 0.3, yp = y0 + 1.42, len = 1.25 + 0.4 * hk('pl' + fl);
        box(walls, s - 0.02, s + 0.02, -len, 0, yp - 0.02, yp + 0.02, hk('bam' + fl) < 0.6 ? 0xb59a5c : 0x9aa0a0, false);
        for (let i = 0, d = -0.25; d > -len + 0.15 && i < 4; i++, d -= 0.36) {
          const c = pick(CLOTHES, hk('c' + fl + i)), h = 0.45 + 0.4 * hk('ch' + fl + i);
          quad(walls, P(s, d, yp), P(s, d - 0.3, yp), P(s, d - 0.3, yp - h), P(s, d, yp - h), c);
        }
      }
    }
    // ---- back: one window per floor, a back door
    for (let fl = 0; fl < f; fl++) {
      const y0 = fl === 0 ? 1.0 : 0.35 + fl * 2.95 + 0.85, c = S + w * (0.3 + 0.4 * hk('bx' + fl));
      panel(walls, c - 0.5, c + 0.5, y0, y0 + 1.15, D + 0.02, pick(WOOD, hk('bw')));
      panel(walls, c - 0.42, c + 0.42, y0 + 0.07, y0 + 1.08, D + 0.03, 0x33414a);
    }
    if (hk('bdoor') < 0.6) panel(walls, S + w * 0.7, S + w * 0.7 + 0.8, 0, 2.05, D + 0.02, 0x4b3a2c);

    function window(c: number, ww: number, y0: number, h: number, cage: boolean) {
      const alu = hk('alu' + y0) < (kind === 'main' ? 0.45 : 0.25);
      const frame = alu ? 0xc6cac6 : pick(WOOD, hk('wood'));
      panel(walls, c - ww / 2 - 0.07, c + ww / 2 + 0.07, y0 - 0.07, y0 + h + 0.07, -0.02, frame);
      panel(walls, c - ww / 2, c + ww / 2, y0, y0 + h, -0.03, hk('lit' + y0 + c) < 0.15 ? 0x6d6a55 : 0x34424b);
      panel(walls, c - 0.025, c + 0.025, y0, y0 + h, -0.035, frame);
      if (!alu) panel(walls, c - ww / 2, c + ww / 2, y0 + h * 0.68, y0 + h * 0.68 + 0.05, -0.035, frame);
      box(walls, c - ww / 2 - 0.1, c + ww / 2 + 0.1, -0.12, 0, y0 - 0.16, y0 - 0.07, shade(wall, 1.05));
      if (cage) {
        const g = hk('galv' + y0) < 0.5 ? 0x8e9290 : 0x6f665c, dd = -0.34, x0 = c - ww / 2 - 0.08, x1 = c + ww / 2 + 0.08, yb = y0 - 0.1, yt = y0 + h + 0.12;
        for (let i = 0; i <= 4; i++) {
          const s = x0 + ((x1 - x0) * i) / 4;
          panel(walls, s - 0.012, s + 0.012, yb, yt, dd, g);
        }
        for (const y of [yb, yb + (yt - yb) * 0.5, yt]) panel(walls, x0, x1, y - 0.012, y + 0.012, dd, g);
        quad(walls, P(x0, 0, yt), P(x1, 0, yt), P(x1, dd, yt), P(x0, dd, yt), shade(g, 0.9));
        for (const s of [x0, x1]) quad(walls, P(s, 0, yb), P(s, dd, yb), P(s, dd, yt), P(s, 0, yt), shade(g, 0.8));
        if (hk('plant' + y0) < 0.4) box(walls, x0 + 0.1, x0 + 0.45, dd + 0.02, -0.05, yt, yt + 0.25, 0x5c7d46);
      }
    }
  });
  // lane entrance plate with the road name on the first house of a named lane row
  if (house.lane.name && H('plate') < 0.35) {
    const s = 0.3;
    signFace('road:' + house.lane.name, s, s + 0.9, 2.9, 3.18, -0.05);
  }
  return { walls, roof, signs };
}

// ---------------------------------------------------------------- batched, occlusion-aware rendering

type Range = { id: string; house: LaneHouse; w: [number, number]; r: [number, number]; s: [number, number]; minX: number; maxX: number; minZ: number; maxZ: number };

export function createLaneVisibility(houses: LaneHouse[], roadNames: string[]) {
  const atlas = buildSignAtlas(roadNames);
  const W = batch(), R = batch(), Sg = batch(), ranges: Range[] = [];
  const numbering: Numbering = new Map();
  for (const house of houses) {
    const g = laneHouseGeometry(house, atlas, numbering);
    const w0 = W.p.length / 3, r0 = R.p.length / 3, s0 = Sg.p.length / 3;
    for (const [to, from] of [[W, g.walls], [R, g.roof], [Sg, g.signs]] as const) {
      to.p.push(...from.p);
      to.c.push(...from.c);
      to.uv.push(...from.uv);
    }
    const xs = house.footprint.map(p => p[0]), zs = house.footprint.map(p => p[1]);
    ranges.push({
      id: house.id, house, w: [w0, W.p.length / 3], r: [r0, R.p.length / 3], s: [s0, Sg.p.length / 3],
      minX: Math.min(...xs) - 1, maxX: Math.max(...xs) + 1, minZ: Math.min(...zs) - 1, maxZ: Math.max(...zs) + 1,
    });
  }
  const make = (b: Batch, uv: boolean) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const index = new THREE.BufferAttribute(new Uint32Array(b.p.length / 3), 1).setUsage(THREE.DynamicDrawUsage);
    g.setIndex(index);
    return g;
  };
  const wallGeometry = make(W, false), roofGeometry = make(R, true), signGeometry = make(Sg, true);
  const fadedGeometry = new THREE.BufferGeometry();
  for (const k of ['position', 'color', 'normal']) fadedGeometry.setAttribute(k, wallGeometry.getAttribute(k));
  fadedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(W.p.length / 3), 1).setUsage(THREE.DynamicDrawUsage));
  fadedGeometry.computeBoundingSphere();
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const fadedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.18, depthWrite: false });
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, map: tiles() });
  const signMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, map: atlas.texture });
  const group = new THREE.Group();
  group.name = 'laoximen-lane-houses';
  const solid = new THREE.Mesh(wallGeometry, wallMat), faded = new THREE.Mesh(fadedGeometry, fadedMat), roofs = new THREE.Mesh(roofGeometry, roofMat), boards = new THREE.Mesh(signGeometry, signMat);
  solid.name = 'lane-walls';
  faded.name = 'lane-occluding-walls';
  roofs.name = 'lane-roofs';
  boards.name = 'lane-signs';
  group.add(solid, roofs, boards, faded);
  let lastKey: string | null = null, lastX = NaN, lastZ = NaN, lastFocus: ReadonlyArray<readonly [number, number]> | undefined;
  let fadedIds: string[] = [];
  function update(x: number, z: number, focus?: ReadonlyArray<readonly [number, number]>) {
    if (x === lastX && z === lastZ && focus === lastFocus) return false;
    lastX = x;
    lastZ = z;
    lastFocus = focus;
    const hidden = new Set<string>();
    for (const r of ranges) {
      const blocks = (px: number, pz: number) => !(r.maxX < px || r.minX > px + 40 || r.maxZ < pz - 40 || r.minZ > pz) && buildingOccludesPlayer(r.house, px, pz);
      if (blocks(x, z) || focus?.some(p => blocks(p[0], p[1]))) hidden.add(r.id);
    }
    const key = [...hidden].join('|');
    if (key === lastKey) return false;
    lastKey = key;
    fadedIds = [...hidden];
    const wi = wallGeometry.index!.array as Uint32Array, gi = fadedGeometry.index!.array as Uint32Array, ri = roofGeometry.index!.array as Uint32Array, si = signGeometry.index!.array as Uint32Array;
    let nw = 0, ng = 0, nr = 0, ns = 0;
    for (const r of ranges) {
      const occluded = hidden.has(r.id);
      for (let i = r.w[0]; i < r.w[1]; i++) if (occluded) gi[ng++] = i; else wi[nw++] = i;
      if (occluded) continue;
      for (let i = r.r[0]; i < r.r[1]; i++) ri[nr++] = i;
      for (let i = r.s[0]; i < r.s[1]; i++) si[ns++] = i;
    }
    for (const [g, count] of [[wallGeometry, nw], [fadedGeometry, ng], [roofGeometry, nr], [signGeometry, ns]] as const) {
      g.setDrawRange(0, count);
      g.index!.needsUpdate = true;
    }
    return true;
  }
  update(-Infinity, Infinity);
  return {
    group,
    atlas,
    update,
    fadedIds: () => [...fadedIds],
    stats: () => ({ houses: houses.length, units: houses.reduce((a, h) => a + h.lane.units.length, 0), wallTriangles: W.p.length / 9, roofTriangles: R.p.length / 9, signTriangles: Sg.p.length / 9, meshes: 4 }),
    dispose: () => {
      for (const g of [wallGeometry, fadedGeometry, roofGeometry, signGeometry]) g.dispose();
      for (const m of [wallMat, fadedMat, roofMat, signMat]) m.dispose();
    },
  };
}
