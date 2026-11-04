import { rooftopDetails } from './rooftop-details';
import * as THREE from 'three';
import { cityWalls, roofGeometry, type Building } from './world';
import { buildingOccludesPlayer } from './occlusion';
import { lilongFacade } from './shanghai-details';
import { roofFrame, pitchedRoof } from './pitched-roof';
import { tiles } from './lane-houses';

type Range = { glowStart:number;glowEnd:number;wallStart:number;wallEnd:number;roofStart:number;roofEnd:number;tileStart:number;tileEnd:number;building:Building;minX:number;maxX:number;minZ:number;maxZ:number };
/** Four fixed meshes: solid walls, faded walls, flat roofs and grey-tile pitched roofs. Geometry attributes
 * are built once; only triangle index lists change when the occluding set changes.
 * No custom GLSL, per-building draw calls, source-coordinate changes or collision edits.
 */
export function createCityVisibility(buildings:Building[], lowRise = false, keepFlat:ReadonlySet<string> = new Set()) {
  const walls:number[]=[],roofs:number[]=[],wallColors:number[]=[],roofColors:number[]=[],ranges:Range[]=[];
  const tile:number[]=[],tileUV:number[]=[],tileColors:number[]=[];
  const glow:number[]=[],glowColors:number[]=[];
  for(const building of buildings){
    const glowStart=glow.length/3,wallStart=walls.length/3,roofStart=roofs.length/3,tileStart=tile.length/3;
    // Art-directed 2–3 storey interpretation. Never mutate survey data, footprints,
    // doors, save IDs or collision. This is not a claim of real building heights.
    let seed=2166136261;for(const c of building.id)seed=Math.imul(seed^c.charCodeAt(0),16777619);seed>>>=0;
    let rendered=lowRise?{...building,height_m:Math.min(building.height_m,6.4+(seed%3)*2.8)}:building;
    // Near-rectangular low-rise outlines get a grey-tile gable roof on their exact footprint (ridge <= 14 m).
    const frame=lowRise&&!keepFlat.has(building.id)?roofFrame(building.footprint,building.holes):null;
    const pitch=frame&&Math.min(rendered.height_m,13.85-.488*frame.half)>=5.5?frame:null;
    if(pitch)rendered={...rendered,height_m:Math.min(rendered.height_m,13.85-.488*pitch.half)};
    const wg=cityWalls([rendered]),rg=roofGeometry([rendered]);
    const wp=wg.getAttribute('position').array,rp=pitch?[]:rg.getAttribute('position').array;
    walls.push(...wp);roofs.push(...rp);
    const wallColor=new THREE.Color(lowRise?[0xb49a7c,0x9c7764,0xb8aa8c,0x8e9385,0xac8a70][seed%5]:0x9c968a);
    // Flat concrete roofs with tar patches, as on Shanghai's post-war blocks.
    const roofColor=new THREE.Color(lowRise?[0x6a6b67,0x5b5d5a,0x77756f,0x63605a][seed%4]:0x9c968a);
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
            // night: about a third of the panes lit, warm incandescent, orange or cool tube light
            const lit=((Math.imul(seed^(n*73856093)^Math.round(y*10)*19349663^i*83492791,2654435761)>>>0)%1000)/1000;
            if(lit<.34){const col=new THREE.Color(lit<.07?0x8fa2a6:lit<.2?0xd9963e:lit<.28?0xb46a2a:0xe0c590);
              const point=(t:number,yy:number)=>[a[0]+dx*t/len+ox*2.4,yy,-(a[1]+dz*t/len+oz*2.4)];
              const vs=[point(centre-.46,y+.02),point(centre+.46,y+.02),point(centre+.46,y+1.23),point(centre-.46,y+1.23)];
              for(const j of [0,1,2,0,2,3]){glow.push(...vs[j]);glowColors.push(col.r,col.g,col.b);}}
          }
        }
      }
    }
    if(lowRise){const detail=lilongFacade(rendered);walls.push(...detail.positions);wallColors.push(...detail.colors);}
    if(lowRise&&!pitch){const top=rooftopDetails(rendered);roofs.push(...top.positions);roofColors.push(...top.colors);}
    let occluder=rendered;
    if(pitch){
      const r=pitchedRoof(building.footprint,pitch,rendered.height_m),tone=new THREE.Color([0x4c4f51,0x56595a,0x434749,0x5d5f5d][seed%4]);
      const flat=(n:number)=>{for(let i=0;i<n;i++)tileUV.push(.03,.03);};
      tile.push(...r.roof);tileUV.push(...r.uv);for(let i=0;i<r.roof.length;i+=3)tileColors.push(tone.r,tone.g,tone.b);
      // gables carry the wall colour; the dark ridge cap runs along the long axis
      tile.push(...r.gables);flat(r.gables.length/3);for(let i=0;i<r.gables.length;i+=3)tileColors.push(wallColor.r,wallColor.g,wallColor.b);
      const [a,b]=r.ridge,ridge=[[a[0],r.top,-a[1]],[b[0],r.top,-b[1]],[b[0],r.top+.1,-b[1]],[a[0],r.top+.1,-a[1]]];
      for(const j of [0,1,2,0,2,3]){tile.push(...ridge[j]);tileColors.push(.18,.19,.2);}flat(6);
      occluder={...rendered,height_m:r.top};
    }
    wg.dispose();rg.dispose();
    const xs=building.footprint.map(p=>p[0]),zs=building.footprint.map(p=>p[1]);
    ranges.push({glowStart,glowEnd:glow.length/3,building:occluder,wallStart,wallEnd:walls.length/3,roofStart,roofEnd:roofs.length/3,tileStart,tileEnd:tile.length/3,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)});
  }
  const make=(positions:number[])=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingSphere();return g;};
  const solidGeometry=make(walls),roofBuffer=make(roofs),tileBuffer=make(tile),fadedGeometry=new THREE.BufferGeometry();
  tileBuffer.setAttribute('color',new THREE.Float32BufferAttribute(tileColors,3));tileBuffer.setAttribute('uv',new THREE.Float32BufferAttribute(tileUV,2));
  solidGeometry.setAttribute('color',new THREE.Float32BufferAttribute(wallColors,3));roofBuffer.setAttribute('color',new THREE.Float32BufferAttribute(roofColors,3));
  fadedGeometry.setAttribute('color',solidGeometry.getAttribute('color'));
  fadedGeometry.setAttribute('position',solidGeometry.getAttribute('position'));
  fadedGeometry.setAttribute('normal',solidGeometry.getAttribute('normal'));fadedGeometry.computeBoundingSphere();
  const solid=new THREE.Mesh(solidGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));
  const faded=new THREE.Mesh(fadedGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,transparent:true,opacity:.18,depthWrite:false}));
  const roof=new THREE.Mesh(roofBuffer,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));
  const tiled=new THREE.Mesh(tileBuffer,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide,map:tiles()}));
  solid.name='city-solid-walls';faded.name='city-occluding-walls';roof.name='city-visible-roofs';tiled.name='city-tile-roofs';
  const group=new THREE.Group();group.name='source-preserving-city';group.add(solid,roof,faded,tiled);
  // Night-only additive window glow, kept outside the four-mesh group; culled with its building.
  const glowGeometry=new THREE.BufferGeometry();glowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(glow,3));glowGeometry.setAttribute('color',new THREE.Float32BufferAttribute(glowColors,3));glowGeometry.computeBoundingSphere();
  const lit=new Uint32Array(glow.length/3);glowGeometry.setIndex(new THREE.BufferAttribute(lit,1).setUsage(THREE.DynamicDrawUsage));
  const glowMat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const glowMesh=new THREE.Mesh(glowGeometry,glowMat);glowMesh.name='city-night-windows';glowMesh.renderOrder=2;glowMesh.visible=false;
  const setNight=(amount:number)=>{const a=Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):0;glowMesh.visible=a>.02;glowMat.color.setScalar(a*1.5);};
  // Allocate index buffers once; reuse across movement to avoid GPU buffer churn.
  const normal=new Uint32Array(walls.length/3),ghost=new Uint32Array(walls.length/3),top=new Uint32Array(roofs.length/3),pitched=new Uint32Array(tile.length/3);
  solidGeometry.setIndex(new THREE.BufferAttribute(normal,1).setUsage(THREE.DynamicDrawUsage));
  fadedGeometry.setIndex(new THREE.BufferAttribute(ghost,1).setUsage(THREE.DynamicDrawUsage));
  roofBuffer.setIndex(new THREE.BufferAttribute(top,1).setUsage(THREE.DynamicDrawUsage));
  tileBuffer.setIndex(new THREE.BufferAttribute(pitched,1).setUsage(THREE.DynamicDrawUsage));
  let lastKey:string|null=null,lastX=NaN,lastZ=NaN;
  let fadedIds:string[]=[];
  let lastFocus:ReadonlyArray<readonly [number,number]>|undefined;
  function update(x:number,z:number,focus?:ReadonlyArray<readonly [number,number]>):boolean {
    // Focus is a precomputed immutable indoor grid, used only during room inspection.
    // Changing inspection mode must invalidate the cache even at stationary coordinates.
    if(x===lastX&&z===lastZ&&focus===lastFocus)return false;lastX=x;lastZ=z;lastFocus=focus;
    const hidden=new Set<string>();
    for(const r of ranges){
      // Same orthographic camera ray from every visible furniture-area focus point.
      const blocks=(px:number,pz:number)=>!(r.maxX<px||r.minX>px+40||r.maxZ<pz-40||r.minZ>pz)&&buildingOccludesPlayer(r.building,px,pz);
      if(blocks(x,z)||focus?.some(p=>blocks(p[0],p[1])))hidden.add(r.building.id);
    }
    const key=[...hidden].join('|');if(key===lastKey)return false;lastKey=key;fadedIds=[...hidden];
    let n=0,g=0,t=0,p=0,l=0;
    for(const r of ranges){const occluded=hidden.has(r.building.id);for(let i=r.wallStart;i<r.wallEnd;i++){if(occluded)ghost[g++]=i;else normal[n++]=i;}if(!occluded){for(let i=r.glowStart;i<r.glowEnd;i++)lit[l++]=i;for(let i=r.roofStart;i<r.roofEnd;i++)top[t++]=i;for(let i=r.tileStart;i<r.tileEnd;i++)pitched[p++]=i;}}
    for(const [geometry,count] of [[solidGeometry,n],[fadedGeometry,g],[roofBuffer,t],[tileBuffer,p],[glowGeometry,l]] as const){geometry.setDrawRange(0,count);geometry.index!.needsUpdate=true;}
    return true;
  }
  update(-Infinity,Infinity);
  return {group,glow:glowMesh,setNight,update,fadedIds:()=>[...fadedIds],stats:()=>({meshes:4,wallVertices:walls.length/3,roofVertices:roofs.length/3,tileVertices:tile.length/3,solidIndices:solidGeometry.drawRange.count,fadedIndices:fadedGeometry.drawRange.count,roofIndices:roofBuffer.drawRange.count,tileIndices:tileBuffer.drawRange.count})};
}
