import * as THREE from 'three';
import { cityWalls, roofGeometry, type Building } from './world';
import { buildingOccludesPlayer } from './occlusion';

type Range = { wallStart:number;wallEnd:number;roofStart:number;roofEnd:number;building:Building;minX:number;maxX:number;minZ:number;maxZ:number };
/** Three fixed meshes: solid walls, faded walls and solid roofs. Geometry attributes
 * are built once; only triangle index lists change when the occluding set changes.
 * No custom GLSL, per-building draw calls, source-coordinate changes or collision edits.
 */
export function createCityVisibility(buildings:Building[], lowRise = false) {
  const walls:number[]=[],roofs:number[]=[],wallColors:number[]=[],roofColors:number[]=[],ranges:Range[]=[];
  for(const building of buildings){
    const wallStart=walls.length/3,roofStart=roofs.length/3;
    // Art-directed 2–3 storey interpretation. Never mutate survey data, footprints,
    // doors, save IDs or collision. This is not a claim of real building heights.
    let seed=2166136261;for(const c of building.id)seed=Math.imul(seed^c.charCodeAt(0),16777619);seed>>>=0;
    const rendered=lowRise?{...building,height_m:Math.min(building.height_m,6.4+(seed%3)*2.8)}:building;
    const wg=cityWalls([rendered]),rg=roofGeometry([rendered]);
    const wp=wg.getAttribute('position').array,rp=rg.getAttribute('position').array;
    walls.push(...wp);roofs.push(...rp);
    const wallColor=new THREE.Color(lowRise?[0xb49a7c,0x9c7764,0xb8aa8c,0x8e9385,0xac8a70][seed%5]:0x9c968a);
    const roofColor=new THREE.Color(lowRise?[0x725447,0x555b58,0x8c6551,0x69665c][seed%4]:0x9c968a);
    for(let i=0;i<wp.length;i+=3)wallColors.push(wallColor.r,wallColor.g,wallColor.b);
    for(let i=0;i<rp.length;i+=3)roofColors.push(roofColor.r,roofColor.g,roofColor.b);
    if(lowRise){
      // Batched inset-looking windows and eave bands: still only three meshes,
      // and every detail disappears with its building when it obscures the player.
      const ring=building.footprint;
      let area=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[0]*b[1]-b[0]*a[1];}
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
        if(len<3)continue;
        const outward=area>=0?1:-1,ox=outward*dz/len*.025,oz=-outward*dx/len*.025;
        const quad=(start:number,end:number,bottom:number,top:number,color:number)=>{
          const col=new THREE.Color(color);
          const point=(t:number,y:number)=>[a[0]+dx*t/len+ox,y,-(a[1]+dz*t/len+oz)];
          const vs=[point(start,bottom),point(end,bottom),point(end,top),point(start,top)];
          for(const j of [0,1,2,0,2,3]){walls.push(...vs[j]);wallColors.push(col.r,col.g,col.b);}
        };
        quad(.15,len-.15,rendered.height_m-.28,rendered.height_m-.08,0x625b4c);
        const count=Math.floor((len-1)/2.8);
        for(let n=0;n<count;n++){
          const centre=(n+1)*len/(count+1);
          for(let y=3.2;y+1.3<rendered.height_m-.3;y+=2.8){
            quad(centre-.63,centre+.63,y-.1,y+1.4,0xc6b99b);
            quad(centre-.48,centre+.48,y,y+1.25,(seed+n)%7===0?0x97754d:0x384b4d);
          }
        }
      }
    }
    wg.dispose();rg.dispose();
    const xs=building.footprint.map(p=>p[0]),zs=building.footprint.map(p=>p[1]);
    ranges.push({building:rendered,wallStart,wallEnd:walls.length/3,roofStart,roofEnd:roofs.length/3,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)});
  }
  const make=(positions:number[])=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingSphere();return g;};
  const solidGeometry=make(walls),roofBuffer=make(roofs),fadedGeometry=new THREE.BufferGeometry();
  solidGeometry.setAttribute('color',new THREE.Float32BufferAttribute(wallColors,3));roofBuffer.setAttribute('color',new THREE.Float32BufferAttribute(roofColors,3));
  fadedGeometry.setAttribute('color',solidGeometry.getAttribute('color'));
  fadedGeometry.setAttribute('position',solidGeometry.getAttribute('position'));
  fadedGeometry.setAttribute('normal',solidGeometry.getAttribute('normal'));fadedGeometry.computeBoundingSphere();
  const solid=new THREE.Mesh(solidGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));
  const faded=new THREE.Mesh(fadedGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,transparent:true,opacity:.18,depthWrite:false}));
  const roof=new THREE.Mesh(roofBuffer,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));
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
