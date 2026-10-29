import * as THREE from 'three';
import { cityWalls, roofGeometry, type Building } from './world';
import { buildingOccludesPlayer } from './occlusion';

type Range = { wallStart:number;wallEnd:number;roofStart:number;roofEnd:number;building:Building;minX:number;maxX:number;minZ:number;maxZ:number };
/** Three fixed meshes: solid walls, faded walls and solid roofs. Geometry attributes
 * are built once; only triangle index lists change when the occluding set changes.
 * No custom GLSL, per-building draw calls, source-coordinate changes or collision edits.
 */
export function createCityVisibility(buildings:Building[]) {
  const walls:number[]=[],roofs:number[]=[],ranges:Range[]=[];
  for(const building of buildings){
    const wallStart=walls.length/3,roofStart=roofs.length/3;
    const wg=cityWalls([building]),rg=roofGeometry([building]);
    walls.push(...wg.getAttribute('position').array);roofs.push(...rg.getAttribute('position').array);wg.dispose();rg.dispose();
    const xs=building.footprint.map(p=>p[0]),zs=building.footprint.map(p=>p[1]);
    ranges.push({building,wallStart,wallEnd:walls.length/3,roofStart,roofEnd:roofs.length/3,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)});
  }
  const make=(positions:number[])=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingSphere();return g;};
  const solidGeometry=make(walls),roofBuffer=make(roofs),fadedGeometry=new THREE.BufferGeometry();
  fadedGeometry.setAttribute('position',solidGeometry.getAttribute('position'));
  fadedGeometry.setAttribute('normal',solidGeometry.getAttribute('normal'));fadedGeometry.computeBoundingSphere();
  const solid=new THREE.Mesh(solidGeometry,new THREE.MeshStandardMaterial({color:0x9c968a,roughness:1,side:THREE.DoubleSide}));
  const faded=new THREE.Mesh(fadedGeometry,new THREE.MeshStandardMaterial({color:0x9c968a,roughness:1,side:THREE.DoubleSide,transparent:true,opacity:.18,depthWrite:false}));
  const roof=new THREE.Mesh(roofBuffer,new THREE.MeshStandardMaterial({color:0x9c968a,roughness:1,side:THREE.DoubleSide}));
  solid.name='city-solid-walls';faded.name='city-occluding-walls';roof.name='city-visible-roofs';
  const group=new THREE.Group();group.name='source-preserving-city';group.add(solid,roof,faded);
  // Allocate index buffers once; reuse across movement to avoid GPU buffer churn.
  const normal=new Uint32Array(walls.length/3),ghost=new Uint32Array(walls.length/3),top=new Uint32Array(roofs.length/3);
  solidGeometry.setIndex(new THREE.BufferAttribute(normal,1).setUsage(THREE.DynamicDrawUsage));
  fadedGeometry.setIndex(new THREE.BufferAttribute(ghost,1).setUsage(THREE.DynamicDrawUsage));
  roofBuffer.setIndex(new THREE.BufferAttribute(top,1).setUsage(THREE.DynamicDrawUsage));
  let lastKey:string|null=null,lastX=NaN,lastZ=NaN;
  let fadedIds:string[]=[];
  function update(x:number,z:number):boolean {
    if(x===lastX&&z===lastZ)return false;lastX=x;lastZ=z;
    const hidden=new Set<string>();
    for(const r of ranges){
      // Camera ray projected into data coordinates is (40,-40).
      if(r.maxX<x||r.minX>x+40||r.maxZ<z-40||r.minZ>z)continue;
      if(buildingOccludesPlayer(r.building,x,z))hidden.add(r.building.id);
    }
    const key=[...hidden].join('|');if(key===lastKey)return false;lastKey=key;fadedIds=[...hidden];
    let n=0,g=0,t=0;
    for(const r of ranges){const occluded=hidden.has(r.building.id);for(let i=r.wallStart;i<r.wallEnd;i++){if(occluded)ghost[g++]=i;else normal[n++]=i;}if(!occluded)for(let i=r.roofStart;i<r.roofEnd;i++)top[t++]=i;}
    for(const [geometry,count] of [[solidGeometry,n],[fadedGeometry,g],[roofBuffer,t]] as const){geometry.setDrawRange(0,count);geometry.index!.needsUpdate=true;}
    return true;
  }
  update(-Infinity,Infinity);
  return {group,update,fadedIds:()=>[...fadedIds],stats:()=>({meshes:3,wallVertices:walls.length/3,roofVertices:roofs.length/3,solidIndices:solidGeometry.drawRange.count,fadedIndices:fadedGeometry.drawRange.count,roofIndices:roofBuffer.drawRange.count})};
}
