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
const kinds:RoomKind[]=['home','grocer','repair'];
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
export function planInteriorRooms(block:Block,excludeBuildingIds:readonly string[]=[],limit=3):InteriorRoom[]{
 const wallCollision=makeCollider(wallGridOf(block,false)),inside=makeInsideTest(block),skip=new Set(excludeBuildingIds);
 const doors=block.buildings.filter(b=>!skip.has(b.id)).map(b=>({b,s:selectShelter([b],block.spawn,wallCollision,inside)})).filter((x):x is {b:Building;s:Shelter}=>!!x.s);
 doors.sort((a,b)=>Math.hypot(a.s.outside[0]-block.spawn[0],a.s.outside[1]-block.spawn[1])-Math.hypot(b.s.outside[0]-block.spawn[0],b.s.outside[1]-block.spawn[1])||a.b.id.localeCompare(b.b.id));
 const rooms:InteriorRoom[]=[];
 for(const {b,s}of doors){if(rooms.length>=Math.max(0,Math.min(3,Math.floor(limit))))break;const r=fitRoom(b,s,kinds[rooms.length],wallCollision);if(r)rooms.push(r);}
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
 for(const f of room.furniture){const low=f.corners.map(([x,z])=>[x,.05,-z]),high=f.corners.map(([x,z])=>[x,f.height+.05,-z]);quad(high,f.color);for(let i=0;i<4;i++)quad([low[i],low[(i+1)%4],high[(i+1)%4],high[i]],f.color);
  // Original simple silhouettes, rather than arbitrary solid boxes.
  const layer=(u0:number,u1:number,d0:number,d1:number,y:number,color:number)=>{
   const a=axes(room.entrance),p=(u:number,d:number)=>[f.center[0]+a.ux*u+a.nx*d,y,-(f.center[1]+a.uz*u+a.nz*d)];
   quad([p(u0,d0),p(u1,d0),p(u1,d1),p(u0,d1)],color);
  };
  if(f.kind==='bed'){layer(-f.width*.46,f.width*.46,-f.depth*.45,f.depth*.22,f.height+.07,0x78928f);layer(-f.width*.34,f.width*.34,f.depth*.25,f.depth*.42,f.height+.10,0xd0c9b3);}
  if(['shelf','cupboard','cabinet'].includes(f.kind)){
   const front=[low[0],low[1],high[1],high[0]];quad(front.map(([x,y,z])=>[x,y+.002,z]),0x4a5149);
   for(const h of [.35,.7,1.05].filter(h=>h<f.height))layer(-f.width/2,f.width/2,-f.depth/2,f.depth/2,h,0xb7aa8a);
  }
  if(['table','counter','workbench'].includes(f.kind))layer(-f.width*.42,f.width*.42,-f.depth*.42,f.depth*.42,f.height+.07,0xb09d78);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide})));group.userData={roomId:room.id,features:room.furniture.length,lootIds:room.loot.map(l=>l.id)};return group;
}
