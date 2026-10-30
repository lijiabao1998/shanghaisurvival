import * as THREE from 'three';
import { doorEdgeIndex, type Building } from './world';
import { INTERIOR_ROOM_CATALOG } from './interior-rooms';

/** Fictional readable shop signs, inspired by historic Menghua street photographs.
 * Never copies a real shop name/address or claims a surveyed facade. No collision/save state. */
export const FACADE_SIGN_CATALOG = INTERIOR_ROOM_CATALOG.map(([buildingId,kind],i)=>({
 buildingId,kind,title:kind==='home'?'里弄住家':kind==='grocer'?'街坊杂货':'弄口修理',
 subtitle:kind==='home'?'邻里生活':kind==='grocer'?'日用 · 食品':'修补 · 配件',
 plate:`里弄 ${String(i+1).padStart(2,'0')}`,color:kind==='repair'?'#344e48':'#713b32',
}));
export function facadeSignPlacement(b:Building){
 const edge=doorEdgeIndex(b.footprint);if(edge<0||b.height_m<4)return null;
 const a=b.footprint[edge],c=b.footprint[(edge+1)%b.footprint.length],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);if(len<5.2)return null;
 const area=b.footprint.reduce((s,p,i)=>{const q=b.footprint[(i+1)%b.footprint.length];return s+p[0]*q[1]-q[0]*p[1]},0),sign=area>=0?1:-1;
 const ux=dx/len,uz=dz/len,nx=sign*uz,nz=-sign*ux;
 const at=(u:number,y:number)=>[a[0]+ux*u+nx*.21,y,-(a[1]+uz*u+nz*.21)];
 return [at(len/2-1.25,2.55),at(len/2+1.25,2.55),at(len/2+1.25,3.37),at(len/2-1.25,3.37)];
}
/** One 1024² canvas atlas, shared material, at most nine signs. No remote font/assets.
 * Hidden together with occluding facades so the labels cannot float over interior view. */
export function createFacadeSignage(buildings:Building[]){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
 const ctx=canvas.getContext('2d');const group=new THREE.Group();group.name='fictional-menghua-shop-signs';
 if(!ctx)return {group,update:(_ids:readonly string[])=>{},stats:{signs:0,textures:0}};
 const tile=336,tileHeight=112;ctx.clearRect(0,0,1024,1024);
 for(const [i,s]of FACADE_SIGN_CATALOG.entries()){
  const x=i%3*tile,y=Math.floor(i/3)*tileHeight;ctx.fillStyle=s.color;ctx.fillRect(x,y,tile,tileHeight);
  ctx.strokeStyle='#ab8c65';ctx.lineWidth=5;ctx.strokeRect(x+8,y+8,tile-16,tileHeight-16);
  // Uneven horizontal weathering, restrained enough not to obscure characters.
  ctx.fillStyle='rgba(224,206,166,.09)';for(let j=0;j<5;j++)ctx.fillRect(x+13,y+15+j*19,310,2);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e1cf9f';
  ctx.font='bold 44px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';ctx.fillText(s.title,x+168,y+35,300);
  ctx.font='16px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';ctx.fillText(s.subtitle,x+168,y+69,290);
  ctx.fillStyle='#244e48';ctx.fillRect(x+103,y+84,130,24);ctx.strokeStyle='#a7b4a2';ctx.lineWidth=2;ctx.strokeRect(x+105,y+86,126,20);
  ctx.fillStyle='#e1e5d5';ctx.font='16px sans-serif';ctx.fillText(s.plate,x+168,y+96,120);
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=1;
 const material=new THREE.MeshStandardMaterial({map:texture,roughness:1,side:THREE.DoubleSide});
 const meshes:THREE.Mesh[]=[];
 for(const [i,s]of FACADE_SIGN_CATALOG.entries()){
  const b=buildings.find(b=>b.id===s.buildingId);if(!b)continue;const points=facadeSignPlacement(b);if(!points)continue;
  const u=i%3*tile/1024,v=1-Math.floor(i/3)*tileHeight/1024,w=tile/1024,h=tileHeight/1024;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([u,v-h,u+w,v-h,u+w,v,u,v],2));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.buildingId=s.buildingId;mesh.name=`fictional-sign:${s.buildingId}`;group.add(mesh);meshes.push(mesh);
 }
 return {group,update:(ids:readonly string[])=>{const hidden=new Set(ids);for(const mesh of meshes)mesh.visible=!hidden.has(mesh.userData.buildingId)},stats:{signs:meshes.length,textures:1}};
}
