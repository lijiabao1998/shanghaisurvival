/** Fictional low-rise infill proposal, NOT surveyed CMAB/OSM buildings.
 * Pure planning only: callers must opt new games into layout v2. Never append
 * to legacy block, base-wall validation, save IDs, bounds or container generation.
 */
import {type Building,type Point,makeInsideTest} from './world';
type Road={id:string;centerline:Point[];width_m:number};
type Source={buildings:Building[];roads:Road[];spawn:Point};
export const DENSITY_LAYOUT_VERSION='menghua-infill-v1' as const;
const SITES=[['01',212,320],['02',246,332],['03',244,348],['04',260,310]] as const;
const edges=(p:Point[])=>p.map((a,i)=>[a,p[(i+1)%p.length]] as [Point,Point]);
const distance=(p:Point,a:Point,b:Point)=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const cross=(a:Point,b:Point,p:Point)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function segmentDistance(a:Point,b:Point,c:Point,d:Point){
 const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
 if(ab1*ab2<=0&&cd1*cd2<=0&&Math.max(a[0],b[0])>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])>=Math.min(a[1],b[1]))return 0;
 return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
}
export function planDensityBuildings(source:Source,protectedPoints:Point[]=[]){
 const existingInside=makeInsideTest(source),all=source.buildings.flatMap(b=>b.footprint),bounds={minX:Math.min(...all.map(p=>p[0])),maxX:Math.max(...all.map(p=>p[0])),minY:Math.min(...all.map(p=>p[1])),maxY:Math.max(...all.map(p=>p[1]))};
 const accepted:Building[]=[],evidence:Array<{id:string;center:Point;wallClearance:number;roadClearance:number;spawnClearance:number}>=[],rejected:string[]=[];
 for(const [suffix,x,y] of SITES){
  const b:Building={id:`fictional:menghua-infill:v2:${suffix}`,footprint:[[x-3,y-2],[x+3,y-2],[x+3,y+2],[x-3,y+2]],holes:[],height_m:4.2},es=edges(b.footprint),inside=makeInsideTest({buildings:[b],spawn:source.spawn});
  let wallClearance=Infinity,roadClearance=Infinity;
  for(const old of [...source.buildings,...accepted])for(const ring of [old.footprint,...old.holes])for(const [a,z] of edges(ring))for(const [c,d] of es)wallClearance=Math.min(wallClearance,segmentDistance(a,z,c,d));
  for(const road of source.roads)for(let i=1;i<road.centerline.length;i++)for(const [a,z] of es)roadClearance=Math.min(roadClearance,segmentDistance(a,z,road.centerline[i-1],road.centerline[i])-road.width_m/2);
  const spawnClearance=Math.min(...es.map(([a,z])=>distance(source.spawn,a,z)));
  const invalid=b.footprint.some(p=>existingInside(...p)||p[0]<bounds.minX||p[0]>bounds.maxX||p[1]<bounds.minY||p[1]>bounds.maxY)||source.buildings.some(old=>old.footprint.some(p=>inside(...p)))||protectedPoints.some(p=>inside(...p)||es.some(([a,z])=>distance(p,a,z)<2))||wallClearance<3||roadClearance<2||spawnClearance<15||source.buildings.some(old=>old.id===b.id);
  if(invalid){rejected.push(b.id);continue;}accepted.push(b);evidence.push({id:b.id,center:[x,y],wallClearance,roadClearance,spawnClearance});
 }
 return {layoutVersion:DENSITY_LAYOUT_VERSION,buildings:accepted,evidence,rejected,bounds,provenance:'fictional gameplay infill; no claim of surveyed building existence'};
}
/** Legacy/missing versions stay legacy; no silent old-save relocation. */
export function densityEnabledForLayout(version:unknown){return version===DENSITY_LAYOUT_VERSION;}
