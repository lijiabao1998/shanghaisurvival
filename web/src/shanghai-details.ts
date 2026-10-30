import * as THREE from 'three';
import { doorEdgeIndex, makeInsideTest, roofGeometry, type Building } from './world';
import type { Shelter } from './shelter';

/** Original procedural details inspired by Shanghai lilong: not surveyed facades. */
export type DetailBatch = { positions: number[]; colors: number[]; features: number };
const batch = (): DetailBatch => ({positions:[],colors:[],features:0});
function face(out:DetailBatch,vertices:number[][],color:number){
  const c=new THREE.Color(color);
  for(const i of [0,1,2,0,2,3]){out.positions.push(...vertices[i]);out.colors.push(c.r,c.g,c.b);}
}
export function lilongFacade(building:Building):DetailBatch {
  const out=batch(),ring=building.footprint,edge=doorEdgeIndex(ring);
  if(edge<0)return out;
  const a=ring[edge],b=ring[(edge+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<5.2||building.height_m<4)return out;
  let area=0;for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];area+=p[0]*q[1]-q[0]*p[1];}
  const sign=area>=0?1:-1,ux=dx/length,uy=dy/length,nx=sign*uy,ny=-sign*ux;
  const at=(u:number,v:number,n=.055)=>[a[0]+ux*u+nx*n,v,-(a[1]+uy*u+ny*n)];
  const panel=(u:number,v:number,w:number,h:number,color:number,n=.055)=>face(out,[at(u,v,n),at(u+w,v,n),at(u+w,v+h,n),at(u,v+h,n)],color);
  const mid=length/2;
  // Stone-framed shikumen gateway: real 1.6 m collision opening stays unobstructed.
  panel(mid-1.17,0,.32,2.65,0xc9c1a9);panel(mid+.85,0,.32,2.65,0xc9c1a9);
  panel(mid-1.25,2.25,2.5,.28,0xc9c1a9);panel(mid-1.1,2.55,2.2,.18,0x908b7b);
  panel(mid-.75,2.76,1.5,.16,0xc9c1a9);panel(mid-.45,2.95,.9,.14,0x908b7b);
  // Blue enamel lane-number plate (unlettered rather than a fabricated real address).
  panel(mid+1.32,1.75,.38,.28,0xc7c4af,.08);panel(mid+1.35,1.78,.32,.22,0x264c63,.09);
  out.features++;
  // Red-brick piers and fine mortar at the gateway, only on the solid jambs.
  for(const side of [-1,1]){
    const x=mid+side*1.62-.18;
    panel(x,0,.36,3.15,0x845748,.06);
    for(let y=.25;y<3.1;y+=.28)panel(x,y,.36,.025,0xab8a70,.068);
  }
  // Weathered stone plinth and staggered exposed-brick joints: original geometry,
  // below windows and outside the existing 1.6 m gateway, not painted shop logos.
  for(const side of [-1,1]){
    const x=mid+side*1.62-.18;
    for(let row=0;row<4;row++)panel(x+(row%2?.09:.23),.34+row*.56,.018,.24,0xb4a38b,.071);
    const start=side<0?Math.max(.2,mid-3.5):mid+1.82;
    const width=side<0?mid-1.82-start:Math.min(1.68,length-.2-start);
    if(width>.2){panel(start,.06,width,.22,0x746f61,.06);panel(start,.28,width,.045,0xb2a78e,.075);}
  }
  // Slim iron drying rails below upper windows. They stay close to the wall and
  // are included in the owning building's faded index range, not new draw calls.
  const y=3.05,width=Math.min(3.4,length/2-1.8);
  if(width>1.4&&building.height_m>5.6){
    const left=.55;
    face(out,[at(left,y,.055),at(left+width,y,.055),at(left+width,y,.32),at(left,y,.32)],0x52645d);
    for(const x of [left,left+width])panel(x,y,.035,.65,0x3d4745,.32);
    panel(left,y+.6,width,.035,0x3d4745,.32);
    // Muted hung cloth rectangles: no cloth simulations or textures on mobile.
    panel(left+.18,y+.13,.45,.44,0xb4b39c,.33);panel(left+.83,y+.08,.5,.49,0x718984,.33);
    out.features++;
  }
  return out;
}

