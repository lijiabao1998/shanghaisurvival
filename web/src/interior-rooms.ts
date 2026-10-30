import * as THREE from 'three';
import { makeInsideTest, makeCollider, wallGridOf, roofGeometry, type Block, type Building, type Point } from './world';
import { selectShelter, type Shelter } from './shelter';

/** Small, deterministic, explorable-room foundation. No runtime/save mutation.
 * Layouts are fictional interpretations fitted inside real CMAB footprints. */
export type RoomKind = 'home' | 'grocer' | 'repair';
export type RoomFurniture = { id:string; kind:string; center:Point; width:number; depth:number; height:number; color:number; corners:Point[] };
export type RoomLoot = { id:string; furnitureId:string; position:Point; item:'water'|'food'|'battery'; count:1 };
export type InteriorRoom = { id:string; buildingId:string; kind:RoomKind; label:string; entrance:Shelter; furniture:RoomFurniture[]; loot:RoomLoot[]; focus:Point[] };
const names:Record<RoomKind,string>={home:'里弄住家',grocer:'街坊雜貨間',repair:'弄口修理間'};
/** Append-only real-footprint selection; kinds/IDs never depend on input or proximity order.
 * If a footprint becomes unsafe/missing, omit it rather than silently assigning its identity elsewhere. */
