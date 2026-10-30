/** Shanghai roster: twelve playable survivors, six women and six men.
 *
 * Every character is built from boxes around a joint hierarchy, so the same
 * procedural animator drives all of them. Nothing here is a scanned asset and
 * no occupation is tied to a real employer: the trades are the ones you would
 * actually meet in an old lane-quarter like 老西門 — a night guard, a delivery
 * rider, a hardware-shop owner, a community nurse, a breakfast-stall keeper.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

// One shared vertex-colour material; static garment pieces are merged per joint.
// No textures, skeleton textures, facial meshes or per-frame allocations.
const clothMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88 });
const WHITE = 0xf1eee8;

export function buildRig(spec: CharSpec): Rig {
  const h=spec.height, legLen=h*.50, torsoLen=h*(1-.50-.115*1.23);
  const headSize=h*.115, shoulder=h*.23*spec.build, depth=h*.12, armLen=h*.29;
  const root=new THREE.Group(),body=new THREE.Group(),torso=new THREE.Group(),head=new THREE.Group();
  root.add(body);body.add(torso);torso.position.y=legLen;torso.add(head);head.position.y=torsoLen;
  root.name=`survivor-${spec.id}`;root.userData.characterId=spec.id;
  const parts=new Map<THREE.Group,THREE.BufferGeometry[]>();
  const add=(joint:THREE.Group,g:THREE.BufferGeometry,color:number,x=0,y=0,z=0,rz=0)=>{
    g.rotateZ(rz);g.translate(x,y,z);
    const c=new THREE.Color(color),n=g.getAttribute('position').count,colors=new Float32Array(n*3);
    for(let i=0;i<n;i++)c.toArray(colors,i*3);
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}
    if(!parts.has(joint))parts.set(joint,[]);parts.get(joint)!.push(g);
  };
  const box=(j:THREE.Group,w:number,ht:number,d:number,c:number,x=0,y=0,z=0,rz=0)=>add(j,new THREE.BoxGeometry(w,ht,d),c,x,y,z,rz);
  const cyl=(j:THREE.Group,rt:number,rb:number,ht:number,c:number,x=0,y=0,z=0,sx=1,sz=1)=>{
    const g=new THREE.CylinderGeometry(rt,rb,ht,10);g.scale(sx,1,sz);add(j,g,c,x,y,z);
  };
  const dark=new THREE.Color(spec.top).multiplyScalar(.62).getHex();
  // Shaped shirt: narrower waist, shoulder yoke and a small standing collar.
  cyl(torso,shoulder*.49,shoulder*.40,torsoLen*.86,spec.top,0,torsoLen*.47,0,1,depth/shoulder);
  cyl(torso,shoulder*.39,shoulder*.49,torsoLen*.12,spec.top,0,torsoLen*.94,0,1,depth/shoulder);
  cyl(torso,headSize*.30,headSize*.34,h*.045,dark,0,torsoLen*.99,0,1,.8);
  box(torso,shoulder*.83,h*.025,depth*1.02,0x303439,0,h*.015);
  box(torso,h*.035,h*.025,.014,0xb4aa86,0,h*.015,depth*.54);
  // White, smooth egg silhouette: no eyes, nose, mouth or hair.
  const points=[[0,0],[.25,.02],[.43,.22],[.50,.55],[.47,.86],[.34,1.08],[0,1.18]].map(([r,y])=>new THREE.Vector2(r*headSize,y*headSize));
  const egg=new THREE.LatheGeometry(points,16);egg.scale(.97,1,.94);add(head,egg,WHITE,0,headSize*.02,0);
  head.userData.faceless=true;
  const makeLeg=(side:number)=>{
    const leg=new THREE.Group(),knee=new THREE.Group();leg.position.set(side*shoulder*.32,legLen,0);body.add(leg);
    const upper=legLen*.51,lower=legLen-upper;leg.add(knee);knee.position.y=-upper;
    cyl(leg,shoulder*.18,shoulder*.155,upper,spec.bottom,0,-upper/2,0,1,.93);
    cyl(knee,shoulder*.155,shoulder*.13,lower-h*.025,spec.bottom,0,-(lower-h*.025)/2,0,1,.96);
    box(knee,shoulder*.31,h*.055,depth*1.15,0x252a2f,0,-lower+h*.0275,depth*.13);
    box(knee,shoulder*.32,h*.012,depth*1.18,0x596064,0,-lower+h*.006,depth*.13);
    return {leg,knee};
  };
  const {leg:legL,knee:kneeL}=makeLeg(-1),{leg:legR,knee:kneeR}=makeLeg(1);
  const makeArm=(side:number)=>{
    const arm=new THREE.Group(),elbow=new THREE.Group();torso.add(arm);arm.position.set(side*shoulder*.56,torsoLen*.94,0);
    const upper=armLen*.52,lower=armLen-upper;arm.add(elbow);elbow.position.y=-upper;
    cyl(arm,shoulder*.145,shoulder*.125,upper,spec.top,0,-upper/2,0,1,.95);
    cyl(elbow,shoulder*.125,shoulder*.10,lower-h*.04,spec.top,0,-(lower-h*.04)/2,0,1,.95);
    cyl(elbow,shoulder*.11,shoulder*.11,h*.025,dark,0,-lower+h*.047);
    cyl(elbow,shoulder*.095,shoulder*.09,h*.055,WHITE,0,-lower+h*.018,0,1,.83);
    return {arm,elbow};
  };
  const {arm:armL,elbow:elbowL}=makeArm(-1),{arm:armR,elbow:elbowR}=makeArm(1);
  const front=depth*.54;
  const pocket=(x:number,y:number,c=dark)=>box(torso,shoulder*.23,torsoLen*.17,.025,c,x,y,front+.015);
  const strap=(x:number,c=spec.accent)=>box(torso,shoulder*.07,torsoLen*.88,.023,c,x,torsoLen*.48,front+.025);
  const apron=(c:number)=>{
    box(torso,shoulder*.65,torsoLen*.58,.032,c,0,torsoLen*.55,front+.015);
    box(torso,shoulder*.89,torsoLen*.37,.04,c,0,torsoLen*.075,front+.022);
    strap(-shoulder*.22,c);strap(shoulder*.22,c);pocket(0,torsoLen*.30,dark);
  };
  const cap=(c:number)=>{
    cyl(head,headSize*.48,headSize*.53,headSize*.20,c,0,headSize*1.11,0,1,.98);
    box(head,headSize*.95,headSize*.045,headSize*.48,c,0,headSize*1.01,headSize*.39);
  };
  const coat=()=>{
    for(const side of [-1,1]){
      box(torso,shoulder*.40,torsoLen*.96,.035,0xe9e8df,side*shoulder*.23,torsoLen*.37,front+.015);
      box(torso,shoulder*.12,torsoLen*.29,.04,spec.accent,side*shoulder*.14,torsoLen*.78,front+.04,side*.28);
      pocket(side*shoulder*.25,torsoLen*.28,0xc8cfc9);
    }
  };
  // Each role has a distinct shape, not just a recoloured base body.
  switch(spec.id){
    case 'guard':
      cap(0x293744);for(const side of [-1,1]){strap(side*shoulder*.29,0xd6c477);pocket(side*shoulder*.25,torsoLen*.52,0x1e2a37);}
      box(torso,.065,.12,.055,0x20272a,-shoulder*.32,torsoLen*.80,front+.04);
      box(torso,.009,.08,.009,0x363b40,-shoulder*.32,torsoLen*.94,front+.04);break;
    case 'rider':{
      const dome=new THREE.SphereGeometry(headSize*.59,12,8,0,Math.PI*2,0,Math.PI*.52);add(head,dome,0xf3c638,0,headSize*.84,0);
      box(torso,shoulder*.96,torsoLen*.90,depth*.83,0xd9a82a,0,torsoLen*.48,-depth*.91);
      box(torso,shoulder*.99,torsoLen*.08,depth*.88,0xf3e6ae,0,torsoLen*.88,-depth*.91);
      strap(-shoulder*.28,0x343a3e);strap(shoulder*.28,0x343a3e);break;}
    case 'hardware':
      apron(0x826343);for(const side of [-1,1]){box(torso,.028,.18,.028,0xa9afb0,side*.07,torsoLen*.33,front+.055);box(torso,.05,.06,.028,0x343b3b,side*.07,torsoLen*.43,front+.055);}break;
    case 'nurse':
      coat();box(torso,.065,.08,.012,0x6f9da9,-shoulder*.23,torsoLen*.73,front+.06);
      box(torso,.16,.18,.10,0xaec4c9,shoulder*.58,torsoLen*.12,0);break;
    case 'teacher':
      for(const side of [-1,1])box(torso,shoulder*.14,torsoLen*.30,.03,0x95765b,side*shoulder*.14,torsoLen*.75,front+.03,side*.3);
      box(torso,.19,.23,.09,0x856448,shoulder*.56,torsoLen*.15,0);strap(shoulder*.30,0x856448);
      box(torso,.145,.035,.095,0xe3d8b6,shoulder*.56,torsoLen*.34,0);break;
    case 'stall':
      apron(0x983f35);box(head,headSize*1.02,headSize*.14,headSize*.96,0xb55347,0,headSize*1.07);
      box(head,headSize*.30,headSize*.32,headSize*.20,0xb55347,headSize*.44,headSize*.91,-headSize*.38);break;
    case 'driver':
      cap(0x2d4859);box(torso,.045,torsoLen*.48,.025,0xd2bc7b,0,torsoLen*.66,front+.02);
      for(const side of [-1,1]){pocket(side*shoulder*.25,torsoLen*.63);box(torso,.09,.025,.08,0xc4c5ad,side*shoulder*.35,torsoLen*.94,0);}break;
    case 'barber':
      apron(0x343338);for(const side of [-1,1])box(torso,.015,.13,.014,0xbcc3c4,side*.035,torsoLen*.43,front+.06,side*.3);
      box(torso,.06,.12,.02,0x797e80,shoulder*.22,torsoLen*.40,front+.05);break;
    case 'sparky':
      cyl(head,headSize*.48,headSize*.58,headSize*.27,0xd99939,0,headSize*1.10,0,1,1);
      box(head,headSize*1.24,headSize*.045,headSize*1.13,0xd99939,0,headSize*.97);
      for(const side of [-1,1]){box(torso,.12,.13,.085,0x91693c,side*shoulder*.40,torsoLen*.10,front);strap(side*shoulder*.27,0xcfa457);}break;
    case 'pharmacy':
      for(const side of [-1,1]){box(torso,shoulder*.38,torsoLen*.75,.045,0x5a947b,side*shoulder*.24,torsoLen*.48,front+.02);pocket(side*shoulder*.23,torsoLen*.30,0x416e5d);}
      box(torso,.08,.07,.018,0xe1e9da,-shoulder*.23,torsoLen*.70,front+.05);break;
    case 'student':
      box(torso,shoulder*.69,torsoLen*.73,depth*.60,0x445782,0,torsoLen*.45,-depth*.78);
      box(torso,shoulder*.60,torsoLen*.22,depth*.15,0x6b80b3,0,torsoLen*.23,-depth*1.14);
      strap(-shoulder*.28,0x465675);strap(shoulder*.28,0x465675);
      for(const arm of [armL,armR])box(arm,.027,armLen*.45,depth*.75,0xe1e3dc,0,-armLen*.24);break;
    case 'chef':
      coat();cyl(head,headSize*.52,headSize*.48,headSize*.45,0xf0efe7,0,headSize*1.30,0);
      for(const side of [-1,1])for(const y of [.40,.57,.74])box(torso,.022,.022,.018,0x36383a,side*shoulder*.13,torsoLen*y,front+.05);
      box(torso,shoulder*.9,.045,depth*1.08,0x303337,0,torsoLen*.10);break;
  }
  for(const [joint,geometries] of parts){
    const merged=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(merged,clothMaterial);mesh.name=joint===head?'faceless-white-head':'garment-batch';joint.add(mesh);
  }
  return {root,body,torso,head,armL,armR,elbowL,elbowR,legL,legR,kneeL,kneeR};
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
