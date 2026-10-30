/** Stylised game simulation, not measured firearm data or a physical certification.
 * World coordinates use y-up. City collision can deliberately treat facades as
 * full-height walls. Rounds are transient: never replay a flight from a save.
 */
export type BallisticVector = { x: number; y: number; z: number };
export type Round = { position: BallisticVector; velocity: BallisticVector; travelled: number; range: number; damage: number; gravity: number; minimumDamageFactor: number; alive: boolean };
export type BallisticTarget = { id: string | number; x: number; z: number; radius: number; bottom: number; top: number };
export type BallisticImpact = { kind: 'target' | 'wall' | 'ground' | 'range'; position: BallisticVector; targetId?: string | number; damage: number };
export type BallisticBlocker = (x: number, y: number, z: number, radius: number) => boolean;
const finiteVector = (v: BallisticVector) => v && [v.x,v.y,v.z].every(Number.isFinite);
export function createRound(options: { origin: BallisticVector; direction: BallisticVector; speed: number; range: number; damage: number; gravity?: number; minimumDamageFactor?: number }): Round | null {
  const {origin,direction,speed,range,damage,gravity=9.8,minimumDamageFactor=.55}=options;
  if(!finiteVector(origin)||!finiteVector(direction)||![speed,range,damage,gravity,minimumDamageFactor].every(Number.isFinite)
    ||origin.y<0||speed<=0||speed>2000||range<=0||range>1000||damage<0||gravity<0||gravity>100||minimumDamageFactor<0||minimumDamageFactor>1)return null;
  const length=Math.hypot(direction.x,direction.y,direction.z);if(length<1e-8)return null;
  return {position:{...origin},velocity:{x:direction.x/length*speed,y:direction.y/length*speed,z:direction.z/length*speed},travelled:0,range,damage,gravity,minimumDamageFactor,alive:true};
}
/** Exact segment/cylinder intersection, including vertical extent and starts inside. */
function targetFraction(a:BallisticVector,b:BallisticVector,t:BallisticTarget):number|null {
  if(![t.x,t.z,t.radius,t.bottom,t.top].every(Number.isFinite)||t.radius<=0||t.top<t.bottom)return null;
  const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,ox=a.x-t.x,oz=a.z-t.z;
  const qa=dx*dx+dz*dz,qb=2*(ox*dx+oz*dz),qc=ox*ox+oz*oz-t.radius*t.radius;
  let lo=0,hi=1;
  if(qa<1e-16){if(qc>0)return null;}else{
    const discriminant=qb*qb-4*qa*qc;if(discriminant<0)return null;
    const root=Math.sqrt(discriminant);lo=Math.max(lo,(-qb-root)/(2*qa));hi=Math.min(hi,(-qb+root)/(2*qa));
  }
  if(Math.abs(dy)<1e-12){if(a.y<t.bottom||a.y>t.top)return null;}else{
    const v1=(t.bottom-a.y)/dy,v2=(t.top-a.y)/dy;lo=Math.max(lo,Math.min(v1,v2));hi=Math.min(hi,Math.max(v1,v2));
  }
  return lo<=hi&&lo>=0&&lo<=1?lo:null;
}
/** dt is game simulation time, not wall-clock time. Invalid dt leaves state unchanged.
 * Caller must stop invoking while paused and remove inactive rounds after impact.
 * Short segments plus a 6cm collider radius prevent thin-wall tunnelling when
 * blocked implements radius-aware city collision (as Shanghai's collides does).
 */
export function stepRound(round:Round,dt:number,targets:readonly BallisticTarget[],blocked:BallisticBlocker):BallisticImpact|null {
  if(!round.alive||!Number.isFinite(dt)||dt<=0||dt>1)return null;
  const finish=(kind:BallisticImpact['kind'],position:BallisticVector,targetId?:string|number):BallisticImpact=>{
    round.position=position;round.alive=false;
    const factor=1-(1-round.minimumDamageFactor)*Math.min(1,round.travelled/round.range);
    return {kind,position:{...position},...(targetId===undefined?{}:{targetId}),damage:kind==='target'?round.damage*factor:0};
  };
  if(blocked(round.position.x,round.position.y,round.position.z,.06))return finish('wall',{...round.position});
  let remaining=dt;
  while(remaining>1e-9){
    const speed=Math.hypot(round.velocity.x,round.velocity.y,round.velocity.z);
    const h=Math.min(remaining,1/120,.05/Math.max(speed,1));
    const a=round.position;
    let b={x:a.x+round.velocity.x*h,y:a.y+round.velocity.y*h-.5*round.gravity*h*h,z:a.z+round.velocity.z*h};
    const distance=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),left=round.range-round.travelled;
    let fraction=1,kind:BallisticImpact['kind']|null=null,targetId:string|number|undefined;
    if(distance>=left){fraction=Math.max(0,left/distance);kind='range';}
    if(b.y<=0&&a.y>=0){const ground=a.y/(a.y-b.y||1);if(ground<=fraction){fraction=ground;kind='ground';}}
    if(blocked(b.x,b.y,b.z,.06)){
      let low=0,high=1;
      for(let i=0;i<10;i++){const m=(low+high)/2;if(blocked(a.x+(b.x-a.x)*m,a.y+(b.y-a.y)*m,a.z+(b.z-a.z)*m,.06))high=m;else low=m;}
      if(high<=fraction){fraction=high;kind='wall';}
    }
    for(const target of targets){const f=targetFraction(a,b,target);if(f!==null&&f<fraction-1e-9){fraction=f;kind='target';targetId=target.id;}}
    round.travelled+=distance*fraction;
    b={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,z:a.z+(b.z-a.z)*fraction};
    if(kind)return finish(kind,b,targetId);
    round.position=b;round.velocity.y-=round.gravity*h;remaining-=h;
  }
  return null;
}
