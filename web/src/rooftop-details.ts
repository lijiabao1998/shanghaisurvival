import * as THREE from 'three';
import {makeInsideTest,type Building} from './world';
/** Original rooftop dress-up inside existing surveyed footprints. No new buildings,
 * collision or save IDs. Return triangles for the existing occlusion-aware roof batch. */
export function rooftopDetails(b:Building){
 const positions:number[]=[],colors:number[]=[];let features=0;
 let seed=2166136261;for(const c of b.id)seed=Math.imul(seed^c.charCodeAt(0),16777619);seed>>>=0;
 const inside=makeInsideTest({buildings:[b],spawn:b.footprint[0]}),xs=b.footprint.map(p=>p[0]),zs=b.footprint.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),h=b.height_m;
 const fits=(x:number,z:number,r:number)=>[-r,0,r].every(dx=>[-r,0,r].every(dz=>inside(x+dx,z+dz)));
 const add=(g:THREE.BufferGeometry,x:number,y:number,z:number,color:number)=>{const g2=g.index?g.toNonIndexed():g,p=g2.getAttribute('position'),c=new THREE.Color(color);for(let i=0;i<p.count;i++){positions.push(x+p.getX(i),y+p.getY(i),-z+p.getZ(i));colors.push(c.r,c.g,c.b);}if(g2!==g)g2.dispose();g.dispose();features++;};
 const points:Array<[number,number]>=[];
 for(const u of [.32,.68,.5])for(const v of [.32,.68,.5]){const x=minX+(maxX-minX)*u,z=minZ+(maxZ-minZ)*v;if(fits(x,z,1.25)&&!points.some(p=>Math.hypot(x-p[0],z-p[1])<4))points.push([x,z]);}
 if(points.length&&h>=4){
  const [x,z]=points[0];
  // Raised stairwell/service box: deliberate low silhouette, not an extra storey.
  add(new THREE.BoxGeometry(1.7,.85,1.45),x,h+.425,z,seed%2?0x8b8170:0x92958b);
  add(new THREE.BoxGeometry(1.95,.12,1.7),x,h+.91,z,0x575e59);
  // Small roof vent / chimney and its flashing.
  add(new THREE.BoxGeometry(.42,.85,.42),x+.55,h+1.38,z-.4,0x706d60);
  add(new THREE.BoxGeometry(.6,.09,.6),x+.55,h+1.84,z-.4,0x343e3e);
 }
 if(points.length>1&&h>=4){const [x,z]=points[1];
  add(new THREE.BoxGeometry(1.5,.18,1.5),x,h+.09,z,0x5b625c);
  add(new THREE.CylinderGeometry(.52,.52,.85,8),x,h+.6,z,0x748a87);
  add(new THREE.CylinderGeometry(.56,.56,.08,8),x,h+1.065,z,0xadb5a3);
 }
 return {positions,colors,features};
}
