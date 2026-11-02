/** Shanghai roster: twelve playable survivors, six women and six men.
 *
 * Every character uses the DefendTaipei mannequin rig (human.ts), so the same
 * procedural animator drives all of them. Nothing here is a scanned asset and
 * no occupation is tied to a real employer: the trades are the ones you would
 * actually meet in an old lane-quarter like 老西門 — a night guard, a delivery
 * rider, a hardware-shop owner, a community nurse, a breakfast-stall keeper.
 */
import * as THREE from 'three';
import { makeRig, type Rig, type RigOpts } from './human.ts';

export type CharSpec = {
  id: string;
  name: string;
  sex: 'f' | 'm';
  job: string;
  blurb: string;
  height: number;      // metres
  build: number;       // shoulder width multiplier
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  accent: number;
  /** Extra silhouette cue: apron, vest, helmet, bag. */
  gear?: 'apron' | 'vest' | 'helmet' | 'bag' | 'coat' | 'cap';
};

export const ROSTER: CharSpec[] = [
  { id: 'guard', name: '老周', sex: 'm', job: '夜班保全', height: 1.76, build: 1.08,
    blurb: '守了十二年大門，第一次守不住。', skin: 0xc6a07a, hair: 0x2a2622,
    top: 0x2b3a4a, bottom: 0x1d2733, accent: 0xd9c26a, gear: 'vest' },
  { id: 'rider', name: '阿凱', sex: 'm', job: '外賣騎手', height: 1.72, build: 0.96,
    blurb: '這座城市的路線他閉著眼都認得。', skin: 0xbf9064, hair: 0x1b1b1b,
    top: 0xd8a521, bottom: 0x2c2f33, accent: 0x1b1b1b, gear: 'helmet' },
  { id: 'hardware', name: '陳師傅', sex: 'm', job: '五金行老闆', height: 1.68, build: 1.12,
    blurb: '整條街的工具都在他店裡。', skin: 0xb98a5e, hair: 0x3a3330,
    top: 0x55606b, bottom: 0x3b3f44, accent: 0x6f5a3a, gear: 'apron' },
  { id: 'nurse', name: '小林', sex: 'f', job: '社區護士', height: 1.62, build: 0.92,
    blurb: '衛生中心的值班表還貼在牆上。', skin: 0xe0c3a4, hair: 0x201d1c,
    top: 0xe8e6e0, bottom: 0x9fb6c2, accent: 0x6f8fa3, gear: 'coat' },
  { id: 'teacher', name: '吳老師', sex: 'f', job: '小學老師', height: 1.6, build: 0.9,
    blurb: '點名簿上有三十二個名字。', skin: 0xe6cbb0, hair: 0x2d2521,
    top: 0xc9b79a, bottom: 0x4a4f57, accent: 0x8c6f4e, gear: 'bag' },
  { id: 'stall', name: '蔡阿姨', sex: 'f', job: '早點攤主', height: 1.55, build: 1.04,
    blurb: '四點半出攤，風雨無阻。', skin: 0xcf9f74, hair: 0x4a4038,
    top: 0xd9d2c2, bottom: 0x3d4650, accent: 0x8f3f34, gear: 'apron' },
  { id: 'driver', name: '大李', sex: 'm', job: '公車司機', height: 1.78, build: 1.1,
    blurb: '開十七路，跑過這城每一條街。', skin: 0xc08f63, hair: 0x24211f,
    top: 0x3e5a6b, bottom: 0x2a333c, accent: 0xe0d8c0, gear: 'cap' },
  { id: 'barber', name: '小方', sex: 'f', job: '理髮師', height: 1.66, build: 0.88,
    blurb: '店裡的鏡子照過半條弄堂。', skin: 0xd9ac83, hair: 0x1e1a18,
    top: 0x2f3033, bottom: 0x3a3c40, accent: 0xb9bec4, gear: 'apron' },
  { id: 'sparky', name: '阿德', sex: 'm', job: '水電工', height: 1.74, build: 1.02,
    blurb: '整棟樓的電，他一手拉過。', skin: 0xc79666, hair: 0x2b2724,
    top: 0x4b5c4a, bottom: 0x36403a, accent: 0xd07b2a },
  { id: 'pharmacy', name: '小張', sex: 'f', job: '藥房店員', height: 1.63, build: 0.9,
    blurb: '知道每一種藥放在哪一層。', skin: 0xe2c6a8, hair: 0x332b26,
    top: 0x9fc0a8, bottom: 0x3f4a52, accent: 0x4f7f6a, gear: 'vest' },
  { id: 'student', name: '小雨', sex: 'f', job: '高中生', height: 1.58, build: 0.86,
    blurb: '書包裡只有課本和耳機。', skin: 0xe8cdb2, hair: 0x211c1a,
    top: 0x8f9fd0, bottom: 0x2f3440, accent: 0x404a6b, gear: 'bag' },
  { id: 'chef', name: '老王', sex: 'm', job: '廚師', height: 1.7, build: 1.14,
    blurb: '後巷那家本幫菜，他掌勺。', skin: 0xc99b6e, hair: 0x201d1b,
    top: 0xe4e2da, bottom: 0x2e3238, accent: 0x1f2124, gear: 'coat' },
];

export type { Rig } from './human.ts';

/** Shanghai survivor -> DefendTaipei mannequin rig options. Same colours and occupation cues as before;
 * the body, joints and animation now come from the shared human.ts animator. */
export function rigOptions(spec: CharSpec): RigOpts {
  const sneakers = spec.id === 'student' || spec.id === 'rider';
  const o: RigOpts = {
    gender: spec.sex,
    skin: spec.skin,
    hair: spec.hair,
    hairStyle: spec.sex === 'f' ? 'long' : 'short',
    top: spec.top,
    bottom: spec.bottom,
    shoes: spec.gear === 'coat' && spec.sex === 'f' ? 0xf0f0ec : sneakers ? 0xe4e4e0 : 0x2b2724,
    height: spec.height,
  };
  if (spec.gear === 'apron') o.apron = spec.accent;
  if (spec.gear === 'vest') o.vest = spec.accent;
  if (spec.gear === 'helmet') o.helmet = spec.top;
  if (spec.gear === 'bag') o.pack = spec.accent;
  if (spec.gear === 'cap') o.cap = spec.accent;
  if (spec.gear === 'coat') o.jacket = o.coat = 0xf1efe8;
  return o;
}

export function buildRig(spec: CharSpec): Rig {
  return makeRig(rigOptions(spec));
}

/** A held tool, pivoting from the right hand. */
export function buildWeapon(kind: 'pipe' | 'knife' | 'none'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'none') return g;
  const len = kind === 'pipe' ? 0.72 : 0.32;
  const w = kind === 'pipe' ? 0.05 : 0.035;
  const mat = new THREE.MeshStandardMaterial({ color: kind === 'pipe' ? 0x9aa0a6 : 0xc8ccd0, roughness: 0.4, metalness: 0.6 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
  shaft.position.y = len * 0.45;
  g.add(shaft);
  if (kind === 'pipe') {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 0.16, w * 1.5), new THREE.MeshStandardMaterial({ color: 0x2b2b2b }));
    grip.position.y = 0.04;
    g.add(grip);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(w * 1.6, 0.2, 0.012), mat);
    blade.position.y = len * 0.75;
    g.add(blade);
  }
  return g;
}
