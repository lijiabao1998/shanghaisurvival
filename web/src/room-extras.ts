import {ITEM_IDS,type Inventory} from './campaign.ts';
import {INTERIOR_ROOM_CATALOG,type InteriorRoom} from './interior-rooms';
export type RoomExtra={id:string;buildingId:string;position:[number,number];item:'ammo'|'medkit'|'food';amount:number};
export type RoomExtraClaims=Record<string,boolean>;
const definition=(buildingId:string)=>{const row=INTERIOR_ROOM_CATALOG.find(([id])=>id===buildingId);if(!row)return null;return {id:`room-extra-v1:${buildingId}:${row[1]==='home'?'medkit':row[1]==='grocer'?'food':'ammo'}`,buildingId,item:row[1]==='home'?'medkit':row[1]==='grocer'?'food':'ammo',amount:1} as const;};
/** Extra item on the already validated central corridor, never replacing the original supply. */
export function planRoomExtras(rooms:readonly InteriorRoom[]):RoomExtra[]{return rooms.flatMap(room=>{const def=definition(room.buildingId);if(!def)return [];const {door,inside}=room.entrance,dx=inside[0]-door[0],dz=inside[1]-door[1],length=Math.hypot(dx,dz);if(!Number.isFinite(length)||length<.01)return [];const position:[number,number]=[door[0]+dx/length,door[1]+dz/length];if(room.loot.some(l=>Math.hypot(l.position[0]-position[0],l.position[1]-position[1])<1))return [];return [{...def,position}];});}
export function validRoomExtraClaims(v:unknown):v is RoomExtraClaims{return typeof v==='object'&&v!==null&&!Array.isArray(v)&&Object.keys(v).length<=64&&Object.entries(v).every(([id,value])=>/^(?:room-v1:[A-Za-z0-9_-]{1,128}:supply|room-extra-v1:[A-Za-z0-9_-]{1,128}:(?:ammo|medkit|food)|room-tool-v1:[A-Za-z0-9_-]{1,128}:(?:cleaver|wrench))$/.test(id)&&typeof value==='boolean');}
export function claimRoomExtra(claimed:RoomExtraClaims,inventory:Inventory,extra:RoomExtra):'claimed'|'already-claimed'|'invalid'|'full'{
 const def=definition(extra.buildingId);
 if(!def||extra.id!==def.id||extra.item!==def.item||extra.amount!==def.amount||!validRoomExtraClaims(claimed)||!inventory||Object.keys(inventory).length!==ITEM_IDS.length||!ITEM_IDS.every(id=>Number.isInteger(inventory[id])&&inventory[id]>=0&&inventory[id]<=1_000_000))return 'invalid';
 if(claimed[extra.id]===true)return 'already-claimed';if(!(extra.id in claimed)&&Object.keys(claimed).length>=64)return 'full';
 if(inventory[extra.item]>999-extra.amount)return 'full';inventory[extra.item]+=extra.amount;
 claimed[extra.id]=true;return 'claimed';
}
