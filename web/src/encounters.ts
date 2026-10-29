import { profileFor, type FactionId } from './factions';
import { sweepMove } from './combat';
import { viewHeight } from './view';
import type { StreetRoad } from './road-geometry';
type Point={x:number;z:number};
export type EncounterPlacement=Point&{faction:FactionId;source:'opening'|'road'|'fallback';patrol:Point|null};
export type EncounterOptions={count:number;spawn:Point;bounds:{minX:number;maxX:number;minY:number;maxY:number};roads:StreetRoad[];collides:(x:number,z:number,r:number)=>boolean;insideBuilding?:(x:number,z:number)=>boolean;rng?:()=>number;aspect?:number};
/** Pure projection for the existing (40,56,40) orthographic camera, data Z negated. */
export function inOpeningView(p:Point,spawn:Point,aspect=9/16):boolean {
  const dx=p.x-spawn.x,dz=p.z-spawn.z;
  const sx=(dx+dz)/Math.sqrt(2),sy=(dz-dx)*56/Math.sqrt(2*(40*40+56*56+40*40));
  const h=viewHeight(aspect,true);
  return Math.abs(sx)<h*aspect/2-1.2&&Math.abs(sy)<h/2-1.5;
}
/** Finite geometric placement; index always maps to profileFor(index), including unavailable slots. */
export function planEncounters(o:EncounterOptions):{placements:(EncounterPlacement|null)[];warnings:string[]} {
  if(!Number.isSafeInteger(o.count)||o.count<0||o.count>1000)throw new RangeError('count must be 0..1000');
  if(![o.spawn.x,o.spawn.z,...Object.values(o.bounds)].every(Number.isFinite)||o.bounds.maxX<=o.bounds.minX||o.bounds.maxY<=o.bounds.minY||o.bounds.maxX-o.bounds.minX>10000||o.bounds.maxY-o.bounds.minY>10000)throw new RangeError('finite ordered map bounds up to 10 km required');
  const placements:(EncounterPlacement|null)[]=Array(o.count).fill(null),warnings:string[]=[];
  const rng=o.rng??Math.random,random=()=>{const n=rng();return Number.isFinite(n)?Math.max(0,Math.min(.999999,n)):0;};
  const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
  const valid=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=o.bounds.minX+.5&&p.x<=o.bounds.maxX-.5&&p.z>=o.bounds.minY+.5&&p.z<=o.bounds.maxY-.5&&!o.collides(p.x,p.z,.4)&&!o.insideBuilding?.(p.x,p.z);
  const clear=(a:Point,b:Point)=>!sweepMove(a.x,a.z,b.x-a.x,b.z-a.z,.34,o.collides).blocked;
  const separated=(p:Point)=>placements.every(q=>!q||dist(q,p)>=1.3);
  const opening:Point[]=[];
  for(const radius of [10.5,12,14,16,17.5])for(let i=0;i<96;i++){
    const angle=i*Math.PI*2/96,p={x:o.spawn.x+Math.cos(angle)*radius,z:o.spawn.z+Math.sin(angle)*radius};
    if(valid(p)&&inOpeningView(p,o.spawn,o.aspect??9/16)&&clear(o.spawn,p))opening.push(p);
  }
  // Shuffle once for replayable seeded variety, never a fresh random fallback per enemy.
  const shuffle=<T>(a:T[])=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  shuffle(opening);
  for(const i of [0,2,4])if(i<o.count){const p=opening.find(separated);if(p)placements[i]={...p,faction:profileFor(i).id,source:'opening',patrol:null};else warnings.push(`Opening infected index ${i}: no separated 10–18m visible walkable point; use safe distant fallback.`);}
  type RoadPoint=Point&{road:string};
  const roadPoints:RoadPoint[]=[];
  for(const road of o.roads)for(let i=1;i<road.centerline.length;i++){
    const a=road.centerline[i-1],b=road.centerline[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(!Number.isFinite(length)||length<.1)continue;
    const steps=Math.min(256,Math.max(1,Math.ceil(length/4)));
    for(let k=0;k<=steps;k++){const t=k/steps,p={x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,road:road.id};if(valid(p))roadPoints.push(p);}
  }
  shuffle(roadPoints);
  const groups:Partial<Record<FactionId,{anchor:RoadPoint;used:number}>>={};
  for(let i=0;i<o.count;i++){
    if(placements[i])continue;
    const faction=profileFor(i).id,min=faction==='raider'?45:faction==='military'?30:faction==='police'?24:22;
    const allowed=(p:Point)=>dist(p,o.spawn)>=min&&separated(p);
    const group=groups[faction];
    let p:RoadPoint|undefined;
    if((faction==='military'||faction==='police')&&group&&group.used<3)p=roadPoints.find(q=>q.road===group.anchor.road&&dist(q,group.anchor)<=9&&allowed(q)&&clear(group.anchor,q));
    if(!p){p=roadPoints.find(allowed);if(p&&(faction==='military'||faction==='police'))groups[faction]={anchor:p,used:0};}
    if(p){
      if(groups[faction])groups[faction]!.used++;
      const patrol=roadPoints.find(q=>q.road===p!.road&&dist(q,p!)>=3&&dist(q,p!)<=9&&clear(p!,q));
      placements[i]={x:p.x,z:p.z,faction,source:'road',patrol:patrol?{x:patrol.x,z:patrol.z}:null};
      continue;
    }
    // Deterministic grid is a last resort for absent/blocked road data, never an unchecked point.
    let fallback:Point|null=null,examined=0;
    outer:for(let z=o.bounds.minY+1;z<o.bounds.maxY;z+=6)for(let x=o.bounds.minX+1;x<o.bounds.maxX;x+=6){if(++examined>25000)break outer;const q={x,z};if(valid(q)&&allowed(q)){fallback=q;break outer;}}
    if(fallback){placements[i]={...fallback,faction,source:'fallback',patrol:null};warnings.push(`Index ${i}: no road placement, validated outdoor grid fallback.`);}
    else warnings.push(`Index ${i}: no safe placement; slot unavailable, never spawn inside a wall.`);
  }
  return {placements,warnings};
}
