import type { InteriorRoom } from './interior-rooms';
import { grantTool, type SurvivorSystems } from './survivor-systems';
import type { Arsenal } from './arsenal';
export type RoomTool={id:string;buildingId:string;tool:'cleaver'|'wrench';position:[number,number]};
const sites=[['cmab_327821_0','cleaver'],['cmab_327817_0','wrench']] as const;
/** Two explicit new objects; never replaces old supply IDs or regenerates loot. */
export function planRoomTools(rooms:readonly InteriorRoom[]):RoomTool[]{return sites.flatMap(([buildingId,tool])=>{
 const room=rooms.find(r=>r.buildingId===buildingId);if(!room)return [];
 const {door,inside}=room.entrance,dx=inside[0]-door[0],dz=inside[1]-door[1],l=Math.hypot(dx,dz);if(l<.01)return [];
 return [{id:`room-tool-v1:${buildingId}:${tool}`,buildingId,tool,position:[door[0]+dx/l*4.4,door[1]+dz/l*4.4] as [number,number]}];
});}
export function claimRoomTool(state:SurvivorSystems,arsenal:Arsenal,site:RoomTool,depleted:boolean):boolean{
 if(depleted||!sites.some(([id,tool])=>id===site.buildingId&&tool===site.tool&&site.id===`room-tool-v1:${id}:${tool}`))return false;
 return grantTool(state,arsenal,site.tool);
}
