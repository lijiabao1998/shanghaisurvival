/** Select an existing, reachable doorway. No city geometry/data is rewritten. */
export type Shelter = { id: string; door: [number, number]; outside: [number, number]; inside: [number, number] };
type Building = { id: string; footprint: [number, number][] };
export function selectShelter(buildings: Building[], spawn: [number, number], collides: (x:number,z:number,r:number)=>boolean, inside: (x:number,z:number)=>boolean): Shelter | null {
  const candidates: Shelter[] = [];
  for (const b of buildings) {
    let best=-1, length=2.8;
    b.footprint.forEach((a,i)=>{const c=b.footprint[(i+1)%b.footprint.length];const l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l>length){length=l;best=i;}});
    if(best<0) continue;
    const a=b.footprint[best], c=b.footprint[(best+1)%b.footprint.length];
    const door: [number,number]=[(a[0]+c[0])/2,(a[1]+c[1])/2];
    const nx=-(c[1]-a[1])/length,nz=(c[0]-a[0])/length;
    for(const side of [-1,1]) {
      const out: [number,number]=[door[0]+nx*side*1.8,door[1]+nz*side*1.8];
      const inn: [number,number]=[door[0]-nx*side*1.8,door[1]-nz*side*1.8];
      if(inside(...out)||!inside(...inn)) continue;
      let clear=true;
      for(let k=0;k<=18;k++){const t=k/18;if(collides(out[0]+(inn[0]-out[0])*t,out[1]+(inn[1]-out[1])*t,.4)){clear=false;break;}}
      if(clear)candidates.push({id:b.id,door,outside:out,inside:inn});
    }
  }
  return candidates.sort((a,b)=>Math.hypot(a.outside[0]-spawn[0],a.outside[1]-spawn[1])-Math.hypot(b.outside[0]-spawn[0],b.outside[1]-spawn[1]))[0]??null;
}
