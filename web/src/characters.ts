/** Shanghai roster: twelve playable survivors, six women and six men.
 *
 * Every character is built from boxes around a joint hierarchy, so the same
 * procedural animator drives all of them. Nothing here is a scanned asset and
 * no occupation is tied to a real employer: the trades are the ones you would
 * actually meet in an old lane-quarter like 老西門 — a night guard, a delivery
 * rider, a hardware-shop owner, a community nurse, a breakfast-stall keeper.
 */
import * as THREE from 'three';

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

export type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
};

const box = (w: number, h: number, d: number, color: number) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));

/** Slide a mesh down from its joint so the group's origin acts as the pivot. */
const hang = (mesh: THREE.Mesh, y: number, x = 0, z = 0) => {
  mesh.position.set(x, y, z);
  return mesh;
};

export function buildRig(spec: CharSpec): Rig {
  const h = spec.height;
  const legLen = h * 0.50;
  // Hair top is 1.23 head units above the neck. Match declared standing height.
  const torsoLen = h * (1 - 0.50 - 0.115 * 1.23);
  const headSize = h * 0.115;
  const shoulder = h * 0.23 * spec.build;
  const depth = h * 0.12;
  const armLen = h * 0.29;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Separate lower limbs give the hips and knees independent pivots while
  // retaining the original standing height and occupation colours.
  const makeLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(side * shoulder * 0.32, legLen, 0);
    const upper = legLen * 0.51;
    const lower = legLen - upper;
    leg.add(hang(box(shoulder * 0.34, upper, depth * 0.86, spec.bottom), -upper / 2));
    const knee = new THREE.Group();
    knee.position.y = -upper;
    knee.add(hang(box(shoulder * 0.34, lower, depth * 0.86, spec.bottom), -lower / 2));
    knee.add(hang(box(shoulder * 0.34, h * 0.03, depth * 0.9, 0x23262a), -lower + h * 0.015));
    leg.add(knee);
    body.add(leg);
    return { leg, knee };
  };
  const { leg: legL, knee: kneeL } = makeLeg(-1);
  const { leg: legR, knee: kneeR } = makeLeg(1);

  const torso = new THREE.Group();
  torso.position.set(0, legLen, 0);
  torso.add(hang(box(shoulder, torsoLen, depth, spec.top), torsoLen / 2));
  body.add(torso);

  // Occupation silhouette: a second layer over the torso, never a logo.
  if (spec.gear === 'apron' || spec.gear === 'coat') {
    const front = box(shoulder * 0.78, torsoLen * 0.92, depth * 0.16, spec.gear === 'coat' ? 0xf1efe8 : spec.accent);
    torso.add(hang(front, torsoLen * 0.46, 0, depth * 0.55));
  } else if (spec.gear === 'vest') {
    const vest = box(shoulder * 1.04, torsoLen * 0.66, depth * 1.06, spec.accent);
    vest.material = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.7 });
    torso.add(hang(vest, torsoLen * 0.42));
  }
  if (spec.gear === 'bag') {
    const bag = box(shoulder * 0.52, torsoLen * 0.6, depth * 0.5, spec.accent);
    torso.add(hang(bag, torsoLen * 0.5, shoulder * 0.42, -depth * 0.7));
  }

  const head = new THREE.Group();
  head.position.set(0, torsoLen, 0);
  const skull = box(headSize, headSize * 1.05, headSize * 0.92, spec.skin);
  head.add(hang(skull, headSize * 0.55));
  // Hair reads from above, which is the angle the game is mostly played at.
  const hair = box(headSize * 1.06, headSize * 0.42, headSize * 1.0, spec.hair);
  head.add(hang(hair, headSize * 1.02));
  for (const side of [-1, 1]) {
    const eye = box(headSize * 0.16, headSize * 0.12, headSize * 0.06, 0x1a1a1c);
    eye.position.set(side * headSize * 0.24, headSize * 0.58, headSize * 0.47);
    head.add(eye);
  }
  if (spec.gear === 'helmet') {
    const helmet = box(headSize * 1.18, headSize * 0.5, headSize * 1.1, 0xe8e4d8);
    head.add(hang(helmet, headSize * 1.12));
  }
  if (spec.gear === 'cap') {
    const cap = box(headSize * 1.06, headSize * 0.26, headSize * 1.0, spec.accent);
    head.add(hang(cap, headSize * 1.18));
    head.add(hang(box(headSize * 0.9, headSize * 0.08, headSize * 0.42, spec.accent), headSize * 1.08, 0, headSize * 0.6));
  }
  torso.add(head);

  const makeArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(side * shoulder * 0.56, torsoLen * 0.94, 0);
    const upper = armLen * 0.52;
    const lower = armLen - upper;
    arm.add(hang(box(shoulder * 0.26, upper, depth * 0.72, spec.top), -upper / 2));
    const elbow = new THREE.Group();
    elbow.position.y = -upper;
    elbow.add(hang(box(shoulder * 0.26, lower, depth * 0.72, spec.top), -lower / 2));
    elbow.add(hang(box(shoulder * 0.22, h * 0.055, depth * 0.74, spec.skin), -lower + h * 0.03));
    arm.add(elbow);
    return { arm, elbow };
  };
  const { arm: armL, elbow: elbowL } = makeArm(-1);
  const { arm: armR, elbow: elbowR } = makeArm(1);
  torso.add(armL, armR);

  return { root, body, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
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