export const INTERIOR_ROOM_CATALOG:ReadonlyArray<readonly [string,RoomKind]>=[
 ['cmab_327821_0','home'],['cmab_327816_0','grocer'],['cmab_327817_0','repair'],
 ['cmab_327814_0','home'],['cmab_325911_0','grocer'],['cmab_327818_0','repair'],
 ['cmab_327826_0','home'],['cmab_327825_0','grocer'],['cmab_327823_0','repair'],
];
const layouts:Record<RoomKind,Array<[string,number,number,number,number,number,number]>>={
 home:[['bed',-1.55,2.6,1.25,2.1,.45,0x697e80],['cupboard',1.55,3.2,1.1,.65,1.25,0x7e6348],['table',1.5,1.3,1,.7,.7,0x9b8260]],
 grocer:[['shelf',-1.55,2.5,.65,2.2,1.6,0x776c53],['counter',1.55,2.1,1.1,1.8,.8,0x8b7959],['crate',1.45,4.1,.85,.85,.6,0x857448]],
 repair:[['workbench',-1.55,2.6,1.1,2,.85,0x747b70],['cabinet',1.55,3.4,.75,1.5,1.4,0x69776d],['stool',1.3,1.35,.5,.5,.45,0x947f60]],
};
function axes(s:Shelter){const dx=s.inside[0]-s.door[0],dz=s.inside[1]-s.door[1],l=Math.hypot(dx,dz);return {nx:dx/l,nz:dz/l,ux:dz/l,uz:-dx/l};}
function point(s:Shelter,u:number,d:number):Point{const a=axes(s);return [s.door[0]+a.ux*u+a.nx*d,s.door[1]+a.uz*u+a.nz*d];}
/** Include corners, edge samples and center, so concavity/courtyards cannot be bridged. */
function legalBox(b:Building,corners:Point[]):boolean{
 const inside=makeInsideTest({buildings:[b],spawn:corners[0]});
 for(let i=0;i<4;i++)for(let j=0;j<=8;j++){const p=corners[i],q=corners[(i+1)%4],t=j/8;if(!inside(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))return false;}
 const c:Point=[corners.reduce((a,p)=>a+p[0],0)/4,corners.reduce((a,p)=>a+p[1],0)/4];return inside(...c);
}
function fitRoom(b:Building,s:Shelter,kind:RoomKind,wallCollision:(x:number,z:number,r:number)=>boolean):InteriorRoom|null{
 const inside=makeInsideTest({buildings:[b],spawn:s.inside});
 // A 1.2m corridor is navigable from doorway through the furnishing zone.
 for(let d=.5;d<=4.7;d+=.2)for(const u of [-.6,0,.6]){const p=point(s,u,d);if(!inside(...p)||wallCollision(...p,.25))return null;}
 const id=`room-v1:${b.id}`,furniture:RoomFurniture[]=[];
 for(const [name,u,d,w,depth,h,color]of layouts[kind]){
  const corners=[point(s,u-w/2,d-depth/2),point(s,u+w/2,d-depth/2),point(s,u+w/2,d+depth/2),point(s,u-w/2,d+depth/2)];
  if(!legalBox(b,corners))continue;
  furniture.push({id:`${id}:${name}`,kind:name,center:point(s,u,d),width:w,depth,height:h,color,corners});
 }
 if(furniture.length<2)return null;
 const target=furniture.find(f=>['cupboard','shelf','cabinet'].includes(f.kind))??furniture[0];
 const ax=axes(s),d=(target.center[0]-s.door[0])*ax.nx+(target.center[1]-s.door[1])*ax.nz;
 const loot:RoomLoot={id:`${id}:supply`,furnitureId:target.id,position:point(s,0,d),item:kind==='home'?'water':kind==='grocer'?'food':'battery',count:1};
 return {id,buildingId:b.id,kind,label:names[kind],entrance:s,furniture,loot:[loot],focus:[s.inside,...furniture.map(f=>f.center)]};
}
export function planInteriorRooms(block:Block,excludeBuildingIds:readonly string[]=[],limit=9):InteriorRoom[]{
 const wallCollision=makeCollider(wallGridOf(block,false)),inside=makeInsideTest(block),skip=new Set(excludeBuildingIds);
 const rooms:InteriorRoom[]=[],maximum=Number.isNaN(limit)?0:Math.max(0,Math.min(9,Math.floor(limit)));
 for(const [buildingId,kind]of INTERIOR_ROOM_CATALOG){
  if(rooms.length>=maximum)break;if(skip.has(buildingId))continue;
  const b=block.buildings.find(b=>b.id===buildingId);if(!b)continue;
  const s=selectShelter([b],block.spawn,wallCollision,inside);if(!s)continue;
  const room=fitRoom(b,s,kind,wallCollision);if(room)rooms.push(room);
 }
 return rooms;
}
/** Furniture collision for an actor already inside this room. Exterior walls stay authoritative. */
export function roomFurnitureCollision(room:InteriorRoom,x:number,z:number,r=.35):boolean{
 const a=axes(room.entrance);
 return room.furniture.some(f=>{const dx=x-f.center[0],dz=z-f.center[1],u=Math.abs(dx*a.ux+dz*a.uz),d=Math.abs(dx*a.nx+dz*a.nz);return Math.hypot(Math.max(0,u-f.width/2),Math.max(0,d-f.depth/2))<r;});
}
export function createInteriorRoomGeometry(room:InteriorRoom,building:Building):THREE.Group{
 const group=new THREE.Group();group.name=room.id;
 const floor=roofGeometry([building]);
 const floorPositions=floor.getAttribute('position');for(let i=0;i<floorPositions.count;i++)floorPositions.setY(i,.04);floorPositions.needsUpdate=true;floor.computeVertexNormals();
 group.add(new THREE.Mesh(floor,new THREE.MeshStandardMaterial({color:room.kind==='home'?0x8b806c:0x72786e,roughness:1,side:THREE.DoubleSide})));
 const positions:number[]=[],colors:number[]=[];
 function quad(ps:number[][],color:number){const c=new THREE.Color(color);for(const i of [0,1,2,0,2,3]){positions.push(...ps[i]);colors.push(c.r,c.g,c.b);}}
 const detailKinds:string[]=[];
 const variant=Math.max(0,Math.floor(INTERIOR_ROOM_CATALOG.findIndex(([id])=>id===room.buildingId)/3));
 for(const f of room.furniture){
  const a=axes(room.entrance),w=f.width,d=f.depth,h=f.height;
  // All props remain inside the authoritative furniture footprint, so art never blocks a clear path.
  const box=(u:number,v:number,y:number,bw:number,bd:number,bh:number,color:number)=>{
   const p=(x:number,z:number,yy:number)=>[f.center[0]+a.ux*x+a.nx*z,yy,-(f.center[1]+a.uz*x+a.nz*z)];
   const low=[p(u-bw/2,v-bd/2,y),p(u+bw/2,v-bd/2,y),p(u+bw/2,v+bd/2,y),p(u-bw/2,v+bd/2,y)],high=low.map(q=>[q[0],y+bh,q[2]]);
   quad(high,color);for(let i=0;i<4;i++)quad([low[i],low[(i+1)%4],high[(i+1)%4],high[i]],color);
  };
  const legged=(top:number,color:number)=>{box(0,0,top-.09,w,d,.09,color);for(const u of [-w*.4,w*.4])for(const v of [-d*.4,d*.4])box(u,v,.05,.08,.08,top-.14,0x514d43);};
  if(f.kind==='bed'){
   box(0,0,.05,w,d,.18,0x5c483b);box(0,0,.23,w*.95,d*.95,.20,0xd2c9af);
   box(0,-d*.12,.43,w*.94,d*.68,.07,[0x688f8c,0x7b879b,0x9b8070][variant]);
   for(const u of [-.3,0,.3])box(u*w,-d*.12,.502,w*.025,d*.66,.006,0xb4c7b5);
   for(const u of [-w*.24,w*.24])box(u,d*.34,.43,w*.4,d*.19,.10,0xe5dbc3);
   box(0,d*.475,.05,w,.05,.58,0x66503e);detailKinds.push('bed-frame','mattress','striped-quilt','two-pillows');
  }else if(f.kind==='cupboard'){
   box(0,0,.05,w,d,h-.05,f.color);
   // Paired cupboard fronts and a porcelain wash basin built as a recessed dark well with white rim.
   for(const u of [-w*.25,w*.25]){box(u,-d*.47,.1,w*.46,d*.06,h*.76,0x9e8661);box(u,-d*.495,h*.6,.035,.008,.11,0xd3b77c);}
   box(0,0,h,w,d,.07,0xd4cdb4);box(0,0,h+.075,w*.56,d*.6,.015,0x465c59);
   for(const u of [-w*.31,w*.31])box(u,0,h+.08,w*.06,d*.72,.065,0xebe6d5);
   for(const v of [-d*.33,d*.33])box(0,v,h+.08,w*.64,d*.06,.065,0xebe6d5);
   box(w*.3,d*.26,h+.08,.035,.035,.21,0xa2b9b5);box(w*.22,d*.26,h+.25,w*.19,.035,.035,0xa2b9b5);
   detailKinds.push('cupboard-doors','porcelain-wash-basin','tap');
  }else if(f.kind==='shelf'||f.kind==='cabinet'){
   const tiers=f.kind==='shelf'?4:3;
   for(const u of [-w*.46,w*.46])for(const v of [-d*.46,d*.46])box(u,v,.05,.045,.045,h-.05,0x454e47);
   for(let i=0;i<tiers;i++){
    const y=.12+i*(h-.28)/(tiers-1);box(0,0,y,w,d,.045,f.color);
    // Contrasting tins and cartons occupy each exposed shelf instead of hidden lines inside a solid block.
    for(let j=0;j<4;j++){const v=-d*.34+j*d*.22;box(0,v,y+.045,w*.56,d*.15,.14+(j%2)*.06,j%2?[0xb09a64,0xa6957b,0x9c8874][variant]:[0x637e70,0x79858b,0x8a796a][variant]);box(0,v,y+.19,w*.58,d*.16,.018,0xd8cdb2);}
   }
   detailKinds.push(f.kind==='shelf'?'open-grocery-shelves':'parts-shelves','labelled-tins','cartons');
  }else if(f.kind==='workbench'){
   legged(h,0x9c8764);box(0,d*.38,.07,w*.8,d*.18,h*.65,0x66746b);
   box(-w*.28,-d*.12,h,.12,.38,.045,0x3e4544);box(-w*.28,-d*.28,h+.045,.24,.09,.08,0xa5aca0);
   box(w*.18,-d*.14,h,.045,.42,.035,0xc1b491);box(w*.18,d*.1,h,.08,.12,.04,0x994f38);
   box(0,d*.28,h,w*.6,d*.22,.13,[0x4b615b,0x5b626c,0x716153][variant]);
   for(const u of [-w*.17,0,w*.17])box(u,d*.28,h+.13,.10,.12,.055,0xa8b0a2);
   detailKinds.push('workbench-legs','hammer','screwdriver','parts-tray');
  }else if(f.kind==='table'||f.kind==='counter'){
   legged(h,f.color);box(0,0,h,w*.72,d*.66,.025,0xb4a67d);
   if(f.kind==='table'){box(-w*.2,0,h+.03,.14,.14,.16,0xc5d0bb);box(w*.17,0,h+.03,.22,.20,.055,0xe4d2b2);detailKinds.push('enamel-cup','meal-bowl');}
   else{box(-w*.2,d*.2,h+.03,w*.3,d*.3,.18,0x455e55);for(let i=0;i<3;i++)box(w*.18,-d*.26+i*d*.2,h+.03,w*.22,d*.14,.12,0xc7b17f);detailKinds.push('counter-scale','wrapped-goods');}
  }else if(f.kind==='crate'){
   box(0,0,.05,w,d,h-.05,0x8a714e);for(const u of [-w*.34,0,w*.34])box(u,0,h,w*.10,d,.02,0xbaa074);
   for(const v of [-d*.35,d*.35])box(0,v,.05,w,d*.08,h,0xbaa074);detailKinds.push('slatted-stock-crate');
  }else{legged(h,f.color);detailKinds.push('wooden-stool');}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide})));group.userData={roomId:room.id,features:room.furniture.length,detailKinds,drawCalls:2,lootIds:room.loot.map(l=>l.id)};return group;
}