/** A few readable domestic objects inside the existing shelter, one batched mesh.
 * All footprint corners must be inside; the central 1.2 m doorway lane stays clear.
 * Decorative objects do not silently add collision or alter save coordinates.
 */
export function createLilongInterior(building:Building,shelter:Shelter):THREE.Mesh {
  const out=batch(),inside=makeInsideTest({buildings:[building],spawn:shelter.inside});
  const vx=shelter.inside[0]-shelter.door[0],vy=shelter.inside[1]-shelter.door[1],len=Math.hypot(vx,vy),nx=vx/len,ny=vy/len,ux=ny,uy=-nx;
  const point=(u:number,d:number,y:number)=>[shelter.door[0]+ux*u+nx*d,y,-(shelter.door[1]+uy*u+ny*d)];
  const box=(u:number,d:number,w:number,depth:number,y:number,h:number,color:number)=>{
    const pts=[point(u-w/2,d-depth/2,y),point(u+w/2,d-depth/2,y),point(u+w/2,d+depth/2,y),point(u-w/2,d+depth/2,y)];
    if(Math.abs(u)-w/2<.6||!pts.every(p=>inside(p[0],-p[2])))return false;
    const top=pts.map(p=>[p[0],y+h,p[2]]);
    face(out,top,color);for(let i=0;i<4;i++)face(out,[pts[i],pts[(i+1)%4],top[(i+1)%4],top[i]],color);
    out.features++;return true;
  };
  // Wooden bed with blue quilt, low cupboard, enamel washbasin and stool.
  if(box(-1.25,2.1,.95,1.8,.12,.3,0x70513c)){
    box(-1.25,2.28,.86,1.18,.42,.08,0x587b80);box(-1.25,1.46,.7,.28,.42,.12,0xd0c4a9);
    box(-1.25,1.17,.95,.09,.12,.72,0x70513c);
    box(-1.25,1.85,.84,.10,.5,.015,0xb4c2b4);
  }
  if(box(1.25,2.1,.7,1.05,0,.7,0x806749)){
    box(1.25,2.1,.42,.42,.7,.08,0xc6d0c2);box(1.25,2.1,.3,.3,.78,.025,0x4f7277);
  }
  box(1.25,.8,.38,.38,0,.38,0x8e7650);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(out.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(out.colors,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));mesh.name='lilong-safehouse-domestic-details';mesh.userData.features=out.features;return mesh;
}

/** Actual concave footprint-minus-courtyards, not a circular staging pad. */
export function createShelterFloor(building:Building):THREE.Mesh {
  const geometry=roofGeometry([building]),position=geometry.getAttribute('position');
  for(let i=0;i<position.count;i++)position.setY(i,.035);
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x766c58,roughness:1,side:THREE.DoubleSide}));
  mesh.name='shelter-original-footprint-floor';return mesh;
}

/** Bounded legal indoor focus points for inspection occlusion; generated once. */
export function shelterInspectionPoints(building:Building,shelter:Shelter):ReadonlyArray<readonly [number,number]> {
  const inside=makeInsideTest({buildings:[building],spawn:shelter.inside});
  const dx=shelter.inside[0]-shelter.door[0],dy=shelter.inside[1]-shelter.door[1],length=Math.hypot(dx,dy);
  if(length<.01)return [];
  const nx=dx/length,ny=dy/length,ux=ny,uy=-nx,points:[number,number][]=[];
  for(const u of [-1.8,-1.25,-.7,0,.7,1.25,1.8])for(const d of [.6,1.2,1.8,2.4,3]){
    const x=shelter.door[0]+ux*u+nx*d,z=shelter.door[1]+uy*u+ny*d;
    if(inside(x,z))points.push([x,z]);
  }
  return points;
}
