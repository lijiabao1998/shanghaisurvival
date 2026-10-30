import * as THREE from 'three';
import {doorEdgeIndex,makeInsideTest,makeCollider,wallGridOf,type Building} from './world';
import type {StreetRoad} from './road-geometry';

type Bounds={minX:number;maxX:number;minY:number;maxY:number};
type Segment={a:[number,number];b:[number,number];dx:number;dz:number;len:number;half:number;road:number};
type Batch={p:number[];c:number[]};
/** Fine, low-contrast world-space aggregate; no raster assets/canvas or large tile motif. */
export function applyPavementGrain(material:THREE.MeshStandardMaterial,strength=.055){
 const amount=Math.max(0,Math.min(.1,strength));
 material.onBeforeCompile=shader=>{
  shader.uniforms.pavementGrainStrength={value:amount};
  shader.vertexShader='varying vec3 vPavementWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPavementWorld=(modelMatrix*vec4(position,1.0)).xyz;');
  shader.fragmentShader='varying vec3 vPavementWorld;\nuniform float pavementGrainStrength;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float grainA=fract(sin(dot(floor(vPavementWorld.xz*31.7),vec2(127.1,311.7)))*43758.5453);
    float grainB=fract(sin(dot(floor(vPavementWorld.xz*83.3),vec2(269.5,183.3)))*43758.5453);
    diffuseColor.rgb*=1.0+pavementGrainStrength*(grainA+grainB-1.0);`);
 };
 material.customProgramCacheKey=()=>`shanghai-neutral-pavement-v1-${amount}`;
 return material;
}
/** Original procedural streetscape, not a survey of pavement/tree positions.
 * Existing OSM ribbons, building footprints, doors, collision and saves are untouched.
 * Three merged meshes: paving, street furniture, emissive lamp heads. */
export function createStreetDetails(roads:StreetRoad[],buildings:Building[],bounds:Bounds){
  const segments:Segment[]=[],doors:[number,number][]=[];
  for(const b of buildings){const i=doorEdgeIndex(b.footprint);if(i>=0){const a=b.footprint[i],z=b.footprint[(i+1)%b.footprint.length];doors.push([(a[0]+z[0])/2,(a[1]+z[1])/2]);}}
  roads.forEach((r,road)=>{if(!Number.isFinite(r.width_m)||r.width_m<=0||r.width_m>60)return;
    for(let i=1;i<r.centerline.length;i++){const a=r.centerline[i-1],b=r.centerline[i];if(![...a,...b].every(Number.isFinite))continue;const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len>.01)segments.push({a,b,dx:dx/len,dz:dz/len,len,half:r.width_m/2,road});}});
  const block={buildings,spawn:[0,0] as [number,number]},inside=makeInsideTest(block),collides=makeCollider(wallGridOf(block));
  const paving:Batch={p:[],c:[]},furniture:Batch={p:[],c:[]},lights:Batch={p:[],c:[]};
  const face=(out:Batch,pts:number[][],color:number)=>{const c=new THREE.Color(color);for(const i of [0,1,2,0,2,3]){out.p.push(...pts[i]);out.c.push(c.r,c.g,c.b);}};
  const box=(out:Batch,x:number,z:number,w:number,d:number,y:number,h:number,color:number,ux=1,uz=0,topOnly=false)=>{
    const p=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>[x+ux*u-uz*v,y,-(z+uz*u+ux*v)]),top=p.map(v=>[v[0],y+h,v[2]]);
    face(out,top,color);if(!topOnly)for(let i=0;i<4;i++)face(out,[p[i],p[(i+1)%4],top[(i+1)%4],top[i]],color);
  };
  const onOtherRoad=(x:number,z:number,s:Segment,margin:number)=>segments.some(t=>{if(t===s)return false;const along=Math.max(0,Math.min(t.len,(x-t.a[0])*t.dx+(z-t.a[1])*t.dz));return Math.hypot(x-t.a[0]-along*t.dx,z-t.a[1]-along*t.dz)<t.half+margin;});
  const clear=(x:number,z:number,r:number,s:Segment)=>x-r>=bounds.minX&&x+r<=bounds.maxX&&z-r>=bounds.minY&&z+r<=bounds.maxY&&!inside(x,z)&&!collides(x,z,r)&&!doors.some(d=>Math.hypot(x-d[0],z-d[1])<r+2.4)&&!onOtherRoad(x,z,s,r);
  const occupied=new Set<string>(),props:Array<{x:number;z:number;kind:'tree'|'lamp'}>=[];
  let slabs=0,curbs=0,bevelledCurbs=0,treePits=0,lamps=0,joints=0,patches=0;
  for(const s of segments){if(s.half<3||['footway','pedestrian','path','steps','service','living_street'].includes(roads[s.road].type))continue;const nx=-s.dz,nz=s.dx;
    for(const side of [-1,1])for(let t=3;t<s.len-3;t+=4){
      if(slabs>=6000)break;
      const x=s.a[0]+s.dx*t+nx*(s.half+.78)*side,z=s.a[1]+s.dz*t+nz*(s.half+.78)*side;
      // All corners and edge midpoints must be clear; gaps preserve crossings and gateways.
      const pts=[[-1.96,-.65],[1.96,-.65],[1.96,.65],[-1.96,.65],[0,0],[0,-.65],[0,.65]];
      if(!pts.every(([u,v])=>clear(x+s.dx*u+nx*v,z+s.dz*u+nz*v,.08,s)))continue;
      const cell=`${Math.round(x)},${Math.round(z)}`;if(occupied.has(cell))continue;occupied.add(cell);
      // Continuous neutral gray margin, not alternating large decorative paving slabs.
      // Dimensions are conservative gameplay construction values, NOT measured photo dimensions.
      box(paving,x,z,4,1.3,.025,.065,0x969998,s.dx,s.dz,true);
      const seed=Math.abs(Math.floor(x*17+z*31));
      if(seed%3===0){const offset=((seed%11)/10-.5)*2.4;box(paving,x+s.dx*offset,z+s.dz*offset,.016,1.28,.091,.001,0x7f8381,s.dx,s.dz,true);joints++;}
      if(seed%7===0){const offset=((seed%13)/12-.5)*2;box(paving,x+s.dx*offset,z+s.dz*offset,.52,.32,.091,.001,0x8e9290,s.dx,s.dz,true);patches++;}
      slabs++;
      const cx=s.a[0]+s.dx*t+nx*(s.half+.12)*side,cz=s.a[1]+s.dz*t+nz*(s.half+.12)*side;
      // Historical p102/p301 show worn rounded noses, not pristine square bars.
      // A low-poly chamfer approximates that silhouette without extra meshes.
      // Same .18 m footprint/.11 m top as before; dimensions are not a survey.
      if(roads[s.road].id==='osm_40109239_0'){
      const section=[[-.09,.02],[-.09,.075],[-.045,.11],[.045,.11],[.09,.075],[.09,.02]];
      const end=(u:number,v:number,y:number)=>[cx+s.dx*u+nx*v,y,-(cz+s.dz*u+nz*v)];
      for(let i=0;i<section.length-1;i++){
        const [v,y]=section[i],[v2,y2]=section[i+1];
        face(paving,[end(-1.99,v,y),end(1.99,v,y),end(1.99,v2,y2),end(-1.99,v2,y2)],i===2?0xadb1ae:0xa0a5a1);
      }
      // Ends are capped with a convex fan; hidden bottom is deliberately omitted.
      for(const u of [-1.99,1.99]){
        const c=new THREE.Color(0x9da29e);
        for(let i=1;i<section.length-1;i++)for(const j of [0,i,i+1]){
          paving.p.push(...end(u,section[j][0],section[j][1]));paving.c.push(c.r,c.g,c.b);
        }
      }
      bevelledCurbs++;
      }else box(paving,cx,cz,3.98,.18,.02,.09,0xb6b9b7,s.dx,s.dz);
      curbs++;
      // Restrained curb joints and a dark drainage edge, with no full-width checker grid.
      for(const offset of [-1.31,.02,1.35])box(paving,cx+s.dx*offset,cz+s.dz*offset,.014,roads[s.road].id==='osm_40109239_0'?.086:.18,.111,.001,0x777d79,s.dx,s.dz,true);
      box(paving,cx-nx*.12*side,cz-nz*.12*side,3.98,.055,.026,.001,0x535957,s.dx,s.dz,true);
      // Outer verge only: never consume the 1.3 m pedestrian strip. Sparse props
      // are decorative, not invisible new collision or surveyed municipal objects.
      if(t<6||Math.round(t)%20!==7||props.length>=96)continue;
      const px=s.a[0]+s.dx*t+nx*(s.half+2.3)*side,pz=s.a[1]+s.dz*t+nz*(s.half+2.3)*side;
      if(!clear(px,pz,.8,s)||props.some(p=>Math.hypot(p.x-px,p.z-pz)<12))continue;
      const tree=props.length%2===0;props.push({x:px,z:pz,kind:tree?'tree':'lamp'});
      if(tree){
        box(furniture,px,pz,1.2,1.2,.02,.08,0x615e4b,s.dx,s.dz);
        for(const offset of [-.51,.51])box(furniture,px+nx*offset,pz+nz*offset,1.25,.12,.09,.08,0xb2aa91,s.dx,s.dz);
        box(furniture,px,pz,.19,.19,.1,2.9,0x9b9380);box(furniture,px+.07,pz,.12,.12,1.8,1.3,0x6e7161);
        // Small faceted plane-tree crown, no transparent leaf overdraw/extra mesh.
        const crown=new THREE.IcosahedronGeometry(.72,0);const p=crown.getAttribute('position'),c=new THREE.Color(0x788465);
        for(let i=0;i<p.count;i++){furniture.p.push(px+p.getX(i),3.3+p.getY(i)*.8,-pz+p.getZ(i));furniture.c.push(c.r,c.g,c.b);}crown.dispose();treePits++;
      }else{
        box(furniture,px,pz,.16,.16,.02,3.7,0x444d49);box(furniture,px,pz,.35,.35,.02,.18,0x64695d);
        box(furniture,px,pz,.48,.35,3.7,.08,0x404a46);
        box(lights,px,pz,.36,.25,3.53,.16,0xf1dcaa);lamps++;
      }
    }
  }
  const mesh=(b:Batch,material:THREE.Material)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));g.computeVertexNormals();if(b.p.length)g.computeBoundingBox();return new THREE.Mesh(g,material);};
  const stone=applyPavementGrain(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98,side:THREE.DoubleSide})),metal=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,side:THREE.DoubleSide});
  const lampMaterial=new THREE.MeshStandardMaterial({vertexColors:true,emissive:0xffd5a0,emissiveIntensity:0,roughness:.65});
  const group=new THREE.Group();group.name='shanghai-street-details';group.add(mesh(paving,stone),mesh(furniture,metal),mesh(lights,lampMaterial));
  return {group,stats:{slabs,curbs,bevelledCurbs,treePits,lamps,joints,patches,meshes:3,vertices:(paving.p.length+furniture.p.length+lights.p.length)/3},placements:props,
    setNight:(amount:number)=>{lampMaterial.emissiveIntensity=Number.isFinite(amount)?Math.max(0,Math.min(1,amount))*1.8:0;},
    dispose:()=>{for(const child of group.children)(child as THREE.Mesh).geometry.dispose();stone.dispose();metal.dispose();lampMaterial.dispose();}};
}
