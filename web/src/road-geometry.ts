import * as THREE from 'three';
export type StreetRoad = { id: string; centerline: [number,number][]; width_m: number; type: string; name?: string };
/** OSM centreline ribbons, in the exact same local metre coordinates as CMAB.
 * Widths are existing class estimates, not a new survey. No building is moved.
 * Two merged meshes keep draw calls independent of road/segment count.
 */
export function roadGeometries(roads: StreetRoad[]): {surface:THREE.BufferGeometry;edges:THREE.BufferGeometry;segments:number} {
  const vertices:number[]=[],colors:number[]=[],edges:number[]=[];
  let segments=0;
  const quad=(out:number[],ax:number,az:number,bx:number,bz:number,nx:number,nz:number,y:number)=>{
    for(const [x,z] of [[ax+nx,az+nz],[bx+nx,bz+nz],[bx-nx,bz-nz],[ax+nx,az+nz],[bx-nx,bz-nz],[ax-nx,az-nz]])out.push(x,y,-z);
  };
  for(const road of roads) {
    if(!Number.isFinite(road.width_m)||road.width_m<=0||road.width_m>60)continue;
    const color=new THREE.Color(['footway','pedestrian','path','steps'].includes(road.type)?0x818582:0x606466);
    const half=road.width_m/2;
    for(let i=1;i<road.centerline.length;i++){
      const a=road.centerline[i-1],b=road.centerline[i];
      if(![...a,...b].every(Number.isFinite))continue;
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<.01)continue;
      const nx=-dz/length,nz=dx/length;
      quad(vertices,a[0],a[1],b[0],b[1],nx*half,nz*half,.015);
      for(let k=0;k<6;k++)colors.push(color.r,color.g,color.b);
      for(const side of [-1,1])quad(edges,a[0]+nx*half*side,a[1]+nz*half*side,b[0]+nx*half*side,b[1]+nz*half*side,nx*.065,nz*.065,.025);
      segments++;
    }
  }
  const geometry=(p:number[])=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();g.computeBoundingBox();return g;};
  const surface=geometry(vertices);surface.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return {surface,edges:geometry(edges),segments};
}

/** Exact nearest segment, not a bounding-box guess; use OSM's original street name. */
export function nearbyRoadName(roads:StreetRoad[],x:number,z:number):string|null {
  let best=Infinity,name:string|null=null;
  for(const r of roads){
    if(!r.name||r.name.includes('\ufffd'))continue;
    for(let i=1;i<r.centerline.length;i++){
      const a=r.centerline[i-1],b=r.centerline[i],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz;
      if(!l2)continue;
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l2));
      const d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
      if(d<best&&d<=r.width_m/2+4){best=d;name=r.name;}
    }
  }
  return name;
}
